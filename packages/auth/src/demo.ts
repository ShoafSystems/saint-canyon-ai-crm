import "@crm/env/load";

export const DEMO_DISABLED_MESSAGE = "Disabled in the public demo.";

export type DemoLoginSettings = {
	enabled: boolean;
	email: string | undefined;
};

type Source = Record<string, string | undefined>;

export function readDemoLoginSettings(
	source: Source = process.env,
): DemoLoginSettings {
	const email = normalise(source.DEMO_LOGIN_EMAIL);
	return {
		enabled: source.DEMO_LOGIN_ENABLED === "true",
		email,
	};
}

/**
 * The one check for "this is the shared public demo account". Exact address
 * match only, and only while demo sign-in is switched on.
 */
export function isDemoUser(
	email: string | null | undefined,
	source: Source = process.env,
): boolean {
	const settings = readDemoLoginSettings(source);
	return (
		settings.enabled &&
		settings.email !== undefined &&
		normalise(email) === settings.email
	);
}

/**
 * The demo account for the guards: the configured address, whether or not
 * demo sign-in is on. Switching the flag off must not turn a demo session
 * that is still alive into an unrestricted member, so the guards keep
 * refusing it until `disable-demo` has revoked it (deploy/forge).
 */
export function isDemoAccount(
	email: string | null | undefined,
	source: Source = process.env,
): boolean {
	const settings = readDemoLoginSettings(source);
	return settings.email !== undefined && normalise(email) === settings.email;
}

/**
 * The demo address, when demo sign-in may be offered. A domain entry in
 * ALLOWED_SIGN_IN is not enough: the exact address has to be listed, so a
 * domain allow-list can never quietly turn the demo on.
 */
export function demoLoginEmail(
	source: Source = process.env,
): string | undefined {
	const settings = readDemoLoginSettings(source);
	if (!settings.enabled || !settings.email) return undefined;

	const listed = (source.ALLOWED_SIGN_IN ?? "")
		.split(",")
		.map((entry) => normalise(entry))
		.filter((entry) => entry?.includes("@"));

	return listed.includes(settings.email) ? settings.email : undefined;
}

function normalise(value: string | null | undefined): string | undefined {
	const trimmed = value?.trim().toLowerCase();
	return trimmed ? trimmed : undefined;
}
