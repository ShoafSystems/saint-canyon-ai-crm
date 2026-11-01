import { describe, expect, it } from "bun:test";
import { demoDealIds, readDemoSeedSettings } from "../prisma/seed-demo";

describe("demo seed settings", () => {
	it("is off unless DEMO_SEED_OWNER_EMAIL is set", () => {
		expect(readDemoSeedSettings({})).toBeNull();
		expect(
			readDemoSeedSettings({ DEMO_LOGIN_EMAIL: "demo@x.test" }),
		).toBeNull();
	});

	it("reads both addresses, normalised", () => {
		expect(
			readDemoSeedSettings({
				DEMO_SEED_OWNER_EMAIL: " Owner@X.test ",
				DEMO_LOGIN_EMAIL: "Demo@X.test",
			}),
		).toEqual({ ownerEmail: "owner@x.test", memberEmail: "demo@x.test" });
	});

	it("refuses to make the demo user the owner", () => {
		expect(() =>
			readDemoSeedSettings({
				DEMO_SEED_OWNER_EMAIL: "demo@x.test",
				DEMO_LOGIN_EMAIL: "DEMO@x.test",
			}),
		).toThrow(/never the owner/);
	});
});

describe("demo deal picks", () => {
	const open = (id: string) => ({ id, closedAt: null });
	const closed = (id: string) => ({ id, closedAt: new Date(0) });

	it("takes every other open deal and every third closed one, by id", () => {
		const deals = [
			open("d"),
			closed("z1"),
			open("a"),
			open("c"),
			closed("z2"),
			open("b"),
			closed("z3"),
			closed("z4"),
		];

		expect(demoDealIds(deals)).toEqual(["a", "c", "z1", "z4"]);
	});

	it("is stable whatever order the rows arrive in", () => {
		const deals = [open("a"), open("b"), open("c"), closed("x")];

		expect(demoDealIds([...deals].reverse())).toEqual(demoDealIds(deals));
	});
});
