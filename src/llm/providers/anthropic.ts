/**
 * Anthropic provider using the AI SDK and direct Anthropic API.
 * Implements the shared LLMProvider interface.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, type LanguageModel } from "ai";
import type { LLMProvider, ProviderGenerateParams, ProviderGenerateResult } from "./types.js";
import { normalizeGenerateResult, type GenerateTextResult } from "./normalize.js";
import { logger } from "../../utils/logger.js";

export interface AnthropicProviderConfig {
  apiKey: string;
  model: string;
}

/**
 * Create an Anthropic provider that uses the Anthropic API directly (no OpenRouter).
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider {
  const anthropic = createAnthropic({
    apiKey: config.apiKey,
  });

  const modelId = config.model;

  const provider: LLMProvider = {
    name: "anthropic",

    async generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult> {
      const {
        prompt,
        systemPrompt,
        maxTokens,
        temperature,
        tools,
        model: modelOverride,
      } = params;

      const effectiveModel = modelOverride ?? modelId;
      const hasTools = tools && Object.keys(tools).length > 0;

      logger.debug(`Anthropic generate: model=${effectiveModel}, hasTools=${hasTools}`);

      const result = await generateText({
        model: anthropic(effectiveModel) as unknown as LanguageModel,
        prompt,
        system: systemPrompt,
        maxOutputTokens: maxTokens,
        temperature,
        tools: hasTools ? tools : undefined,
        onStepFinish: (step) => {
          logger.debug(
            `Anthropic step finished - finishReason: ${step.finishReason}, toolCalls: ${step.toolCalls?.length ?? 0}`
          );
        },
      });

      return normalizeGenerateResult(result as unknown as GenerateTextResult);
    },
  };

  return provider;
}
