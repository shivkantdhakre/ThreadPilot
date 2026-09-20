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
export { ModelRouter } from './core/model-router';
export type { TaskType, AIConfig } from './core/model-router';
export {
  GeminiProvider,
  classifyAIError,
  formatGeminiEmbeddingInput,
} from './providers/gemini/gemini-provider';
