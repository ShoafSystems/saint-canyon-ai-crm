import { describe, expect, it } from "bun:test";
import { isDemoBlockedAuthPath } from "@crm/auth/demo-guard";
import { isRefusedForDemo } from "../src/demo/demo-policy";

const call = (
	path: string,
	type: "query" | "mutation" = "mutation",
	via: { viaRestBridge?: boolean; viaApiKey?: boolean } = {},
) => ({
	path,
	type,
	viaRestBridge: via.viaRestBridge ?? false,
	viaApiKey: via.viaApiKey ?? false,
});

describe("isRefusedForDemo", () => {
	it("refuses every mutation on the sensitive routers", () => {
		for (const path of [
			"agents.update",
			"apiKeys.create",
			"currency.setReportingCurrency",
			"google.setAutoCreate",
			"mcp.reviewTools",
			"microsoft.purgeSyncedData",
			"settings.setAgentModel",
			"slack.createChannel",
			"sso.remove",
			"tracking.rotateSiteId",
			"workspace.setMemberRole",
		]) {
			expect(isRefusedForDemo(call(path))).toBe(true);
		}
	});

	it("refuses agent turns, paid research and public shares", () => {
		for (const path of [
			"conversations.submitBuilder",
			"conversations.createShare",
			"companies.research",
			"contacts.bulkEnrich",
			"fields.backfill",
		]) {
			expect(isRefusedForDemo(call(path))).toBe(true);
		}
	});

	it("refuses every permanent delete", () => {
		for (const path of [
			"companies.purge",
			"companies.bulkPurge",
			"contacts.purge",
			"contacts.bulkPurge",
			"deals.purge",
			"deals.bulkPurge",
			"fields.delete",
			"savedViews.delete",
			"conversations.remove",
		]) {
			expect(isRefusedForDemo(call(path))).toBe(true);
		}
	});

	it("leaves reads and ordinary CRM edits alone", () => {
		expect(isRefusedForDemo(call("settings.agentModel", "query"))).toBe(false);
		expect(isRefusedForDemo(call("google.thread", "query"))).toBe(false);
		expect(isRefusedForDemo(call("deals.setStage"))).toBe(false);
		expect(isRefusedForDemo(call("contacts.update"))).toBe(false);
		expect(isRefusedForDemo(call("deals.archive"))).toBe(false);
		expect(isRefusedForDemo(call("companies.bulkArchive"))).toBe(false);
	});

	it("refuses anything over the REST bridge or with an API key", () => {
		expect(
			isRefusedForDemo(call("users.list", "query", { viaRestBridge: true })),
		).toBe(true);
		expect(
			isRefusedForDemo(call("users.list", "query", { viaApiKey: true })),
		).toBe(true);
	});
});

describe("isDemoBlockedAuthPath", () => {
	it("covers credentials, linking, sessions and account edits", () => {
		for (const path of [
			"/api-key/create",
			"/api-key/list",
			"/link-social",
			"/oauth2/link",
			"/list-sessions",
			"/revoke-session",
			"/revoke-sessions",
			"/revoke-other-sessions",
			"/update-user",
			"/change-email",
			"/change-password",
			"/delete-user",
			"/delete-user/callback",
			"/organization/invite-member",
			"/sso/register",
		]) {
			expect(isDemoBlockedAuthPath(path)).toBe(true);
		}
	});

	it("leaves sign-in, sign-out and the session read alone", () => {
		for (const path of [
			"/get-session",
			"/sign-out",
			"/sign-in/social",
			"/ok",
		]) {
			expect(isDemoBlockedAuthPath(path)).toBe(false);
		}
	});
});
