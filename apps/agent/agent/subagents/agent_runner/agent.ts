import { db } from "@crm/db";
import { defaultAgentModel } from "@crm/db/settings";
import { defineAgent, defineDynamic } from "eve";
import { resolveModel } from "../../lib/model";
import { attribute, purposeOf } from "../../lib/session-purpose";

export default defineAgent({
	description:
		"Execute one immutable deployed CRM agent version and persist its result and every side effect.",
	model: defineDynamic({
		events: {
			"session.started": async (_event, ctx) => {
				if (purposeOf(ctx) !== "team-agent") {
					return resolveModel(defaultAgentModel());
				}
				const runId = attribute(ctx, "runId");
				if (!runId) {
					return resolveModel(defaultAgentModel());
				}

				const run = await db.agentRun.findUnique({
					where: { id: runId },
					select: {
						version: {
							select: { modelId: true, modelContextWindowTokens: true },
						},
					},
				});
				return resolveModel(
					run
						? {
								id: run.version.modelId,
								contextWindowTokens: run.version.modelContextWindowTokens,
							}
						: defaultAgentModel(),
				);
			},
		},
	}),
	limits: {
		maxInputTokensPerSession: 500_000,
		maxOutputTokensPerSession: 40_000,
		sessionTimeoutMs: 24 * 60 * 60 * 1000,
	},
});
