import type { AIProvider } from '@threadpilot/ai';
import { createLogger } from '@threadpilot/observability';
import {
  buildReplySystemPrompt,
  buildReplyUserPrompt,
  PROMPT_VERSION_ENGAGEMENT_REPLY,
} from '@threadpilot/prompts';
import { validateThreadText, type StyleFeatures } from '@threadpilot/types';
import {
  ReplyDraftOutputSchema,
  type ReplyDraftOutput,
} from '../state';

const logger = createLogger({ service: 'ReplyGenerationGraph' });

export interface ReplyGenerationInput {
  interactionId: string;
  commentText: string;
  authorUsername: string;
  intent: string;
  rootPostText?: string | null | undefined;
  parentCommentText?: string | null | undefined;
  styleProfile?: StyleFeatures | null | undefined;
  styleExemplars?: Array<{ text: string; reason?: string }> | undefined;
  userPreference?: string | null | undefined;
}

export interface ReplyGenerationOutput {
  draft: ReplyDraftOutput;
  validation: { valid: boolean; length: number; error?: string };
  promptVersion: string;
  model: string;
}

export class ReplyGenerationGraph {
  constructor(private readonly aiProvider: AIProvider) {}

  async execute(input: ReplyGenerationInput): Promise<ReplyGenerationOutput> {
    const {
      interactionId,
      commentText,
      authorUsername,
      intent,
      rootPostText,
      parentCommentText,
      styleProfile,
      styleExemplars,
      userPreference,
    } = input;

    logger.debug({ interactionId, authorUsername, intent }, 'Synthesizing contextual reply draft');

    const systemPrompt = buildReplySystemPrompt();
    const userPrompt = buildReplyUserPrompt({
      commentText,
      authorUsername,
      intent,
      rootPostText,
      parentCommentText,
      styleProfile,
      styleExemplars,
      userPreference,
    });

    const completion = await this.aiProvider.complete<ReplyDraftOutput>({
      systemPrompt,
      userPrompt,
      outputSchema: ReplyDraftOutputSchema,
    });

    const draft = completion.result;

    // Authoritative Meta 500 UTF-16 code units check
    const validation = validateThreadText(draft.body);
    if (!validation.valid) {
      logger.error(
        { interactionId, length: validation.length, error: validation.error },
        'Generated reply failed authoritative 500-char validation',
      );
      throw new Error(`Generated reply violates Threads contract: ${validation.error}`);
    }

    logger.info(
      {
        interactionId,
        length: validation.length,
        model: completion.model,
      },
      'Contextual reply draft synthesized successfully',
    );

    return {
      draft,
      validation,
      promptVersion: PROMPT_VERSION_ENGAGEMENT_REPLY,
      model: completion.model,
    };
  }
}
