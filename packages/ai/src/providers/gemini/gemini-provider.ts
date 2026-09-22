import { GoogleGenAI } from '@google/genai';
import { ZodError } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  AIProvider,
  AIProviderCapabilities,
  AIErrorClassification,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingTaskType,
} from '../../core/ai-provider';

/**
 * Formats input content for Gemini Embedding 2 according to official Google documentation:
 * - DOCUMENT:   title: {title or "none"} | text: {content}
 * - QUERY:      task: search result | query: {content}
 * - SIMILARITY: task: sentence similarity | query: {content}
 *
 * Critical: gemini-embedding-2 does NOT support the task_type/taskType API parameter.
 * Task semantics are provided entirely through input text formatting.
 */
export function formatGeminiEmbeddingInput(
  content: string,
  taskType?: EmbeddingTaskType,
  title?: string,
): string {
  if (!taskType) {
    return content;
  }
  switch (taskType) {
    case 'DOCUMENT': {
      const cleanTitle = title && title.trim().length > 0 ? title.trim() : 'none';
      return `title: ${cleanTitle} | text: ${content}`;
    }
    case 'QUERY':
      return `task: search result | query: ${content}`;
    case 'SIMILARITY':
      return `task: sentence similarity | query: ${content}`;
    default:
      return content;
  }
}

/**
 * Classifies an AI error into retryable vs non-retryable categories per
 * Google Gemini troubleshooting specifications:
 * - Exponential backoff for 429/503
 * - Fast-fail abort for 400/401/403/invalid schemas (no model fallback)
 * - Immediate fallback for 404 (model unavailable)
 */
export function classifyAIError(error: unknown): AIErrorClassification {
  if (!error) {
    return { isRetryable: false, category: 'UNKNOWN', message: 'Unknown error' };
  }
  if (error instanceof ZodError || (typeof error === 'object' && (error as any)?.name === 'ZodError')) {
    return { isRetryable: false, category: 'SCHEMA_ERROR', message: (error as Error).message };
  }

  const str = String(error);
  const status =
    (error as { status?: number; statusCode?: number }).status ??
    (error as { statusCode?: number }).statusCode;

  if (status === 429 || str.includes('RESOURCE_EXHAUSTED') || str.includes('429')) {
    return { isRetryable: true, category: 'RATE_LIMIT', statusCode: 429, message: str };
  }
  if (
    status === 408 ||
    str.includes('timeout') ||
    str.includes('DEADLINE_EXCEEDED') ||
    str.includes('ETIMEDOUT') ||
    str.includes('ESOCKETTIMEDOUT')
  ) {
    return { isRetryable: true, category: 'TIMEOUT', statusCode: status ?? 408, message: str };
  }
  if (
    status === 503 ||
    status === 500 ||
    status === 504 ||
    str.includes('UNAVAILABLE') ||
    str.includes('503') ||
    str.includes('500') ||
    str.includes('INTERNAL')
  ) {
    return { isRetryable: true, category: 'TRANSIENT', statusCode: status ?? 503, message: str };
  }
  if (
    status === 404 ||
    str.includes('NOT_FOUND') ||
    str.includes('404') ||
    str.includes('is not found') ||
    str.includes('is not supported')
  ) {
    return { isRetryable: false, category: 'MODEL_UNAVAILABLE', statusCode: 404, message: str };
  }
  if (
    status === 401 ||
    status === 403 ||
    str.includes('PERMISSION_DENIED') ||
    str.includes('UNAUTHENTICATED') ||
    str.includes('API_KEY_INVALID')
  ) {
    return { isRetryable: false, category: 'AUTH_ERROR', statusCode: status ?? 401, message: str };
  }
  if (status && status >= 400 && status < 500) {
    return { isRetryable: false, category: 'INVALID_REQUEST', statusCode: status, message: str };
  }

  return { isRetryable: false, category: 'UNKNOWN', message: str };
}

/**
 * GeminiProvider — wraps @google/genai strictly using the Interactions API.
 *
 * Key design rules:
 * 1. Native Interactions API: Calls client.interactions.create with typed SDK signature.
 * 2. Privacy contract: Enforces store: false so PostgreSQL + pgvector is authoritative.
 * 3. Consistent fallback: Generative fallback cascades through configured models using the
 *    SAME Interactions API contract (store: false).
 * 4. Embedding coordinate space purity: embed() does NOT silently swap embedding models
 *    (e.g. embedding-2 ≠ embedding-001); transient errors retry, avoiding index vector corruption.
 * 5. Configuration purity: Models are configuration-driven via constructor/options.
 * 6. Structured output: Uses top-level response_format: { type: 'text', mime_type: 'application/json', schema }.
 * 7. Native streaming: Uses Interactions API streaming with step.delta text events.
 */
export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly fallbackModels: string[];
  readonly timeoutMs: number;
  readonly capabilities: AIProviderCapabilities = {
    structuredOutput: true,
    streaming: true,
    embeddings: true,
    tools: false,
    vision: false,
    multimodal: false,
  };

  getCapabilities(): AIProviderCapabilities {
    return this.capabilities;
  }

  private readonly embeddingDimensions?: number | undefined;

  constructor(
    apiKey: string,
    modelName: string,
    private readonly maxRetries = 3,
    timeoutMs = 30000,
    embeddingDimensions?: number | string | undefined,
    fallbackModels?: string[],
  ) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.timeoutMs = timeoutMs;
    this.embeddingDimensions =
      embeddingDimensions !== undefined && embeddingDimensions !== null
        ? Number(embeddingDimensions)
        : undefined;
    this.fallbackModels = fallbackModels ?? [];
  }

  async complete<T = string>(request: CompletionRequest): Promise<CompletionResponse<T>> {
    const candidateModels = [
      this.modelName,
      ...this.fallbackModels.filter((m) => m !== this.modelName),
    ];

    let lastError: Error | undefined;

    for (const model of candidateModels) {
      for (let attempt = 0; attempt < this.maxRetries; attempt++) {
        try {
          const response = await this.executeCompletion<T>(request, model);
          return response;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));

          const classification = classifyAIError(error);

          // Fast-fail terminal errors immediately — do not retry or try fallback models
          if (
            classification.category === 'AUTH_ERROR' ||
            classification.category === 'INVALID_REQUEST' ||
            classification.category === 'SCHEMA_ERROR'
          ) {
            throw lastError;
          }

          // If the model does not exist or is unavailable, immediately try the next model
          if (classification.category === 'MODEL_UNAVAILABLE') {
            break;
          }

          // For RATE_LIMIT (429) or TRANSIENT (5xx/timeout), retry with backoff on current model
          if (attempt < this.maxRetries - 1) {
            await this.delay(Math.pow(2, attempt) * 1000);
          }
          // When retry budget on this model is exhausted, the loop naturally advances to the next candidate model
        }
      }
    }

    throw lastError ?? new Error('Unknown error after retries across candidate models');
  }

  private async executeCompletion<T>(
    request: CompletionRequest,
    modelName = this.modelName,
  ): Promise<CompletionResponse<T>> {
    const useJsonMode = Boolean(request.outputSchema || request.jsonSchema);

    let jsonSchema: Record<string, unknown> | undefined = request.jsonSchema;
    if (!jsonSchema && request.outputSchema) {
      jsonSchema = zodToJsonSchema(request.outputSchema as any, { target: 'openApi3' }) as Record<string, unknown>;
    }

    // Modern Interactions API call via client.interactions.create
    const interaction = await this.client.interactions.create({
      model: modelName,
      input: request.userPrompt,
      system_instruction: request.systemPrompt,
      store: request.store ?? false,
      ...(useJsonMode
        ? {
            response_format: {
              type: 'text' as const,
              mime_type: 'application/json',
              ...(jsonSchema ? { schema: jsonSchema } : {}),
            },
          }
        : {}),
      ...(request.maxOutputTokens !== undefined
        ? {
            generation_config: {
              max_output_tokens: request.maxOutputTokens,
            },
          }
        : {}),
    });

    let text = interaction.output_text ?? '';
    if (!text && (interaction as any).outputs && Array.isArray((interaction as any).outputs)) {
      const textParts = (interaction as any).outputs
        .filter((o: any) => o.type === 'text' && typeof o.text === 'string')
        .map((o: any) => o.text);
      text = textParts.join('');
    }

    const inputTokens = interaction.usage?.total_input_tokens ?? 0;
    const outputTokens = interaction.usage?.total_output_tokens ?? 0;
    const finishReason: 'stop' | 'max_tokens' | 'error' =
      interaction.status === 'completed'
        ? 'stop'
        : (interaction.status as any) === 'requires_action'
        ? 'stop'
        : 'stop';

    let result: T;

    if (request.outputSchema) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(
          `Failed to parse AI output as JSON: ${(parseErr as Error).message}. Raw output: ${text.slice(0, 200)}`,
        );
      }
      result = request.outputSchema.parse(parsed) as T;
    } else {
      result = text as unknown as T;
    }

    return { result, inputTokens, outputTokens, model: modelName, finishReason };
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    const stream = (await (this.client.interactions.create as any)({
      model: this.modelName,
      input: request.userPrompt,
      system_instruction: request.systemPrompt,
      store: request.store ?? false,
      stream: true,
      ...(request.maxOutputTokens !== undefined
        ? {
            generation_config: {
              max_output_tokens: request.maxOutputTokens,
            },
          }
        : {}),
    })) as unknown as AsyncIterable<any>;

    for await (const event of stream) {
      if (event.event_type === 'step.delta' && event.delta) {
        const delta = event.delta as any;
        if (delta.type === 'text' && typeof delta.text === 'string') {
          yield delta.text;
        }
      }
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const model = this.modelName;
    const rawDimensions = request.dimensions ?? this.embeddingDimensions;
    const targetDimensions =
      rawDimensions !== undefined && rawDimensions !== null
        ? Number(rawDimensions)
        : undefined;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const results: number[][] = [];
        let totalInputTokens = 0;

        const BATCH_SIZE = 100;
        for (let i = 0; i < request.texts.length; i += BATCH_SIZE) {
          const batch = request.texts.slice(i, i + BATCH_SIZE);
          const formattedBatch = batch.map((text, idx) => {
            const globalIdx = i + idx;
            const itemTitle = request.titles?.[globalIdx] ?? request.title;
            return formatGeminiEmbeddingInput(text, request.taskType, itemTitle);
          });

          // gemini-embedding-2 does NOT support taskType in config.
          // Task semantics are handled strictly via formatGeminiEmbeddingInput prefixing.
          const config: Record<string, unknown> = {};
          if (targetDimensions !== undefined && !isNaN(targetDimensions)) {
            config.outputDimensionality = targetDimensions;
          }

          const response = await this.client.models.embedContent({
            model,
            contents: formattedBatch.map((formattedText) => ({
              role: 'user',
              parts: [{ text: formattedText }],
            })),
            ...(Object.keys(config).length > 0 ? { config } : {}),
          });

          for (const embedding of response.embeddings ?? []) {
            const values = embedding.values ?? [];
            if (
              targetDimensions !== undefined &&
              !isNaN(targetDimensions) &&
              values.length !== targetDimensions
            ) {
              throw new Error(
                `Embedding dimension mismatch: expected ${targetDimensions}, received ${values.length} from model ${model}`,
              );
            }
            results.push(values);
          }
        }

        return { embeddings: results, model, inputTokens: totalInputTokens };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const classification = classifyAIError(error);

        // Terminal errors: immediately abort without retrying
        if (!classification.isRetryable) {
          throw lastError;
        }

        // Retry with exponential backoff on the single authoritative model
        if (attempt < this.maxRetries - 1) {
          await this.delay(Math.pow(2, attempt) * 1000);
        }
      }
    }

    throw (
      lastError ??
      new Error(`Embedding generation failed for model ${model} after ${this.maxRetries} attempts`)
    );
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
