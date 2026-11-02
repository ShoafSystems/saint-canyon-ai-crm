export const API_PROXY_PREFIX = "/api/";

/**
 * The API URL the /api/* proxy may forward a request to, or null. URL parsing
 * collapses dot segments, including encoded ones (`/api/%2e%2e/internal`) and
 * backslashes, so the check runs on the URL that will actually be fetched: it
 * must stay on the API origin and under /api/. A segment that only decodes to
 * a dot segment or a slash (`..%2f`) is refused as well, in case a server
 * further on decodes it before routing.
 */
export function apiProxyTarget(requestUrl: string, apiUrl: string): URL | null {
	const { pathname, search } = new URL(requestUrl);
	const target = new URL(`${apiUrl}${pathname}${search}`);

	if (target.origin !== new URL(apiUrl).origin) return null;
	if (!target.pathname.startsWith(API_PROXY_PREFIX)) return null;
	if (target.pathname.split("/").some(isUnsafeSegment)) return null;

	return target;
}

function isUnsafeSegment(segment: string): boolean {
	let decoded: string;
	try {
		decoded = decodeURIComponent(segment);
	} catch {
		return true;
	}
	return (
		decoded === "." ||
		decoded === ".." ||
		decoded.includes("/") ||
		decoded.includes("\\")
	);
}
