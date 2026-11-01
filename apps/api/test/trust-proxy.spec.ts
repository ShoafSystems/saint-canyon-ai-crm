import { describe, expect, it } from "bun:test";
import { ExpressAdapter } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import request from "supertest";
import { applyTrustProxy, trustProxyHops } from "../src/config/trust-proxy";

function appWith(source: Record<string, string | undefined>) {
	const app = new ExpressAdapter().getInstance();
	applyTrustProxy(app, source);
	app.get("/ip", (req: Request, res: Response) => {
		res.json({ ip: req.ip });
	});
	return app;
}

describe("trust proxy", () => {
	it("trusts nothing unless configured", async () => {
		expect(trustProxyHops({})).toBe(0);

		const { body } = await request(appWith({}))
			.get("/ip")
			.set("X-Forwarded-For", "203.0.113.9");

		expect(body.ip).not.toBe("203.0.113.9");
	});

	it("keys on the address the one trusted proxy appended", async () => {
		const app = appWith({ TRUST_PROXY_HOPS: "1" });

		// A client forging the header gets its forgery ignored: the funnel
		// appends the address it observed, and only that last hop is believed.
		const { body } = await request(app)
			.get("/ip")
			.set("X-Forwarded-For", "198.51.100.1, 203.0.113.9");

		expect(body.ip).toBe("203.0.113.9");
	});

	it("refuses a value that is not a small whole number", () => {
		expect(() => trustProxyHops({ TRUST_PROXY_HOPS: "true" })).toThrow(
			/TRUST_PROXY_HOPS/,
		);
		expect(() => trustProxyHops({ TRUST_PROXY_HOPS: "-1" })).toThrow();
		expect(() => trustProxyHops({ TRUST_PROXY_HOPS: "99" })).toThrow();
	});
});
