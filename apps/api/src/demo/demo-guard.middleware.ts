import { API_KEY_HEADER } from "@crm/auth/api-keys";
import { DEMO_DISABLED_MESSAGE, isDemoAccount } from "@crm/auth/demo";
import { Injectable } from "@nestjs/common";
import { TRPCError } from "@trpc/server";
import type {
	MiddlewareOptions,
	MiddlewareResponse,
	TRPCMiddleware,
} from "nestjs-trpc";
import type { BaseTrpcContext } from "../trpc/context.types";
import { REST_BRIDGE_PATH } from "../trpc/openapi";
import { runAsDemoActor } from "./demo-actor";
import { isRefusedForDemo } from "./demo-policy";

@Injectable()
export class DemoGuardMiddleware implements TRPCMiddleware {
	async use(opts: MiddlewareOptions): Promise<MiddlewareResponse> {
		const ctx = opts.ctx as BaseTrpcContext;
		if (!isDemoAccount(ctx.session?.user.email)) return opts.next();

		const refused = isRefusedForDemo({
			path: opts.path,
			type: opts.type,
			viaRestBridge:
				ctx.req?.originalUrl.startsWith(`${REST_BRIDGE_PATH}/`) ?? false,
			viaApiKey: Boolean(ctx.req?.headers[API_KEY_HEADER]),
		});

		if (refused) {
			throw new TRPCError({
				code: "FORBIDDEN",
				message: DEMO_DISABLED_MESSAGE,
			});
		}

		// Writes the demo may make still must not start agent work: no events
		// for operator-deployed agents, no research turns.
		return runAsDemoActor(() => opts.next());
	}
}
