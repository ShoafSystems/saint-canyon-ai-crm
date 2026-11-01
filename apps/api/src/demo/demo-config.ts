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

export type DemoLoginSettings = {
	enabled: boolean;
	email: string | undefined;
};

export function readDemoLoginSettings(
	source: Record<string, string | undefined> = process.env,
): DemoLoginSettings {
	const email = source.DEMO_LOGIN_EMAIL?.trim().toLowerCase();
	return {
		enabled: source.DEMO_LOGIN_ENABLED === "true",
		email: email ? email : undefined,
	};
}
