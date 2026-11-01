const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;

export const DEMO_LOGIN = {
	session: { lifetimeMs: 2 * HOUR_MS },
	rateLimit: {
		windowMs: 10 * MINUTE_MS,
		maxPerWindow: 5,
		maxTrackedKeys: 10_000,
	},
	user: { idPrefix: "demo-", idHexLength: 20, name: "Demo" },
	token: { bytes: 32 },
} as const;
