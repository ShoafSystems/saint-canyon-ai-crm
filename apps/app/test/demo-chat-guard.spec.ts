import { beforeEach, describe, expect, it, mock } from "bun:test";

const DEMO_EMAIL = "demo@demo.example";

let signedInAs = DEMO_EMAIL;

// connection() needs a live Next request; every other export stays real so
// specs that share this process still get the genuine module.
const nextServer = await import("next/server");
mock.module("next/server", () => ({
	...nextServer,
	connection: async () => {},
}));
mock.module("@/lib/session", () => ({
	getSession: async () => ({
		user: { id: "user-1", email: signedInAs, name: "Visitor" },
	}),
}));

process.env.AGENT_BRIDGE_SECRET ??= "test-bridge-secret";

const { POST } = await import("../app/eve/v1/[...path]/route");

beforeEach(() => {
	process.env.DEMO_LOGIN_ENABLED = "true";
	process.env.DEMO_LOGIN_EMAIL = DEMO_EMAIL;
	signedInAs = DEMO_EMAIL;
});

function startChat(): Request {
	return new Request("http://localhost:3000/eve/v1/session", {
		method: "POST",
		headers: {
			"content-type": "application/json",
			"x-crm-contact": "a".repeat(25),
		},
		body: JSON.stringify({ message: "hello" }),
	});
}

describe("chat turns for the public demo user", () => {
	it("refuses to start an agent turn", async () => {
		const response = await POST(startChat());

		expect(response.status).toBe(403);
		expect(await response.json()).toEqual({
			error: "Disabled in the public demo.",
		});
	});

	it("leaves a normal member's turn alone", async () => {
		signedInAs = "rep@example.com";

		const response = await POST(startChat());

		expect(response.status).not.toBe(403);
	});
});
