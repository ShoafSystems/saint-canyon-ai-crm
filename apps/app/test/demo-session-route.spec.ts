import { afterEach, describe, expect, it, mock } from "bun:test";

const nextServer = await import("next/server");
mock.module("next/server", () => ({
	...nextServer,
	connection: async () => {},
}));

const { API_URL } = await import("../lib/env");
const { DEMO_SIGN_IN_URL } = await import("../lib/demo");
const { POST } = await import("../app/demo/session/route");

const realFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = realFetch;
});

function capture(upstream: Response) {
	const calls: { url: string; init: RequestInit }[] = [];
	globalThis.fetch = (async (url: string, init: RequestInit) => {
		calls.push({ url: String(url), init });
		return upstream;
	}) as typeof fetch;
	return calls;
}

function enterDemo(headers: Record<string, string>): Request {
	return new Request("https://demo.example.ts.net/demo/session", {
		method: "POST",
		headers,
	});
}

describe("Enter demo form", () => {
	it("posts to the app's own origin, not the API", () => {
		expect(DEMO_SIGN_IN_URL).toBe("/demo/session");
	});
});

describe("POST /demo/session on the app", () => {
	it("forwards Origin and X-Forwarded-For verbatim, and nothing else", async () => {
		const calls = capture(new Response(null, { status: 303 }));

		await POST(
			enterDemo({
				origin: "https://demo.example.ts.net",
				"x-forwarded-for": "198.51.100.7, 203.0.113.9",
				cookie: "visitor=1",
				"user-agent": "Browser/1.0",
			}),
		);

		expect(calls).toHaveLength(1);
		expect(calls[0]?.url).toBe(`${API_URL}/demo/session`);
		expect(calls[0]?.init.method).toBe("POST");
		expect(calls[0]?.init.redirect).toBe("manual");
		const sent = new Headers(calls[0]?.init.headers);
		expect([...sent.keys()].sort()).toEqual(["origin", "x-forwarded-for"]);
		expect(sent.get("origin")).toBe("https://demo.example.ts.net");
		expect(sent.get("x-forwarded-for")).toBe("198.51.100.7, 203.0.113.9");
	});

	it("passes the redirect and session cookie back for the app host", async () => {
		const upstream = new Response(null, { status: 303 });
		upstream.headers.set("location", "https://demo.example.ts.net/");
		upstream.headers.append(
			"set-cookie",
			"crm.session_token=abc; Path=/; HttpOnly; Secure; SameSite=Lax",
		);
		capture(upstream);

		const response = await POST(
			enterDemo({ origin: "https://demo.example.ts.net" }),
		);

		expect(response.status).toBe(303);
		expect(response.headers.get("location")).toBe(
			"https://demo.example.ts.net/",
		);
		const cookies = response.headers.getSetCookie();
		expect(cookies).toHaveLength(1);
		expect(cookies[0]).not.toContain("Domain=");
		expect(response.headers.get("cache-control")).toBe("no-store");
	});

	it("keeps the API's refusal", async () => {
		capture(
			Response.json(
				{ message: "Cross-origin demo sign-in is refused." },
				{ status: 403 },
			),
		);

		const response = await POST(enterDemo({ origin: "https://evil.example" }));

		expect(response.status).toBe(403);
	});

	it("answers 502 when the API is down", async () => {
		globalThis.fetch = (async () => {
			throw new Error("ECONNREFUSED");
		}) as unknown as typeof fetch;

		const response = await POST(enterDemo({}));

		expect(response.status).toBe(502);
	});
});
