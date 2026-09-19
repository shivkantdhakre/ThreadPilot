import { ZodType } from 'zod';

/**
 * Core AI provider interface.
 *
 * Agents NEVER import Gemini directly — only this interface.
 * Provider-specific concerns (sampling params, retry headers) stay inside adapters.
 *
 * temperature is intentionally absent — deprecated in Gemini July 2026.
 * outputSchema replaces responseFormat:'json' — all structured output is Zod-validated.
 */

export interface CompletionRequest {
  systemPrompt: string;
  userPrompt: string;
  maxOutputTokens?: number;
  /**
   * If provided, the response is parsed and validated against this schema.
   * GeminiProvider uses JSON mode and validates with Zod.
   * Throws ZodError if AI output doesn't conform — caller handles retry.
   */
  outputSchema?: ZodType;
  /**
   * Whether Google should store the interaction.
   * Default is false: PostgreSQL is the authoritative memory store.
   */
  store?: boolean;
}

export interface CompletionResponse<T = string> {
  result: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
  finishReason: 'stop' | 'max_tokens' | 'error';
}

export interface EmbeddingRequest {
  texts: string[];
  dimensions?: number;  // from GEMINI_EMBEDDING_DIMENSIONS env
}

export interface EmbeddingResponse {
  embeddings: number[][];
  model: string;
  inputTokens: number;
}

export interface AIProviderCapabilities {
  structuredOutput: boolean;
  streaming: boolean;
  embeddings: boolean;
  tools: boolean;
  vision: boolean;
}

export type AIFailureCategory =
  | 'TRANSIENT'
  | 'RATE_LIMIT'
  | 'INVALID_REQUEST'
  | 'SCHEMA_ERROR'
  | 'AUTH_ERROR'
  | 'MODEL_NOT_FOUND'
  | 'UNKNOWN';

export interface AIErrorClassification {
  isRetryable: boolean;
  category: AIFailureCategory;
  statusCode?: number;
  message: string;
}

export interface AIProvider {
  complete<T = string>(request: CompletionRequest): Promise<CompletionResponse<T>>;
  /**
   * Token streaming — Phase 2+ only.
   * Phase 1 uses job-progress SSE (0%→30%→70%→100%), not token streaming.
   */
  stream(request: CompletionRequest): AsyncIterable<string>;
  embed(request: EmbeddingRequest): Promise<EmbeddingResponse>;
  readonly providerName: string;
  readonly modelName: string;
  readonly capabilities: AIProviderCapabilities;
}

