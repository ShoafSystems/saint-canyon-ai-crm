import { afterEach, describe, expect, it, mock } from "bun:test";

const nextServer = await import("next/server");
mock.module("next/server", () => ({
	...nextServer,
	connection: async () => {},
}));

const { apiProxyTarget } = await import("../lib/api-proxy-target");
const { GET, POST } = await import("../app/api/[...path]/route");

const API = "http://127.0.0.1:3101";
const APP = "https://demo.example.ts.net";

// Ways to climb out of /api/ once a URL parser or a server further on has
// normalised or decoded the path.
const escapes = [
	"/api/%2e%2e/",
	"/api/%2e%2e/internal/sync/rates",
	"/api/%2E%2E/internal/sync/rates",
	"/api/.%2e/internal/sync/rates",
	"/api/%2e./internal/sync/rates",
	"/api/../internal/sync/rates",
	"/api/trpc/../../internal/sync/rates",
	"/api/%2e%2e%2finternal/sync/rates",
	"/api/..%2finternal/sync/rates",
	"/api/..%2Finternal/sync/rates",
	"/api/..%5cinternal/sync/rates",
	"/api\\..\\internal/sync/rates",
	"/api/%2e%2e/rest/users",
	"/api/%",
];

const realFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = realFetch;
});

function capture() {
	const calls: string[] = [];
	globalThis.fetch = (async (url: string | URL) => {
		calls.push(String(url));
		return new Response("{}", {
			status: 200,
			headers: { "content-type": "application/json" },
		});
	}) as typeof fetch;
	return calls;
}

// Next may hand the handler the path as the client sent it; new Request()
// would normalise it first, so build the raw shape the handler reads.
function rawRequest(path: string, method = "GET"): Request {
	return {
		url: `${APP}${path}`,
		method,
		headers: new Headers({ origin: APP }),
		body: null,
	} as unknown as Request;
}

describe("apiProxyTarget", () => {
	it("forwards ordinary API paths unchanged, query included", () => {
		expect(
			apiProxyTarget(`${APP}/api/trpc/users.me?batch=1`, API)?.href,
		).toBe(`${API}/api/trpc/users.me?batch=1`);
		expect(apiProxyTarget(`${APP}/api/auth/get-session`, API)?.href).toBe(
			`${API}/api/auth/get-session`,
		);
		expect(
			apiProxyTarget(`${APP}/api/trpc/a.b,c.d?input=%7B%7D`, API)?.pathname,
		).toBe("/api/trpc/a.b,c.d");
	});

	for (const path of escapes) {
		it(`refuses ${path}`, () => {
			expect(apiProxyTarget(`${APP}${path}`, API)).toBeNull();
		});
	}

	it("never leaves the API origin", () => {
		expect(apiProxyTarget(`${APP}//evil.example/api/x`, API)?.origin ?? API).toBe(
			API,
		);
		expect(apiProxyTarget(`${APP}/api/@evil.example/x`, API)?.origin).toBe(API);
	});
});

describe("/api/* route handler", () => {
	for (const path of escapes) {
		it(`answers 404 for ${path} and fetches nothing`, async () => {
			const calls = capture();
			const response = await GET(rawRequest(path));
			expect(response.status).toBe(404);
			expect(calls).toEqual([]);

			const post = await POST(rawRequest(path, "POST"));
			expect(post.status).toBe(404);
			expect(calls).toEqual([]);
		});
	}

	it("refuses the already-normalised form too (/internal, /)", async () => {
		const calls = capture();
		for (const path of escapes.slice(0, 3)) {
			const normalised = new Request(`${APP}${path}`);
			expect(new URL(normalised.url).pathname.startsWith("/api/")).toBe(false);
			expect((await GET(normalised)).status).toBe(404);
		}
		expect(calls).toEqual([]);
	});

	it("still proxies a normal API call", async () => {
		const calls = capture();
		const response = await GET(rawRequest("/api/trpc/users.me?batch=1"));
		expect(response.status).toBe(200);
		expect(calls).toHaveLength(1);
		expect(new URL(calls[0] ?? "").pathname).toBe("/api/trpc/users.me");
	});
});
