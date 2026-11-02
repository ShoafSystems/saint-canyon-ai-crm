import type { BetterAuthPlugin } from "better-auth";
import {
	APIError,
	createAuthMiddleware,
	getSessionFromCtx,
} from "better-auth/api";
import { DEMO_DISABLED_MESSAGE, isDemoAccount } from "./demo";

// Every visitor shares the demo user, so anything that mints a credential,
// links a personal account, shows or ends other visitors' sessions, or edits
// the account is refused for it.
const BLOCKED_PATHS = new Set([
	"/link-social",
	"/oauth2/link",
	"/unlink-account",
	"/list-sessions",
	"/revoke-other-sessions",
	"/update-user",
	"/change-email",
	"/change-password",
	"/set-password",
]);

const BLOCKED_PREFIXES = [
	"/api-key/",
	"/revoke-session",
	"/delete-user",
	"/organization/",
	"/sso/",
];

export function isDemoBlockedAuthPath(path: string): boolean {
	return (
		BLOCKED_PATHS.has(path) ||
		BLOCKED_PREFIXES.some((prefix) => path.startsWith(prefix))
	);
}

export const demoGuard = () =>
	({
		id: "demo-guard",
		hooks: {
			before: [
				{
					matcher: (context) => isDemoBlockedAuthPath(context.path ?? ""),
					handler: createAuthMiddleware(async (ctx) => {
						const session = await getSessionFromCtx(ctx);
						if (session && isDemoAccount(session.user.email)) {
							throw new APIError("FORBIDDEN", {
								message: DEMO_DISABLED_MESSAGE,
							});
						}
					}),
				},
			],
		},
	}) satisfies BetterAuthPlugin;
