export type {
  AIProvider,
  AIProviderCapabilities,
  AIFailureCategory,
  AIErrorClassification,
  CompletionRequest,
  CompletionResponse,
  EmbeddingRequest,
  EmbeddingResponse,
} from './core/ai-provider';
export { ModelRouter } from './core/model-router';
export type { TaskType, AIConfig } from './core/model-router';
export { GeminiProvider, classifyAIError } from './providers/gemini/gemini-provider';
