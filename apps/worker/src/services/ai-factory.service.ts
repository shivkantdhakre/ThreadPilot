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
  readonly capabilities = {
    structuredOutput: true,
    streaming: true,
    embeddings: true,
    tools: false,
    vision: false,
    multimodal: false,
  };

  getCapabilities() {
    return this.capabilities;
  }

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
 * The composite provider pattern ensures embed() calls use gemini-embedding-2
 * while complete() calls use gemini-3.5-flash-lite — all through the same AIProvider
 * interface the graphs expect.
 *
 * Vector Coordinate Space Purity:
 * GEMINI_MODEL_EMBEDDING_FALLBACKS defaults to empty. We never silently fall back
 * to a different embedding model (e.g. gemini-embedding-001) within the same pgvector
 * index because different models inhabit distinct vector coordinate spaces.
 */
@Injectable()
export class AIFactoryService {
  private readonly compositeProvider: AIProvider;
  private readonly router: ModelRouter;

  constructor(private readonly config: ConfigService) {
    const contentFallbacks = this.config
      .get<string>('GEMINI_MODEL_CONTENT_FALLBACKS', 'gemini-3.1-flash-lite,gemini-3.7-flash')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    // Default to empty: do not switch vector coordinate spaces across models in the same index
    const embeddingFallbacks = this.config
      .get<string>('GEMINI_MODEL_EMBEDDING_FALLBACKS', '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const aiConfig: AIConfig = {
      apiKey: this.config.get<string>('GEMINI_API_KEY', ''),
      modelContent: this.config.get<string>('GEMINI_MODEL_CONTENT', 'gemini-3.5-flash-lite'),
      modelContentFallbacks: contentFallbacks,
      modelClassification: this.config.get<string>('GEMINI_MODEL_CLASSIFICATION', 'gemini-3.5-flash-lite'),
      modelEmbedding: this.config.get<string>('GEMINI_MODEL_EMBEDDING', 'gemini-embedding-2'),
      modelEmbeddingFallbacks: embeddingFallbacks,
      embeddingDimensions: this.config.get<number>('GEMINI_EMBEDDING_DIMENSIONS', 768),
      maxRetries: this.config.get<number>('GEMINI_MAX_RETRIES', 3),
      timeoutMs: this.config.get<number>('GEMINI_REQUEST_TIMEOUT_MS', 30000),
    };

    this.router = new ModelRouter(aiConfig);

    // Build separate providers for content and embedding with configuration-driven fallbacks
    const contentProvider = new GeminiProvider(
      aiConfig.apiKey,
      aiConfig.modelContent,
      aiConfig.maxRetries,
      aiConfig.timeoutMs,
      undefined,
      aiConfig.modelContentFallbacks,
    );

    const embeddingProvider = new GeminiProvider(
      aiConfig.apiKey,
      aiConfig.modelEmbedding,
      aiConfig.maxRetries,
      aiConfig.timeoutMs,
      aiConfig.embeddingDimensions,
      aiConfig.modelEmbeddingFallbacks,
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
