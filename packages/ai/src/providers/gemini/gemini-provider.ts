import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import { ZodError } from 'zod';
import {
  AIProvider,
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

function isRecoverableModelError(error: unknown): boolean {
  if (!error) return false;
  const str = String(error);
  const status = (error as { status?: number }).status;
  return (
    status === 429 ||
    status === 503 ||
    status === 404 ||
    str.includes('RESOURCE_EXHAUSTED') ||
    str.includes('429') ||
    str.includes('503') ||
    str.includes('UNAVAILABLE') ||
    str.includes('404') ||
    str.includes('NOT_FOUND')
  );
}

/**
 * GeminiProvider — wraps @google/genai using the Interactions API.
 *
 * Key decisions:
 * - Uses Interactions API (ai.models.generateContent) — not legacy generateContent.
 * - When outputSchema is set: uses JSON response mime type + Zod validation.
 * - No temperature exposure — sampling params stay inside this adapter.
 * - Model name from env config with automatic resilient fallback on 429/503/404.
 */
export class GeminiProvider implements AIProvider {
  private readonly client: GoogleGenAI;
  readonly providerName = 'gemini';
  readonly modelName: string;
  readonly timeoutMs: number;

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
          // Don't retry ZodError — AI output is structurally wrong, retrying may not help
          if (error instanceof ZodError) throw error;

          if (isRecoverableModelError(error)) {
            // If quota or unavailable, don't burn all retry cycles on this model; fallback to next model
            if (attempt >= 1) {
              break;
            }
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

    const response: GenerateContentResponse = await this.client.models.generateContent({
      model: modelName,
      contents: [
        { role: 'user', parts: [{ text: request.userPrompt }] },
      ],
      config: {
        systemInstruction: request.systemPrompt,
        ...(request.maxOutputTokens !== undefined ? { maxOutputTokens: request.maxOutputTokens } : {}),
        ...(useJsonMode ? { responseMimeType: 'application/json' } : {}),
      },
    });

    const text = response.text ?? '';
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
    const finishReason =
      response.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'max_tokens' : 'stop';

    let result: T;

    if (request.outputSchema) {
      const parsed = JSON.parse(text) as unknown;
      result = request.outputSchema.parse(parsed) as T;
    } else {
      result = text as unknown as T;
    }

    return { result, inputTokens, outputTokens, model: modelName, finishReason };
  }

  async *stream(request: CompletionRequest): AsyncIterable<string> {
    // Phase 2+ — token streaming not used in Phase 1 agents
    // Phase 1 uses job-progress SSE (0%, 30%, 70%, 100%)
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

        // Embed in batches to avoid hitting per-request limits
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
            totalInputTokens += 0; // embedding API may not return token counts
          }
        }

        return { embeddings: results, model, inputTokens: totalInputTokens };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (isRecoverableModelError(error)) {
          continue; // Try next fallback embedding model
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
