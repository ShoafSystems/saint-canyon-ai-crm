import { connection } from "next/server";
import { API_URL } from "@/lib/env";

// The "Enter demo" form posts here, on the app's own origin, and this hands
// the request to the API server-side. The browser never needs to reach the
// API, and the session cookie the API sets comes back on the app host.
//
// Only what the API's demo sign-in reads is forwarded:
// - Origin, unchanged, so the API's trusted-origin check still judges what
//   the browser sent.
// - X-Forwarded-For, unchanged. The edge proxy (Tailscale Funnel) appends the
//   client address; `next start` only fills the header in when it is missing
//   and this route appends nothing. So the rightmost entry the API sees is the
//   one the edge wrote, and TRUST_PROXY_HOPS=1 picks it out. Without an edge
//   proxy (loopback), Next fills in its socket peer and that is what counts.
const FORWARDED = ["origin", "x-forwarded-for"];

export async function POST(request: Request): Promise<Response> {
	await connection();

	const headers = new Headers();
	for (const name of FORWARDED) {
		const value = request.headers.get(name);
		if (value !== null) headers.set(name, value);
	}

	let upstream: Response;
	try {
		upstream = await fetch(`${API_URL}/demo/session`, {
			method: "POST",
			headers,
			redirect: "manual",
			cache: "no-store",
		});
	} catch {
		return Response.json(
			{ error: "The demo sign-in is not reachable." },
			{ status: 502, headers: { "cache-control": "no-store" } },
		);
	}

	const response = new Headers({ "cache-control": "no-store" });
	for (const name of ["content-type", "location", "retry-after"]) {
		const value = upstream.headers.get(name);
		if (value !== null) response.set(name, value);
	}
	for (const cookie of upstream.headers.getSetCookie()) {
		response.append("set-cookie", cookie);
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: response,
	});
}
