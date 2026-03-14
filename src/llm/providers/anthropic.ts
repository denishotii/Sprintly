/**
 * Anthropic provider using the AI SDK and direct Anthropic API.
 * Implements the shared LLMProvider interface.
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { streamText, type LanguageModel } from "ai";
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
      try {
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

        // Use streamText instead of generateText to avoid Node.js undici headersTimeout (5 min default).
        // With non-streaming generateText, Anthropic must process the full request before sending any
        // HTTP response headers. For large builder requests (5+ files, >5 min generation), Node.js
        // times out waiting for those headers. streamText sends HTTP 200 headers immediately when
        // streaming starts, so no headersTimeout is ever triggered regardless of generation duration.
        const result = streamText({
          model: anthropic(effectiveModel) as unknown as LanguageModel,
          prompt,
          system: systemPrompt,
          maxOutputTokens: maxTokens,
          temperature,
          tools: hasTools ? tools : undefined,
          toolChoice: hasTools && resolvedToolChoice ? resolvedToolChoice : undefined,
          providerOptions: providerOptions as Parameters<typeof streamText>[0]["providerOptions"],
          onStepFinish: (step) => {
            logger.debug(
              `Anthropic step finished - finishReason: ${step.finishReason}, toolCalls: ${step.toolCalls?.length ?? 0}`
            );
          },
        });

        // streamText returns synchronously; all result fields are Promises that resolve as the stream
        // completes. Resolve them all in parallel (Promise.resolve handles both Promise and plain values).
        const raw = result as unknown as GenerateTextResult & {
          text: PromiseLike<string> | string;
          steps?: PromiseLike<GenerateTextResult["steps"]> | GenerateTextResult["steps"];
          toolCalls?: PromiseLike<GenerateTextResult["toolCalls"]> | GenerateTextResult["toolCalls"];
          toolResults?: PromiseLike<GenerateTextResult["toolResults"]> | GenerateTextResult["toolResults"];
          reasoning?: PromiseLike<string> | string;
          finishReason?: PromiseLike<string> | string;
          usage?: PromiseLike<GenerateTextResult["usage"]> | GenerateTextResult["usage"];
        };
        const [resolvedText, steps, topLevelToolCalls, topLevelToolResults, reasoning, resolvedFinishReason, resolvedUsage] = await Promise.all([
          Promise.resolve(raw.text),
          Promise.resolve(raw.steps),
          Promise.resolve(raw.toolCalls),
          Promise.resolve(raw.toolResults),
          Promise.resolve(raw.reasoning),
          Promise.resolve(raw.finishReason),
          Promise.resolve(raw.usage),
        ]);

        logger.debug(
          `Anthropic result: text=${(resolvedText as string)?.length ?? 0}chars, reasoning=${(reasoning as string)?.length ?? 0}chars, steps=${(steps as unknown[])?.length ?? 0}`
        );

        const resolvedResult: GenerateTextResult = {
          text: (resolvedText as string) ?? "",
          reasoning: reasoning as string ?? undefined,
          steps: steps ?? undefined,
          toolCalls: topLevelToolCalls ?? undefined,
          toolResults: topLevelToolResults ?? undefined,
          finishReason: resolvedFinishReason as string ?? undefined,
          usage: resolvedUsage as GenerateTextResult["usage"],
        };
        return normalizeGenerateResult(resolvedResult);
      } catch (error) {
        logger.error(`Anthropic generate failed: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }
    },
  };

  return provider;
}
