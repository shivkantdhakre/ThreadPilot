import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AIProvider,
  GeminiProvider,
  ModelRouter,
  type AIConfig,
  type CompletionRequest,
  type CompletionResponse,
  type EmbeddingRequest,
  type EmbeddingResponse,
} from '@threadpilot/ai';

/**
 * CompositeAIProvider routes calls to the correct model tier:
 *  - complete() / stream()  → content model (GEMINI_MODEL_CONTENT)
 *  - embed()                → embedding model (GEMINI_MODEL_EMBEDDING)
 *
 * This is needed because the graphs accept a single AIProvider but internally
 * call both text-generation and embedding methods which require different models.
 */
class CompositeAIProvider implements AIProvider {
  readonly providerName = 'gemini-composite';
  readonly modelName: string;

  constructor(
    private readonly contentProvider: GeminiProvider,
    private readonly embeddingProvider: GeminiProvider,
  ) {
    this.modelName = contentProvider.modelName;
  }

  complete<T = string>(request: CompletionRequest): Promise<CompletionResponse<T>> {
    return this.contentProvider.complete<T>(request);
  }

  stream(request: CompletionRequest): AsyncIterable<string> {
    return this.contentProvider.stream(request);
  }

  embed(request: EmbeddingRequest): Promise<EmbeddingResponse> {
    return this.embeddingProvider.embed(request);
  }
}

/**
 * AIFactoryService — provides task-aware AI providers via ModelRouter.
 *
 * Bug fix (2026-09-19): Previously read 'GEMINI_MODEL' (undefined) falling back
 * to deprecated 'gemini-2.5-flash' → API 404. Now reads all GEMINI_MODEL_*
 * env vars and properly routes through ModelRouter.
 *
 * The composite provider pattern ensures embed() calls use gemini-embedding-2
 * while complete() calls use gemini-3.6-flash — all through the same AIProvider
 * interface the graphs expect.
 */
@Injectable()
export class AIFactoryService {
  private readonly compositeProvider: AIProvider;
  private readonly router: ModelRouter;

  constructor(private readonly config: ConfigService) {
    const aiConfig: AIConfig = {
      apiKey: this.config.get<string>('GEMINI_API_KEY', ''),
      modelContent: this.config.get<string>('GEMINI_MODEL_CONTENT', 'gemini-2.0-flash'),
      modelClassification: this.config.get<string>('GEMINI_MODEL_CLASSIFICATION', 'gemini-2.0-flash-lite'),
      modelEmbedding: this.config.get<string>('GEMINI_MODEL_EMBEDDING', 'gemini-embedding-exp-03-07'),
      embeddingDimensions: this.config.get<number>('GEMINI_EMBEDDING_DIMENSIONS', 768),
      maxRetries: this.config.get<number>('GEMINI_MAX_RETRIES', 3),
      timeoutMs: this.config.get<number>('GEMINI_REQUEST_TIMEOUT_MS', 30000),
    };

    this.router = new ModelRouter(aiConfig);

    // Build separate providers for content and embedding
    const contentProvider = new GeminiProvider(
      aiConfig.apiKey,
      aiConfig.modelContent,
      aiConfig.maxRetries,
      aiConfig.timeoutMs,
    );

    const embeddingProvider = new GeminiProvider(
      aiConfig.apiKey,
      aiConfig.modelEmbedding,
      aiConfig.maxRetries,
      aiConfig.timeoutMs,
      aiConfig.embeddingDimensions,
    );

    this.compositeProvider = new CompositeAIProvider(contentProvider, embeddingProvider);
  }

  /**
   * Returns a composite AIProvider that routes complete() → content model
   * and embed() → embedding model. Use this for all graph invocations.
   */
  getProvider(): AIProvider {
    return this.compositeProvider;
  }

  /**
   * Returns a task-specific provider via the ModelRouter.
   * Use when you need a specific model tier for a direct API call.
   */
  forTask(task: Parameters<ModelRouter['forTask']>[0]): AIProvider {
    return this.router.forTask(task);
  }
}
