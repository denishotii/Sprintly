/**
 * Shared types for LLM providers (OpenAI, Anthropic).
 * Allows the client to use either provider through a single interface.
 */

/** Token usage as returned by providers */
export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** A single tool call with its result (normalized across providers) */
export interface ProviderToolCall {
  name: string;
  args: Record<string, unknown>;
  result: unknown;
}

/** Normalized result from a provider's generate call */
export interface ProviderGenerateResult {
  text: string;
  toolCalls?: ProviderToolCall[];
  usage?: ProviderUsage;
  /** Why the generation stopped; 'length' means output was truncated (increase maxTokens). */
  finishReason?: string;
}

/** Parameters for a single generation request */
export interface ProviderGenerateParams {
  prompt: string;
  systemPrompt?: string;
  maxTokens: number;
  temperature: number;
  tools?: Record<string, import("ai").Tool>;
  /** Override model for this call (e.g. per-step: planner, builder, verifier). When set, provider uses this instead of its default. */
  model?: string;
  /** Tool choice: 'auto' | 'required' | 'none' or { type: 'tool', toolName: string }. Use 'required' for builder step so the model must call create_project. */
  toolChoice?: "auto" | "required" | "none" | { type: "tool"; toolName: string };
}

/**
 * Shared interface that both OpenAI and Anthropic providers implement.
 * The client uses this to call the active provider without knowing which one it is.
 */
export interface LLMProvider {
  readonly name: "openai" | "anthropic";

  /**
   * Generate a completion with optional tool use.
   * Returns normalized text, tool calls with results, and token usage.
   */
  generate(params: ProviderGenerateParams): Promise<ProviderGenerateResult>;
}
