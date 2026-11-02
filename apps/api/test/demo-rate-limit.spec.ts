import { describe, expect, it } from "bun:test";
import { DemoRateLimiter, rateLimitKey } from "../src/demo/demo-rate-limit";

describe("DemoRateLimiter", () => {
	it("allows a burst, refuses the next, and resets after the window", () => {
		let now = 0;
		const limiter = new DemoRateLimiter(
			{ windowMs: 1000, maxPerWindow: 2, maxTrackedKeys: 10 },
			() => now,
		);

		expect(limiter.take("a")).toBe(true);
		expect(limiter.take("a")).toBe(true);
		expect(limiter.take("a")).toBe(false);
		expect(limiter.take("b")).toBe(true);

		now = 1000;
		expect(limiter.take("a")).toBe(true);
	});

	it("evicts the oldest key instead of refusing a new one when full", () => {
		let now = 0;
		const limiter = new DemoRateLimiter(
			{ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 2 },
			() => now,
		);

		expect(limiter.take("a")).toBe(true);
		now = 10;
		expect(limiter.take("b")).toBe(true);
		now = 20;
		expect(limiter.take("c")).toBe(true);

		// "a" was evicted, so it starts a fresh window; "c" is still counted.
		expect(limiter.take("a")).toBe(true);
		expect(limiter.take("c")).toBe(false);
	});

	it("shares one bucket across an IPv6 /64", () => {
		const limiter = new DemoRateLimiter(
			{ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 10 },
			() => 0,
		);

		expect(limiter.take("2001:db8:1:2::1")).toBe(true);
		expect(limiter.take("2001:db8:1:2:ffff:ffff:ffff:ffff")).toBe(false);
		expect(limiter.take("2001:db8:1:3::1")).toBe(true);
	});
});

describe("rateLimitKey", () => {
	it("keys IPv4 by address and IPv6 by /64", () => {
		expect(rateLimitKey("203.0.113.7")).toBe("203.0.113.7");
		expect(rateLimitKey("::ffff:203.0.113.7")).toBe("203.0.113.7");
		expect(rateLimitKey("2001:0db8:0001:0002:0:0:0:1")).toBe(
			"2001:db8:1:2::/64",
		);
		expect(rateLimitKey("2001:db8::1")).toBe("2001:db8:0:0::/64");
		expect(rateLimitKey("fe80::1%eth0")).toBe("fe80:0:0:0::/64");
		expect(rateLimitKey("::1")).toBe("0:0:0:0::/64");
		expect(rateLimitKey("unknown")).toBe("unknown");
	});
});
