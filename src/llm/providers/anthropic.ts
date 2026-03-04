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
        toolChoice,
        providerOptions,
      } = params;

      const effectiveModel = modelOverride ?? modelId;
      const hasTools = tools && Object.keys(tools).length > 0;
      const resolvedToolChoice =
        toolChoice === "required"
          ? "required"
          : toolChoice === "none"
            ? "none"
            : toolChoice && typeof toolChoice === "object" && toolChoice.type === "tool"
              ? { type: "tool" as const, toolName: toolChoice.toolName }
              : undefined;

      logger.debug(
        `Anthropic generate: model=${effectiveModel}, hasTools=${hasTools}, toolChoice=${resolvedToolChoice ? (typeof resolvedToolChoice === "string" ? resolvedToolChoice : resolvedToolChoice.toolName) : "auto"}, providerOptions=${providerOptions ? JSON.stringify(providerOptions) : "none"}`
      );

      const result = await generateText({
        model: anthropic(effectiveModel) as unknown as LanguageModel,
        prompt,
        system: systemPrompt,
        maxOutputTokens: maxTokens,
        temperature,
        tools: hasTools ? tools : undefined,
        toolChoice: hasTools && resolvedToolChoice ? resolvedToolChoice : undefined,
        providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
        onStepFinish: (step) => {
          logger.debug(
            `Anthropic step finished - finishReason: ${step.finishReason}, toolCalls: ${step.toolCalls?.length ?? 0}`
          );
        },
      });

      // AI SDK 6 may expose steps/toolCalls/toolResults as PromiseLike; resolve before normalizing
      const raw = result as unknown as GenerateTextResult & {
        steps?: PromiseLike<GenerateTextResult["steps"]> | GenerateTextResult["steps"];
        toolCalls?: PromiseLike<GenerateTextResult["toolCalls"]> | GenerateTextResult["toolCalls"];
        toolResults?: PromiseLike<GenerateTextResult["toolResults"]> | GenerateTextResult["toolResults"];
        reasoning?: PromiseLike<string> | string;
      };
      const [steps, topLevelToolCalls, topLevelToolResults, reasoning] = await Promise.all([
        Promise.resolve(raw.steps),
        Promise.resolve(raw.toolCalls),
        Promise.resolve(raw.toolResults),
        Promise.resolve(raw.reasoning),
      ]);

      logger.debug(
        `Anthropic result: text=${raw.text?.length ?? 0}chars, reasoning=${reasoning?.length ?? 0}chars, steps=${steps?.length ?? 0}`
      );

      const resolvedResult: GenerateTextResult = {
        ...raw,
        reasoning: reasoning ?? undefined,
        steps: steps ?? undefined,
        toolCalls: topLevelToolCalls ?? undefined,
        toolResults: topLevelToolResults ?? undefined,
      };
      return normalizeGenerateResult(resolvedResult);
    },
  };

  return provider;
}
