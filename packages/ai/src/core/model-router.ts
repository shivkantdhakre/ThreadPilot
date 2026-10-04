import { GeminiProvider } from '../providers/gemini/gemini-provider';
import { AIProvider } from './ai-provider';

/**
 * Task types — maps to different model tiers.
 * Adding a new task type requires only adding a case here,
 * not touching any agent or capability code.
 */
export type TaskType =
  | 'content_generation'
  | 'content_improvement'
  | 'style_analysis'
  | 'style_example_selection'
  | 'quality_evaluation'
  | 'risk_evaluation'
  | 'classification'
  | 'spam_detection'
  | 'embedding';

export interface AIConfig {
  apiKey: string;
  modelContent: string;                 // GEMINI_MODEL_CONTENT
  modelContentFallbacks?: string[];     // GEMINI_MODEL_CONTENT_FALLBACKS
  modelClassification: string;          // GEMINI_MODEL_CLASSIFICATION
  modelClassificationFallbacks?: string[];
  modelEmbedding: string;               // GEMINI_MODEL_EMBEDDING
  modelEmbeddingFallbacks?: string[];   // GEMINI_MODEL_EMBEDDING_FALLBACKS
  embeddingDimensions: number;          // GEMINI_EMBEDDING_DIMENSIONS
  maxRetries: number;
  timeoutMs: number;
}

export const DEFAULT_CONTENT_FALLBACKS: string[] = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const DEFAULT_CLASSIFICATION_FALLBACKS: string[] = [
  'gemini-flash-lite-latest',
  'gemini-3.1-flash-lite',
  'gemini-3.8-flash',
  'gemini-3.5-flash',
  'gemini-3.6-flash',
  'gemini-flash-latest',
  'gemini-3.7-flash',
  'gemini-pro-latest',
  'gemini-2.5-flash',
  'gemini-2.5-pro',
];

export const DEFAULT_EMBEDDING_FALLBACKS: string[] = [
  'gemini-embedding-2-preview',
  'gemini-embedding-001',
];

/**
 * Returns the correct AIProvider instance for a given task type.
 * All model names come from config (env) — changing a model is a config change only.
 */
export class ModelRouter {
  constructor(private readonly config: AIConfig) {}

  forTask(task: TaskType): AIProvider {
    switch (task) {
      case 'content_generation':
      case 'content_improvement':
      case 'style_analysis':
      case 'style_example_selection':
      case 'quality_evaluation':
      case 'risk_evaluation':
        return new GeminiProvider(
          this.config.apiKey,
          this.config.modelContent,
          this.config.maxRetries,
          this.config.timeoutMs,
          undefined,
          this.config.modelContentFallbacks ?? DEFAULT_CONTENT_FALLBACKS,
        );

      case 'classification':
      case 'spam_detection':
        return new GeminiProvider(
          this.config.apiKey,
          this.config.modelClassification,
          this.config.maxRetries,
          this.config.timeoutMs,
          undefined,
          this.config.modelClassificationFallbacks ?? DEFAULT_CLASSIFICATION_FALLBACKS,
        );

      case 'embedding':
        return new GeminiProvider(
          this.config.apiKey,
          this.config.modelEmbedding,
          this.config.maxRetries,
          this.config.timeoutMs,
          this.config.embeddingDimensions,
          this.config.modelEmbeddingFallbacks ?? DEFAULT_EMBEDDING_FALLBACKS,
        );
    }
  }
}
