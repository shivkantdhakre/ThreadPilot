export type {
  AIProvider,
  AIProviderCapabilities,
  AIFailureCategory,
  AIErrorClassification,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
  EmbeddingTaskType,
} from './core/ai-provider';
export {
  ModelRouter,
  DEFAULT_CONTENT_FALLBACKS,
  DEFAULT_CLASSIFICATION_FALLBACKS,
  DEFAULT_EMBEDDING_FALLBACKS,
} from './core/model-router';
export type { TaskType, AIConfig } from './core/model-router';
export {
  GeminiProvider,
  classifyAIError,
  formatGeminiEmbeddingInput,
} from './providers/gemini/gemini-provider';
