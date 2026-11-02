// What the shared public demo user may not do over tRPC and the REST bridge.
// Reads stay open so the demo is worth clicking through; writes that touch
// instance-wide settings, credentials, linked accounts, other people, or a
// paid service are refused.

// Every mutation on these routers is refused.
const BLOCKED_ROUTERS = new Set([
	"agents",
	"apiKeys",
	"currency",
	"google",
	"mcp",
	"microsoft",
	"settings",
	"slack",
	"sso",
	"tracking",
	"workspace",
]);

// Single mutations elsewhere that start agent turns, call a paid research
// service, or publish data outside the CRM.
const BLOCKED_PROCEDURES = new Set([
	"companies.bulkEnrich",
	"companies.enrich",
	"companies.research",
	"contacts.bulkEnrich",
	"contacts.enrich",
	"conversations.answerBuilderApproval",
	"conversations.answerBuilderQuestion",
	"conversations.createBuilder",
	"conversations.createShare",
	"conversations.setBuilderPermissionMode",
	"conversations.submitBuilder",
	"fields.backfill",
]);

export type DemoCall = {
	path: string;
	type: "query" | "mutation" | "subscription";
	viaRestBridge: boolean;
	viaApiKey: boolean;
};

export function isRefusedForDemo(call: DemoCall): boolean {
	// The demo is a browser tour; scripted access is not part of it.
	if (call.viaRestBridge || call.viaApiKey) return true;
	if (call.type !== "mutation") return false;

	const router = call.path.split(".")[0] ?? "";
	return BLOCKED_ROUTERS.has(router) || BLOCKED_PROCEDURES.has(call.path);
}
