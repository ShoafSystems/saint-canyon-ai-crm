import { createAnthropic } from "@ai-sdk/anthropic";
import { db } from "@crm/db";
import {
	anthropicConfigured,
	defaultAgentModel,
	gatewayConfigured,
	readAgentModel,
} from "@crm/db/settings";
import type { LanguageModel } from "ai";

export interface ModelSelection {
	model: string | LanguageModel;
	modelContextWindowTokens: number;
}

export class ModelNotConfiguredError extends Error {
	constructor() {
		super(
			"No AI model provider is configured. Set ANTHROPIC_API_KEY to call Anthropic directly, or AI_GATEWAY_API_KEY to use the Vercel AI Gateway.",
		);
		this.name = "ModelNotConfiguredError";
	}
}

/**
 * Settings store gateway-style ids (`anthropic/claude-sonnet-4.5`); the
 * Anthropic API wants the bare id with dashes (`claude-sonnet-4-5`).
 */
export function anthropicModelId(id: string): string {
	return id.replace(/^anthropic\//, "").replaceAll(".", "-");
}

/**
 * Anthropic serves Claude when ANTHROPIC_API_KEY is set; the AI Gateway serves
 * anything else, and only when it has credentials. A non-Claude choice with
 * no gateway falls back to the Claude default rather than failing every turn.
 */
export function resolveModel(
	chosen: { id: string; contextWindowTokens: number },
	env: NodeJS.ProcessEnv = process.env,
): ModelSelection {
	const anthropic = anthropicConfigured(env);
	const gateway = gatewayConfigured(env);
	const isClaude = chosen.id.startsWith("anthropic/");

	if (anthropic && (isClaude || !gateway)) {
		const target = isClaude ? chosen : defaultAgentModel(env);

		if (!isClaude) {
			console.warn(
				`[agent] "${chosen.id}" needs the AI Gateway, which is not configured; using ${target.id} through Anthropic`,
			);
		}

		const provider = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY?.trim() });

		return {
			model: provider(anthropicModelId(target.id)),
			modelContextWindowTokens: target.contextWindowTokens,
		};
	}

	if (gateway) {
		return {
			model: chosen.id,
			modelContextWindowTokens: chosen.contextWindowTokens,
		};
	}

	throw new ModelNotConfiguredError();
}

export async function selectedModel(): Promise<ModelSelection> {
	try {
		const setting = await readAgentModel(db);

		return resolveModel(setting);
	} catch (error) {
		if (error instanceof ModelNotConfiguredError) throw error;

		console.error(
			`[agent] could not read the configured model, falling back: ${
				error instanceof Error ? error.message : String(error)
			}`,
		);
		return resolveModel(defaultAgentModel());
	}
}
