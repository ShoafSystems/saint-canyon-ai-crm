export const MAX_TRUSTED_PROXY_HOPS = 5;

/**
 * How many reverse proxies in front of the API to believe about the client
 * address. Unset or 0 trusts none, so `req.ip` is the socket peer. A demo
 * behind one proxy that appends to X-Forwarded-For (Tailscale Funnel) sets 1,
 * and `req.ip` becomes the address that proxy saw — whatever the client wrote
 * into the header itself is ignored.
 */
export function trustProxyHops(
	source: Record<string, string | undefined> = process.env,
): number {
	const raw = source.TRUST_PROXY_HOPS?.trim();
	if (!raw) return 0;

	const hops = Number(raw);
	if (!Number.isInteger(hops) || hops < 0 || hops > MAX_TRUSTED_PROXY_HOPS) {
		throw new Error(
			`TRUST_PROXY_HOPS must be a whole number from 0 to ${MAX_TRUSTED_PROXY_HOPS}.`,
		);
	}
	return hops;
}

export function applyTrustProxy(
	app: { set(setting: string, value: unknown): unknown },
	source: Record<string, string | undefined> = process.env,
): number {
	const hops = trustProxyHops(source);
	if (hops > 0) app.set("trust proxy", hops);
	return hops;
}
