import { describe, expect, it } from "bun:test";
import { DemoRateLimiter } from "../src/demo/demo-rate-limit";

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

	it("refuses new keys when the table is full of live windows", () => {
		let now = 0;
		const limiter = new DemoRateLimiter(
			{ windowMs: 1000, maxPerWindow: 1, maxTrackedKeys: 2 },
			() => now,
		);

		expect(limiter.take("a")).toBe(true);
		expect(limiter.take("b")).toBe(true);
		expect(limiter.take("c")).toBe(false);

		now = 1000;
		expect(limiter.take("c")).toBe(true);
	});
});
