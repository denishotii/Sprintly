/**
 * Normalizes the AI SDK generateText result into our ProviderGenerateResult shape.
 * Handles steps, toolCalls/toolResults, and usage across OpenAI and Anthropic.
 */

import type { ProviderGenerateResult, ProviderToolCall, ProviderUsage } from "./types.js";

/** Step shape from AI SDK generateText (steps array). SDK 6 uses toolName, input, and toolResults[].output. */
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

/** Full result from AI SDK generateText. SDK 6 also exposes toolCalls/toolResults at top level (last step). */
export interface GenerateTextResult {
  text: string;
  finishReason?: string;
  steps?: GenerateTextStep[];
  /** Top-level tool calls (AI SDK 6 — from last step when steps exist). */
  toolCalls?: Array<{
    toolName: string;
    toolCallId: string;
    args?: Record<string, unknown>;
    input?: unknown;
  }>;
  /** Top-level tool results (AI SDK 6). */
  toolResults?: Array<{
    toolCallId: string;
    result?: unknown;
    output?: unknown;
  }>;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  /** AI SDK 6 uses totalUsage instead of usage. */
  totalUsage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  /** AI SDK 6 step content: array of parts; type 'tool-call' has toolName, toolCallId, input. */
  content?: Array<{ type: string; toolName?: string; toolCallId?: string; input?: unknown; output?: unknown }>;
}

/**
 * Map AI SDK generateText result to ProviderGenerateResult.
 * Extracts tool calls from steps (and top-level fallback for SDK 6) and handles missing final text.
 */
export function normalizeGenerateResult(result: GenerateTextResult): ProviderGenerateResult {
  const toolCalls: ProviderToolCall[] = [];

  function pushToolCall(
    tc: { toolName: string; toolCallId: string; args?: Record<string, unknown>; input?: unknown },
    toolResult: unknown
  ): void {
    const rawArgs = tc.args ?? tc.input;
    toolCalls.push({
      name: tc.toolName,
      args: (typeof rawArgs === "object" && rawArgs !== null && !Array.isArray(rawArgs)
        ? rawArgs
        : {}) as Record<string, unknown>,
      result: toolResult,
    });
  }

  // Collect all tool results by id from any step (SDK may put results in same or next step)
  const allResultsById = new Map<string, unknown>();
  if (result.steps) {
    for (const step of result.steps) {
      for (const tr of step.toolResults ?? []) {
        const out = tr.result ?? tr.output;
        if (tr.toolCallId && out !== undefined) allResultsById.set(tr.toolCallId, out);
      }
    }
  }
  for (const tr of result.toolResults ?? []) {
    const out = tr.result ?? tr.output;
    if (tr.toolCallId && out !== undefined) allResultsById.set(tr.toolCallId, out);
  }

  // 1. From steps (all steps so we get create_project from step 0 even if last step has no tool calls)
  if (result.steps) {
    for (const step of result.steps) {
      const stepCalls = step.toolCalls ?? [];
      for (const tc of stepCalls) {
        const toolResult = allResultsById.get(tc.toolCallId);
        pushToolCall(tc, toolResult);
      }
      // Fallback: AI SDK 6 may expose content array with type === 'tool-call' parts
      if (stepCalls.length === 0 && (step as { content?: Array<{ type: string; toolName?: string; toolCallId?: string; input?: unknown }> }).content) {
        const content = (step as { content: Array<{ type: string; toolName?: string; toolCallId?: string; input?: unknown }> }).content;
        for (const part of content) {
          if (part.type === "tool-call" && part.toolName && part.toolCallId) {
            const toolResult = allResultsById.get(part.toolCallId);
            pushToolCall(
              { toolName: part.toolName, toolCallId: part.toolCallId, input: part.input },
              toolResult
            );
          }
        }
      }
    }
  }

  // 2. Fallback: top-level toolCalls/toolResults (AI SDK 6 single-step or last step)
  if (toolCalls.length === 0 && result.toolCalls?.length) {
    for (const tc of result.toolCalls) {
      const resultEntry = result.toolResults?.find((tr) => tr.toolCallId === tc.toolCallId);
      const toolResult = resultEntry?.result ?? resultEntry?.output ?? allResultsById.get(tc.toolCallId);
      pushToolCall(tc, toolResult);
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

  const raw = result.usage ?? (result as GenerateTextResult).totalUsage;
  const promptTokens = raw?.promptTokens ?? (raw as { inputTokens?: number })?.inputTokens ?? 0;
  const completionTokens = raw?.completionTokens ?? (raw as { outputTokens?: number })?.outputTokens ?? 0;
  const usage: ProviderUsage | undefined = raw
    ? {
        promptTokens,
        completionTokens,
        totalTokens: (raw as { totalTokens?: number }).totalTokens ?? promptTokens + completionTokens,
      }
    : undefined;

  const finishReason =
    result.finishReason ??
    (result.steps?.length
      ? (result.steps[result.steps.length - 1] as { finishReason?: string } | undefined)?.finishReason
      : undefined);

  return {
    text: text ?? "",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
    finishReason,
  };
}
