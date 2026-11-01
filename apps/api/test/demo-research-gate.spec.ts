import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const fallback = (key: string, value: string) => {
	if (!process.env[key]) {
		process.env[key] = value;
	}
};

fallback(
	"DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm?schema=public",
);
fallback(
	"TEST_DATABASE_URL",
	"postgresql://postgres:postgres@localhost:5432/crm_test?schema=public",
);
fallback("BETTER_AUTH_SECRET", "test-secret-at-least-32-characters-long");
fallback("API_URL", "http://localhost:3001");

const { isDemoUser } = await import("@crm/auth/demo");
const { SettingsService } = await import("../src/settings/settings.service");

const DEMO_EMAIL = "demo@demo.example";
const KEYS = ["DEMO_LOGIN_ENABLED", "DEMO_LOGIN_EMAIL"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) saved[key] = process.env[key];
	process.env.DEMO_LOGIN_ENABLED = "true";
	process.env.DEMO_LOGIN_EMAIL = DEMO_EMAIL;
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

function settingsWith(contextDevApiKey: string | null) {
	const db = {
		appSetting: { findUnique: async () => ({ contextDevApiKey }) },
	};
	// Only researchKey() is exercised; it touches nothing but the database.
	return new SettingsService(
		db as never,
		null as never,
		null as never,
		null as never,
	);
}

describe("isDemoUser", () => {
	it("matches the demo address only while demo sign-in is on", () => {
		expect(isDemoUser(DEMO_EMAIL)).toBe(true);
		expect(isDemoUser(" Demo@Demo.Example ")).toBe(true);
		expect(isDemoUser("rep@demo.example")).toBe(false);
		expect(isDemoUser(undefined)).toBe(false);

		process.env.DEMO_LOGIN_ENABLED = "false";
		expect(isDemoUser(DEMO_EMAIL)).toBe(false);
	});
});

describe("research-key gate in demo mode", () => {
	it("waives the gate for the demo user without claiming a key", async () => {
		expect(await settingsWith(null).researchKey(DEMO_EMAIL)).toEqual({
			configured: false,
			hint: null,
			waived: true,
		});
	});

	it("still requires a key from everyone else", async () => {
		expect(await settingsWith(null).researchKey("rep@demo.example")).toEqual({
			configured: false,
			hint: null,
			waived: false,
		});

		process.env.DEMO_LOGIN_ENABLED = "false";
		expect((await settingsWith(null).researchKey(DEMO_EMAIL)).waived).toBe(
			false,
		);
	});

	it("reports a real key as configured and nothing as waived", async () => {
		const result =
			await settingsWith("ctx_live_abcd1234").researchKey(DEMO_EMAIL);

		expect(result.configured).toBe(true);
		expect(result.waived).toBe(false);
	});
});
