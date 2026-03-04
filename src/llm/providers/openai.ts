/**
 * OpenAI provider using the AI SDK and direct OpenAI API.
 * Implements the shared LLMProvider interface.
 */

import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import type { LLMProvider, ProviderGenerateParams, ProviderGenerateResult } from "./types.js";
import { normalizeGenerateResult, type GenerateTextResult } from "./normalize.js";
import { logger } from "../../utils/logger.js";

export interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
}

/**
 * Create an OpenAI provider that uses the OpenAI API directly (no OpenRouter).
 */
export function createOpenAIProvider(config: OpenAIProviderConfig): LLMProvider {
  const openai = createOpenAI({
    apiKey: config.apiKey,
  });

  const modelId = config.model;

  const provider: LLMProvider = {
    name: "openai",

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
        `OpenAI generate: model=${effectiveModel}, hasTools=${hasTools}, toolChoice=${resolvedToolChoice ? (typeof resolvedToolChoice === "string" ? resolvedToolChoice : resolvedToolChoice.toolName) : "auto"}`
      );

      const result = await generateText({
        model: openai(effectiveModel) as unknown as LanguageModel,
        prompt,
        system: systemPrompt,
        maxOutputTokens: maxTokens,
        temperature,
        tools: hasTools ? tools : undefined,
        toolChoice: hasTools && resolvedToolChoice ? resolvedToolChoice : undefined,
        providerOptions: providerOptions as Parameters<typeof generateText>[0]["providerOptions"],
        onStepFinish: (step) => {
          logger.debug(
            `OpenAI step finished - finishReason: ${step.finishReason}, toolCalls: ${step.toolCalls?.length ?? 0}`
          );
        },
      });

      // AI SDK 6 may expose steps/toolCalls/toolResults as PromiseLike; resolve before normalizing
      const raw = result as unknown as GenerateTextResult & {
        steps?: PromiseLike<GenerateTextResult["steps"]> | GenerateTextResult["steps"];
        toolCalls?: PromiseLike<GenerateTextResult["toolCalls"]> | GenerateTextResult["toolCalls"];
        toolResults?: PromiseLike<GenerateTextResult["toolResults"]> | GenerateTextResult["toolResults"];
      };
      const [steps, topLevelToolCalls, topLevelToolResults] = await Promise.all([
        Promise.resolve(raw.steps),
        Promise.resolve(raw.toolCalls),
        Promise.resolve(raw.toolResults),
      ]);
      const resolvedResult: GenerateTextResult = {
        ...raw,
        steps: steps ?? undefined,
        toolCalls: topLevelToolCalls ?? undefined,
        toolResults: topLevelToolResults ?? undefined,
      };
      return normalizeGenerateResult(resolvedResult);
    },
  };

  return provider;
}
