import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";

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
fallback("GOOGLE_CLIENT_ID", "test-google-client-id");
fallback("GOOGLE_CLIENT_SECRET", "test-google-client-secret");
// Mounts /oauth2/link, unless another spec already loaded auth without it.
fallback("SLACK_CLIENT_ID", "test-slack-client-id");
fallback("SLACK_CLIENT_SECRET", "test-slack-client-secret");

const SUFFIX = "demo-guard-spec";
const DEMO_EMAIL = `demo.${SUFFIX}@demo.example`;
const OWNER_EMAIL = `owner.${SUFFIX}@example.com`;
const MEMBER_EMAIL = `member.${SUFFIX}@example.com`;
const DISABLED = "Disabled in the public demo.";

process.env.DEMO_LOGIN_ENABLED = "true";
process.env.DEMO_LOGIN_EMAIL = DEMO_EMAIL;
process.env.ALLOWED_SIGN_IN = `example.com,${DEMO_EMAIL}`;

const { db } = await import("@crm/db");
const { ensureWorkspaceMembership } = await import("@crm/auth/organization");
const { SESSION_COOKIE_NAME } = await import("@crm/auth/cookies");
const { appUrl, env } = await import("@crm/auth/env");

type Caller = { name: "demo" | "member"; cookie: string };

let app: INestApplication;
let demo: Caller;
let member: Caller;

async function signCookie(token: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(process.env.BETTER_AUTH_SECRET),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const signature = await crypto.subtle.sign(
		"HMAC",
		key,
		new TextEncoder().encode(token),
	);
	const value = `${token}.${Buffer.from(signature).toString("base64")}`;
	return `${SESSION_COOKIE_NAME}=${encodeURIComponent(value)}`;
}

async function seedUser(label: string, email: string): Promise<string> {
	const user = await db.user.create({
		data: {
			id: `${SUFFIX}-${label}`,
			email,
			name: label,
			emailVerified: true,
			updatedAt: new Date(),
		},
		select: { id: true },
	});
	await ensureWorkspaceMembership(user.id);
	return user.id;
}

async function memberSession(userId: string): Promise<string> {
	const token = `${SUFFIX}-session-${crypto.randomUUID()}`;
	await db.session.create({
		data: {
			id: token,
			token,
			userId,
			expiresAt: new Date(Date.now() + 60 * 60 * 1000),
			updatedAt: new Date(),
		},
	});
	return signCookie(token);
}

async function clear(): Promise<void> {
	const users = await db.user.findMany({
		where: { email: { in: [DEMO_EMAIL, OWNER_EMAIL, MEMBER_EMAIL] } },
		select: { id: true },
	});
	const ids = users.map((user) => user.id);
	await db.apikey.deleteMany({ where: { referenceId: { in: ids } } });
	await db.session.deleteMany({ where: { userId: { in: ids } } });
	await db.account.deleteMany({ where: { userId: { in: ids } } });
	await db.member.deleteMany({ where: { userId: { in: ids } } });
	await db.user.deleteMany({ where: { id: { in: ids } } });
}

function trpcMutation(caller: Caller, path: string, input: unknown = {}) {
	return request(app.getHttpServer())
		.post(`/api/trpc/${path}`)
		.set("Origin", appUrl)
		.set("Cookie", caller.cookie)
		.send(input as object);
}

function trpcQuery(caller: Caller, path: string) {
	return request(app.getHttpServer())
		.get(`/api/trpc/${path}`)
		.set("Origin", appUrl)
		.set("Cookie", caller.cookie);
}

function authCall(
	caller: Caller,
	method: "get" | "post",
	path: string,
	body: object = {},
) {
	const call = request(app.getHttpServer())
		[method](`/api/auth${path}`)
		.set("Origin", appUrl)
		.set("Cookie", caller.cookie);
	return method === "post" ? call.send(body) : call;
}

function refusedByDemoGuard(response: request.Response): boolean {
	const message = response.body?.error?.message ?? response.body?.message ?? "";
	return response.status === 403 && message === DISABLED;
}

beforeAll(async () => {
	await clear();
	await seedUser("owner", OWNER_EMAIL);
	const memberId = await seedUser("member", MEMBER_EMAIL);

	const { createApp } = await import("../src/create-app");
	app = await createApp();

	const signIn = await request(app.getHttpServer())
		.post("/demo/session")
		.set("Origin", appUrl)
		.expect(303);
	const setCookie = [signIn.headers["set-cookie"] ?? []].flat();
	const session = setCookie.find((cookie) =>
		cookie.startsWith(`${SESSION_COOKIE_NAME}=`),
	);
	if (!session) throw new Error("The demo sign-in set no session cookie.");

	demo = { name: "demo", cookie: session.split(";")[0] ?? "" };
	member = { name: "member", cookie: await memberSession(memberId) };
});

afterAll(async () => {
	await app?.close();
	await clear();
});

describe("demo sign-in", () => {
	it("keeps the visitor a member and stores nothing that identifies them", async () => {
		const user = await db.user.findUniqueOrThrow({
			where: { email: DEMO_EMAIL },
			select: { id: true, members: { select: { role: true } } },
		});
		expect(user.members.map((row) => row.role)).toEqual(["member"]);

		const sessions = await db.session.findMany({
			where: { userId: user.id },
			select: { ipAddress: true, userAgent: true },
		});
		expect(sessions.length).toBeGreaterThan(0);
		for (const session of sessions) {
			expect(session.ipAddress).toBeNull();
			expect(session.userAgent).toBeNull();
		}
	});
});

// One or more per router or endpoint group named in the review.
const blockedMutations: [string, unknown][] = [
	["apiKeys.create", { name: "scripted", expiresInDays: 365 }],
	["apiKeys.revoke", { id: "anything" }],
	["settings.setAgentModel", { model: "anthropic/claude-opus-5-5" }],
	["settings.setResearchKey", { apiKey: "ctx_live_planted" }],
	["settings.setArchiveRetention", { days: 1 }],
	["google.syncNow", {}],
	["google.revokeAccess", {}],
	["microsoft.syncNow", {}],
	["slack.disconnect", {}],
	["mcp.start", { provider: "linear" }],
	["sso.register", {}],
	["tracking.setFlag", { enabled: true }],
	["workspace.update", { name: "Renamed by a visitor" }],
	["workspace.setMemberRole", { userId: "x", role: "owner" }],
	["currency.refreshRates", {}],
	["agents.revise", { id: "x" }],
	["agents.deploy", { id: "x" }],
	["agents.runNow", { id: "x" }],
	["conversations.createBuilder", {}],
	["conversations.submitBuilder", { id: "x", message: "build me an agent" }],
	["conversations.createShare", { id: "x" }],
	["companies.research", { id: "x" }],
	["companies.enrich", { id: "x" }],
	["contacts.enrich", { id: "x" }],
	["fields.backfill", { id: "x" }],
	["companies.purge", { id: "x" }],
	["companies.bulkPurge", { ids: ["x"] }],
	["contacts.purge", { id: "x" }],
	["contacts.bulkPurge", { ids: ["x"] }],
	["deals.purge", { id: "x" }],
	["deals.bulkPurge", { ids: ["x"] }],
	["fields.delete", { id: "x" }],
	["savedViews.delete", { id: "x" }],
	["conversations.remove", { id: "x" }],
];

describe("tRPC mutations the demo user may not make", () => {
	for (const [path, input] of blockedMutations) {
		it(`${path}: demo gets 403, a member is not stopped by the demo guard`, async () => {
			const asDemo = await trpcMutation(demo, path, input);
			expect(asDemo.status).toBe(403);
			expect(asDemo.body.error.message).toBe(DISABLED);

			const asMember = await trpcMutation(member, path, input);
			expect(refusedByDemoGuard(asMember)).toBe(false);
		});
	}
});

describe("what the demo user can still do", () => {
	it("reads the CRM", async () => {
		await trpcQuery(demo, "users.list").expect(200);
		await trpcQuery(demo, "settings.agentModel").expect(200);
	});

	it("is told it is the demo user, and a member is not", async () => {
		const asDemo = await trpcQuery(demo, "users.me").expect(200);
		expect(asDemo.body.result.data.demo).toBe(true);

		const asMember = await trpcQuery(member, "users.me").expect(200);
		expect(asMember.body.result.data.demo).toBe(false);
	});

	it("writes to the CRM without queueing any agent work", async () => {
		const tasksFor = async (caller: Caller) => {
			const domain = `${caller.name}-${crypto.randomUUID()}.${SUFFIX}.test`;
			await trpcMutation(caller, "companies.create", {
				name: `Trigger probe (${caller.name})`,
				domain,
			}).expect(200);
			const company = await db.company.findFirstOrThrow({
				where: { domain },
				select: { id: true },
			});
			const tasks = await db.agentTask.findMany({
				where: { companyId: company.id },
				select: { kind: true },
			});
			await db.agentTask.deleteMany({ where: { companyId: company.id } });
			await db.company.delete({ where: { id: company.id } });
			return tasks.map((task) => task.kind);
		};

		expect(await tasksFor(demo)).toEqual([]);
		expect((await tasksFor(member)).length).toBeGreaterThan(0);
	});
});

describe("REST bridge", () => {
	it("is closed to the demo user and open to a member", async () => {
		const asDemo = await request(app.getHttpServer())
			.get("/rest/users")
			.set("Cookie", demo.cookie);
		expect(asDemo.status).toBe(403);

		await request(app.getHttpServer())
			.get("/rest/users")
			.set("Cookie", member.cookie)
			.expect(200);
	});
});

const blockedAuthCalls: ["get" | "post", string, object][] = [
	["post", "/api-key/create", { name: "scripted", expiresIn: 31_536_000 }],
	["get", "/api-key/list", {}],
	["post", "/link-social", { provider: "google", callbackURL: "/" }],
	["get", "/list-sessions", {}],
	["post", "/revoke-sessions", {}],
	["post", "/revoke-session", { token: "x" }],
	["post", "/revoke-other-sessions", {}],
	["post", "/update-user", { name: "Pwned" }],
	["post", "/change-email", { newEmail: "visitor@example.com" }],
	["post", "/change-password", { currentPassword: "a", newPassword: "b" }],
	["post", "/delete-user", {}],
	[
		"post",
		"/organization/invite-member",
		{ email: "x@example.com", role: "member" },
	],
];

describe("Better Auth endpoints the demo user may not call", () => {
	for (const [method, path, body] of blockedAuthCalls) {
		it(`${method.toUpperCase()} ${path}: demo gets 403`, async () => {
			const response = await authCall(demo, method, path, body);
			expect(response.status).toBe(403);
			expect(response.body.message).toBe(DISABLED);
		});
	}

	it("POST /oauth2/link: demo gets 403 whenever the route is mounted", async () => {
		// Not "slack": the Slack connect guard runs first and refuses members on
		// its own, which would hide whether this guard fired.
		const response = await authCall(demo, "post", "/oauth2/link", {
			providerId: "any-provider",
			callbackURL: "/",
		});
		if (!env.slack) {
			expect(response.status).toBe(404);
			return;
		}
		expect(response.status).toBe(403);
		expect(response.body.message).toBe(DISABLED);
	});

	it("still lets a member list their sessions and make an API key", async () => {
		const sessions = await authCall(member, "get", "/list-sessions");
		expect(sessions.status).toBe(200);

		const key = await authCall(member, "post", "/api-key/create", {
			name: "member key",
		});
		expect(key.status).toBe(200);
	});

	it("leaves the demo user's name alone", async () => {
		const user = await db.user.findUniqueOrThrow({
			where: { email: DEMO_EMAIL },
			select: { name: true },
		});
		expect(user.name).toBe("Demo");
	});
});
