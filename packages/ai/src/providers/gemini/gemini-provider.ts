import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { ZodError } from 'zod';
import {
  AIProvider,
  AIProviderCapabilities,
  AIErrorClassification,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from '../../core/ai-provider';

const COMPLETION_FALLBACK_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.7-flash',
  'gemini-3.5-flash',
];

const EMBEDDING_FALLBACK_MODELS = [
  'gemini-embedding-2',
  'gemini-embedding-001',
];

/**
 * Classifies an AI error into retryable vs non-retryable categories per
 * Google Gemini troubleshooting specifications (exponential backoff for 429/503,
 * immediate abort for 400/401/403/invalid schemas).
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
    status === 503 ||
    status === 500 ||
    status === 504 ||
    str.includes('UNAVAILABLE') ||
    str.includes('503') ||
    str.includes('500') ||
    str.includes('timeout')
  ) {
    return { isRetryable: true, category: 'TRANSIENT', statusCode: status ?? 503, message: str };
  }
  if (status === 404 || str.includes('NOT_FOUND') || str.includes('404')) {
    return { isRetryable: false, category: 'MODEL_NOT_FOUND', statusCode: 404, message: str };
  }
  if (
    status === 401 ||
    status === 403 ||
    str.includes('PERMISSION_DENIED') ||
    str.includes('UNAUTHENTICATED')
  ) {
    return { isRetryable: false, category: 'AUTH_ERROR', statusCode: status ?? 401, message: str };
  }
  if (status && status >= 400 && status < 500) {
    return { isRetryable: false, category: 'INVALID_REQUEST', statusCode: status, message: str };
  }

  return { isRetryable: false, category: 'UNKNOWN', message: str };
}


/**
 * GeminiProvider — wraps @google/genai using the Interactions API.
 *
 * Key decisions:
 * - Uses Interactions API (ai.interactions.create) — Google's primary modern interface.
 * - Enforces store: false by default — PostgreSQL + pgvector is source of truth.
 * - When outputSchema is set: uses JSON response mime type + Zod validation.
 * - No temperature exposure — sampling params stay inside this adapter.
 * - AI failure classification: 429/5xx retry with backoff; 4xx/schema errors abort immediately.
 */
export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly timeoutMs: number;
  readonly capabilities: AIProviderCapabilities = {
    structuredOutput: true,
    streaming: true,
    embeddings: true,
    tools: false,
    vision: false,
  };

  constructor(
    apiKey: string,
    modelName: string,
    private readonly maxRetries = 3,
    timeoutMs = 30000,
    private readonly embeddingDimensions?: number,
  ) {
    this.client = new GoogleGenAI({ apiKey });
    this.modelName = modelName;
    this.timeoutMs = timeoutMs;
  }

  async complete<T = string>(request: CompletionRequest): Promise<CompletionResponse<T>> {
    const candidateModels = [
      this.modelName,
      ...COMPLETION_FALLBACK_MODELS.filter((m) => m !== this.modelName),
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
          // Non-retryable errors (e.g. ZodError, invalid arguments, 400, 401, 403) abort immediately
          if (!classification.isRetryable) {
            throw lastError;
          }

          // If quota exhausted or model unavailable on this model, break to try fallback model
          if (classification.category === 'RATE_LIMIT' && attempt >= 1) {
            break;
          }

          if (attempt < this.maxRetries - 1) {
            await this.delay(Math.pow(2, attempt) * 1000); // exponential backoff
          }
        }
      }
    }

    throw lastError ?? new Error('Unknown error after retries');
  }

  private async executeCompletion<T>(
    request: CompletionRequest,
    modelName = this.modelName,
  ): Promise<CompletionResponse<T>> {
    const useJsonMode = request.outputSchema != null;

    let text = '';
    let inputTokens = 0;
    let outputTokens = 0;
    let finishReason: 'stop' | 'max_tokens' | 'error' = 'stop';

    try {
      // Primary: Modern Interactions API (ai.interactions.create)
      const interaction = await (this.client as any).interactions.create({
        model: modelName,
        input: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
        system_instruction: request.systemPrompt,
        ...(useJsonMode ? { response_mime_type: 'application/json' } : {}),
        store: request.store ?? false,
        ...(request.maxOutputTokens !== undefined
          ? { generation_config: { maxOutputTokens: request.maxOutputTokens } }
          : {}),
      });

      if (interaction.outputs && Array.isArray(interaction.outputs)) {
        const textParts = interaction.outputs
          .filter((o: any) => o.type === 'text' && typeof o.text === 'string')
          .map((o: any) => o.text);
        text = textParts.join('');
      }
      if (!text && interaction.text) {
        text = interaction.text;
      }

      inputTokens = interaction.usage?.total_input_tokens ?? 0;
      outputTokens = interaction.usage?.total_output_tokens ?? 0;
      finishReason =
        interaction.status === 'completed'
          ? 'stop'
          : (interaction.status as any) || 'stop';
    } catch (interactionErr) {
      const errStr = String(interactionErr);
      const isMissingApi =
        errStr.includes('is not a function') ||
        errStr.includes('not supported') ||
        errStr.includes('Method Not Allowed') ||
        errStr.includes('405');

      if (!isMissingApi || !this.client.models?.generateContent) {
        throw interactionErr;
      }

      // Resilient fallback to models.generateContent if interactions API is not available in current environment
      const response: GenerateContentResponse = await this.client.models.generateContent({
        model: modelName,
        contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
        config: {
          systemInstruction: request.systemPrompt,
          ...(request.maxOutputTokens !== undefined
            ? { maxOutputTokens: request.maxOutputTokens }
            : {}),
          ...(useJsonMode ? { responseMimeType: 'application/json' } : {}),
        },
      });

      text = response.text ?? '';
      inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
      outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
      finishReason =
        response.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'stop';
    }


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
    const stream = await this.client.models.generateContentStream({
      model: this.modelName,
      contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
      config: { systemInstruction: request.systemPrompt },
    });

    for await (const chunk of stream) {
      if (chunk.text) yield chunk.text;
    }
  }

  async embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    const candidateModels = [
      this.modelName,
      ...EMBEDDING_FALLBACK_MODELS.filter((m) => m !== this.modelName),
    ];

    let lastError: Error | undefined;

    for (const model of candidateModels) {
      try {
        const results: number[][] = [];
        let totalInputTokens = 0;

        const BATCH_SIZE = 100;
        for (let i = 0; i < request.texts.length; i += BATCH_SIZE) {
          const batch = request.texts.slice(i, i + BATCH_SIZE);
          const response = await this.client.models.embedContent({
            model,
            contents: batch.map((text) => ({ role: 'user', parts: [{ text }] })),
            ...(this.embeddingDimensions !== undefined
              ? { config: { outputDimensionality: this.embeddingDimensions } }
              : {}),
          });

          for (const embedding of response.embeddings ?? []) {
            results.push(embedding.values ?? []);
            totalInputTokens += 0;
          }
        }

        return { embeddings: results, model, inputTokens: totalInputTokens };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        const classification = classifyAIError(error);
        if (classification.isRetryable) {
          continue;
        }
        throw error;
      }
    }

    throw lastError ?? new Error('Unknown embedding error after retries');
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
