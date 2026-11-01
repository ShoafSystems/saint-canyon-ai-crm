import { DEMO_LOGIN } from "./demo-config";

type Window = { startedAt: number; count: number };

export class DemoRateLimiter {
	private readonly windows = new Map<string, Window>();

	constructor(
		private readonly limits: {
			windowMs: number;
			maxPerWindow: number;
			maxTrackedKeys: number;
		} = DEMO_LOGIN.rateLimit,
		private readonly now: () => number = Date.now,
	) {}

	take(key: string): boolean {
		const at = this.now();
		const current = this.windows.get(key);

		if (current && at - current.startedAt < this.limits.windowMs) {
			if (current.count >= this.limits.maxPerWindow) return false;
			current.count += 1;
			return true;
		}

		this.windows.delete(key);
		if (!this.hasRoom(at)) return false;

		this.windows.set(key, { startedAt: at, count: 1 });
		return true;
	}

	private hasRoom(at: number): boolean {
		if (this.windows.size < this.limits.maxTrackedKeys) return true;

		for (const [key, window] of this.windows) {
			if (at - window.startedAt >= this.limits.windowMs) {
				this.windows.delete(key);
			}
		}

		return this.windows.size < this.limits.maxTrackedKeys;
	}
}
