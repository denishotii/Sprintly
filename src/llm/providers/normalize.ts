/**
 * Normalizes the AI SDK generateText result into our ProviderGenerateResult shape.
 * Handles steps, toolCalls/toolResults, and usage across OpenAI and Anthropic.
 */

import type { ProviderGenerateResult, ProviderToolCall, ProviderUsage } from "./types.js";

/** Step shape from AI SDK generateText (steps array). Accepts both SDK 4 (args) and SDK 5 (input) tool call shapes. */
interface GenerateTextStep {
  text?: string;
  toolCalls?: Array<{
    toolName: string;
    toolCallId: string;
    args?: Record<string, unknown>;
    input?: unknown;
  }>;
  toolResults?: Array<{
    toolCallId: string;
    result?: unknown;
    output?: unknown;
  }>;
}

/** Full result from AI SDK generateText (compatible with SDK 4, 5, and 6). */
export interface GenerateTextResult {
  text: string;
  finishReason?: string;
  steps?: GenerateTextStep[];
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

/**
 * Map AI SDK generateText result to ProviderGenerateResult.
 * Extracts tool calls from steps and handles missing final text.
 */
export function normalizeGenerateResult(result: GenerateTextResult): ProviderGenerateResult {
  const toolCalls: ProviderToolCall[] = [];

  if (result.steps) {
    for (const step of result.steps) {
      const stepToolCalls = step.toolCalls;
      const stepToolResults = step.toolResults;

      if (stepToolCalls) {
        for (const tc of stepToolCalls) {
          const resultEntry = stepToolResults?.find((tr) => tr.toolCallId === tc.toolCallId);
          const toolResult = resultEntry?.result ?? resultEntry?.output;

          const rawArgs = tc.args ?? tc.input;
          toolCalls.push({
            name: tc.toolName,
            args: (typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
              ? rawArgs
              : {}) as Record<string, unknown>,
            result: toolResult,
          });
        }
      }
    }
  }

  let text = result.text;
  if (!text && toolCalls.length > 0 && result.steps?.length) {
    for (let i = result.steps.length - 1; i >= 0; i--) {
      if (result.steps[i].text) {
        text = result.steps[i].text ?? "";
        break;
      }
    }
  }

  const raw = result.usage;
  const promptTokens = raw?.promptTokens ?? raw?.inputTokens ?? 0;
  const completionTokens = raw?.completionTokens ?? raw?.outputTokens ?? 0;
  const usage: ProviderUsage | undefined = raw
    ? {
        promptTokens,
        completionTokens,
        totalTokens: raw.totalTokens ?? promptTokens + completionTokens,
      }
    : undefined;

  return {
    text: text ?? "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
  };
}
