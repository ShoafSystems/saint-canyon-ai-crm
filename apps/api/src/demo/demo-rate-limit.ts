import { isIPv4, isIPv6 } from "node:net";
import { DEMO_LOGIN } from "./demo-config";

type Window = { startedAt: number; count: number };

export class DemoRateLimiter {
	// Insertion order is oldest first: a key is deleted and re-added whenever
	// its window restarts.
	private readonly windows = new Map<string, Window>();

	constructor(
		private readonly limits: {
			windowMs: number;
			maxPerWindow: number;
			maxTrackedKeys: number;
		} = DEMO_LOGIN.rateLimit,
		private readonly now: () => number = Date.now,
	) {}

	take(address: string): boolean {
		const key = rateLimitKey(address);
		const at = this.now();
		const current = this.windows.get(key);

		if (current && at - current.startedAt < this.limits.windowMs) {
			if (current.count >= this.limits.maxPerWindow) return false;
			current.count += 1;
			return true;
		}

		this.windows.delete(key);
		this.makeRoom(at);

		this.windows.set(key, { startedAt: at, count: 1 });
		return true;
	}

	// A full table drops expired windows, then the oldest live ones, so a flood
	// of fresh addresses can never lock everyone else out.
	private makeRoom(at: number): void {
		if (this.windows.size < this.limits.maxTrackedKeys) return;

		for (const [key, window] of this.windows) {
			if (at - window.startedAt >= this.limits.windowMs) {
				this.windows.delete(key);
			}
		}

		for (const key of this.windows.keys()) {
			if (this.windows.size < this.limits.maxTrackedKeys) return;
			this.windows.delete(key);
		}
	}
}

/**
 * One bucket per IPv4 address and per IPv6 /64. A single IPv6 host usually
 * owns a whole /64, so keying by full address would hand it 2^64 buckets.
 */
export function rateLimitKey(address: string): string {
	const bare = address.trim().toLowerCase().split("%")[0] ?? "";

	const mapped = bare.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
	if (mapped?.[1] && isIPv4(mapped[1])) return mapped[1];
	if (!isIPv6(bare)) return bare;

	const [head = "", tail] = bare.split("::");
	const headGroups = head ? head.split(":") : [];
	const tailGroups = tail ? tail.split(":") : [];
	const width = (groups: string[]) =>
		groups.reduce((sum, group) => sum + (group.includes(".") ? 2 : 1), 0);

	const groups =
		tail === undefined
			? headGroups
			: [
					...headGroups,
					...Array<string>(8 - width(headGroups) - width(tailGroups)).fill("0"),
					...tailGroups,
				];

	const prefix = groups
		.slice(0, 4)
		.map((group) => group.replace(/^0+(?=.)/, ""))
		.join(":");
	return `${prefix}::/64`;
}
