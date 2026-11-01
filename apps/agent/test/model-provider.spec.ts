import { describe, expect, it } from "bun:test";
import {
	DEFAULT_AGENT_MODEL,
	DEFAULT_ANTHROPIC_MODEL,
	defaultAgentModel,
} from "@crm/db/settings";
import {
	anthropicModelId,
	ModelNotConfiguredError,
	resolveModel,
} from "../agent/lib/model";

const ANTHROPIC = { ANTHROPIC_API_KEY: "test-anthropic" };
const GATEWAY = { AI_GATEWAY_API_KEY: "test-gateway" };

const claude = {
	id: "anthropic/claude-opus-5-5",
	contextWindowTokens: 200_000,
};
const glm = { id: "zai/glm-5.2", contextWindowTokens: 1_000_000 };

function modelIdOf(model: unknown): string | undefined {
	return typeof model === "object" && model !== null && "modelId" in model
		? String(model.modelId)
		: undefined;
}

function providerOf(model: unknown): string | undefined {
	return typeof model === "object" && model !== null && "provider" in model
		? String(model.provider)
		: undefined;
}

describe("model provider selection", () => {
	it("calls Anthropic directly when ANTHROPIC_API_KEY is set", () => {
		const selection = resolveModel(claude, ANTHROPIC);

		expect(typeof selection.model).toBe("object");
		expect(providerOf(selection.model)).toStartWith("anthropic");
		expect(modelIdOf(selection.model)).toBe("claude-opus-5-5");
		expect(selection.modelContextWindowTokens).toBe(200_000);
	});

	it("prefers Anthropic for Claude even when the gateway is also set", () => {
		const selection = resolveModel(claude, { ...ANTHROPIC, ...GATEWAY });

		expect(providerOf(selection.model)).toStartWith("anthropic");
	});

	it("sends other providers through the gateway when it has a key", () => {
		expect(resolveModel(glm, { ...ANTHROPIC, ...GATEWAY })).toEqual({
			model: "zai/glm-5.2",
			modelContextWindowTokens: 1_000_000,
		});
		expect(resolveModel(glm, GATEWAY)).toEqual({
			model: "zai/glm-5.2",
			modelContextWindowTokens: 1_000_000,
		});
	});

	it("falls back to the Claude default when only Anthropic can serve", () => {
		const selection = resolveModel(glm, ANTHROPIC);

		expect(modelIdOf(selection.model)).toBe(
			anthropicModelId(DEFAULT_ANTHROPIC_MODEL.id),
		);
		expect(selection.modelContextWindowTokens).toBe(
			DEFAULT_ANTHROPIC_MODEL.contextWindowTokens,
		);
	});

	it("says plainly that nothing is configured", () => {
		expect(() => resolveModel(claude, {})).toThrow(ModelNotConfiguredError);
		expect(() => resolveModel(glm, { ANTHROPIC_API_KEY: "  " })).toThrow(
			/ANTHROPIC_API_KEY.*AI_GATEWAY_API_KEY/,
		);
	});

	it("maps gateway ids onto Anthropic API ids", () => {
		expect(anthropicModelId("anthropic/claude-sonnet-4.5")).toBe(
			"claude-sonnet-4-5",
		);
		expect(anthropicModelId("claude-haiku-5-5")).toBe("claude-haiku-5-5");
	});

	it("defaults to a Claude Sonnet model, overridable by ANTHROPIC_MODEL", () => {
		expect(defaultAgentModel({})).toEqual(DEFAULT_AGENT_MODEL);
		expect(defaultAgentModel(ANTHROPIC).id).toBe(DEFAULT_ANTHROPIC_MODEL.id);
		expect(DEFAULT_ANTHROPIC_MODEL.id).toMatch(/^anthropic\/claude-sonnet-/);
		expect(
			defaultAgentModel({ ...ANTHROPIC, ANTHROPIC_MODEL: "claude-opus-5-5" })
				.id,
		).toBe("anthropic/claude-opus-5-5");
	});
});
