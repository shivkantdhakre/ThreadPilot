import type { AIProvider } from '@threadpilot/ai';
import { createLogger } from '@threadpilot/observability';
import {
  buildClassifySystemPrompt,
  buildClassifyUserPrompt,
  PROMPT_VERSION_ENGAGEMENT_CLASSIFY,
} from '@threadpilot/prompts';
import { PolicyConfig, POLICY_RULES_V1 } from '@threadpilot/config';
import {
  InteractionClassificationOutputSchema,
  type InteractionClassificationOutput,
  type PreGenerationPolicyResult,
} from '../state';

const logger = createLogger({ service: 'InteractionClassifierGraph' });

export interface ClassifierGraphInput {
  interactionId: string;
  commentText: string;
  authorUsername: string;
  rootPostText?: string | null | undefined;
  parentCommentText?: string | null | undefined;
  accountAutonomyMode?: 'OFF' | 'SHADOW' | 'REVIEW_ONLY' | 'RULES_BASED' | undefined;
}

export interface ClassifierGraphOutput {
  classification: InteractionClassificationOutput;
  policyDecision: PreGenerationPolicyResult;
  promptVersion: string;
  classifierModel: string;
}

export class InteractionClassifierGraph {
  constructor(
    private readonly aiProvider: AIProvider,
    private readonly policyConfig: PolicyConfig = POLICY_RULES_V1,
  ) {}

  /**
   * Executes intent classification and Stage 1 Pre-Generation Policy evaluation.
   */
  async execute(input: ClassifierGraphInput): Promise<ClassifierGraphOutput> {
    const {
      interactionId,
      commentText,
      authorUsername,
      rootPostText,
      parentCommentText,
      accountAutonomyMode = 'REVIEW_ONLY',
    } = input;

    logger.debug({ interactionId, authorUsername }, 'Executing interaction classification');

    const systemPrompt = buildClassifySystemPrompt();
    const userPrompt = buildClassifyUserPrompt({
      commentText,
      authorUsername,
      rootPostText,
      parentCommentText,
    });

    const completion = await this.aiProvider.complete<InteractionClassificationOutput>({
      systemPrompt,
      userPrompt,
      outputSchema: InteractionClassificationOutputSchema,
    });

    const classification = completion.result;
    const policyDecision = this.evaluatePreGenerationPolicy(classification, accountAutonomyMode);

    logger.info(
      {
        interactionId,
        intent: classification.intent,
        intentConfidence: classification.intentConfidence,
        priorityScore: classification.priorityScore,
        policyDecision: policyDecision.decision,
        reasonCodes: policyDecision.reasonCodes,
      },
      'Interaction classification completed',
    );

    return {
      classification,
      policyDecision,
      promptVersion: PROMPT_VERSION_ENGAGEMENT_CLASSIFY,
      classifierModel: completion.model,
    };
  }

  /**
   * Stage 1: Pre-Generation Policy Gate
   * Evaluates incoming comment safety, intent, topic sensitivity, and autonomy mode
   * to determine whether generation is permitted.
   */
  evaluatePreGenerationPolicy(
    classification: InteractionClassificationOutput,
    accountAutonomyMode: 'OFF' | 'SHADOW' | 'REVIEW_ONLY' | 'RULES_BASED',
  ): PreGenerationPolicyResult {
    const reasonCodes: string[] = [];
    const { thresholds, allowedIntents, blockedIntents } = this.policyConfig;

    // 1. Prompt Injection Check
    if (classification.isPromptInjection || classification.safetyFlags.includes('PROMPT_INJECTION')) {
      reasonCodes.push('INJECTION_DETECTED');
    }

    // 2. Toxicity Check
    if (classification.toxicityScore > thresholds.maxToxicityScore) {
      reasonCodes.push('TOXICITY_HIGH');
    }

    // 3. Harassment Check
    if (classification.harassmentScore > thresholds.maxHarassmentScore) {
      reasonCodes.push('HARASSMENT_HIGH');
    }

    // 4. Controversy Check
    if (classification.controversyScore > thresholds.maxControversyScore) {
      reasonCodes.push('CONTROVERSIAL_TOPIC');
    }

    // 5. Confidence Check
    if (classification.intentConfidence < thresholds.minIntentConfidence) {
      reasonCodes.push('LOW_CONFIDENCE');
    }

    // 6. Blocked Intent Check
    if (blockedIntents.includes(classification.intent)) {
      reasonCodes.push(`BLOCKED_INTENT_${classification.intent}`);
    }

    // ── Decision Determination ──
    let decision: 'AUTO_REPLY' | 'REVIEW_REQUIRED' | 'BLOCKED' | 'NOT_APPLICABLE' = 'REVIEW_REQUIRED';
    let wouldAutoReplyInLive = false;

    // Hard Block Rule: Explicit Trolling, Spam, or High-Confidence Prompt Injection
    if (
      classification.intent === 'TROLLING' ||
      classification.intent === 'SPAM' ||
      (classification.isPromptInjection && classification.intentConfidence >= 0.85)
    ) {
      decision = 'BLOCKED';
    }
    // No Response Needed Rule: Bare Emojis, Gibberish, or Low-Priority Unclear
    else if (classification.intent === 'UNCLEAR' && classification.priorityScore <= 2) {
      decision = 'NOT_APPLICABLE';
    }
    // High-Confidence Eligible Engagement
    else if (
      reasonCodes.length === 0 &&
      allowedIntents.includes(classification.intent)
    ) {
      // In live rules-based mode, this qualifies for autonomous reply
      wouldAutoReplyInLive = true;

      if (accountAutonomyMode === 'RULES_BASED') {
        decision = 'AUTO_REPLY';
      } else {
        // In OFF, SHADOW, or REVIEW_ONLY mode, human review is required
        if (accountAutonomyMode === 'SHADOW') {
          reasonCodes.push('SHADOW_MODE_ACTIVE');
        } else if (accountAutonomyMode === 'OFF') {
          reasonCodes.push('AUTONOMY_DISABLED');
        }
        decision = 'REVIEW_REQUIRED';
      }
    } else {
      // Any other case (e.g. slight controversy, medium confidence, disagreed intent) routes to human review
      decision = 'REVIEW_REQUIRED';
    }

    return {
      decision,
      reasonCodes,
      wouldAutoReplyInLive,
      policyVersion: this.policyConfig.policyVersion,
    };
  }
}
