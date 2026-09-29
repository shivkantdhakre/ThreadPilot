import type { AIProvider } from '@threadpilot/ai';
import { createLogger } from '@threadpilot/observability';
import {
  buildGroundingSystemPrompt,
  buildGroundingUserPrompt,
  PROMPT_VERSION_ENGAGEMENT_GROUNDING,
} from '@threadpilot/prompts';
import { PolicyConfig, POLICY_RULES_V1 } from '@threadpilot/config';
import {
  PostGenerationGroundingOutputSchema,
  type PostGenerationGroundingOutput,
  type PostGenerationPolicyResult,
} from '../state';

const logger = createLogger({ service: 'PostGenerationSafetyGraph' });

export interface PostGenerationSafetyInput {
  interactionId: string;
  rootPostText?: string | null | undefined;
  incomingCommentText: string;
  generatedReplyText: string;
  accountAutonomyMode?: 'OFF' | 'SHADOW' | 'REVIEW_ONLY' | 'RULES_BASED' | undefined;
  killSwitchActive?: boolean | undefined;
}

export interface PostGenerationSafetyOutput {
  evaluation: PostGenerationGroundingOutput;
  policyDecision: PostGenerationPolicyResult;
  promptVersion: string;
  model: string;
}

export class PostGenerationSafetyGraph {
  constructor(
    private readonly aiProvider: AIProvider,
    private readonly policyConfig: PolicyConfig = POLICY_RULES_V1,
  ) {}

  async execute(input: PostGenerationSafetyInput): Promise<PostGenerationSafetyOutput> {
    const {
      interactionId,
      rootPostText,
      incomingCommentText,
      generatedReplyText,
      accountAutonomyMode = 'REVIEW_ONLY',
      killSwitchActive = false,
    } = input;

    logger.debug({ interactionId }, 'Executing Stage 2 post-generation grounding and output safety gate');

    const systemPrompt = buildGroundingSystemPrompt();
    const userPrompt = buildGroundingUserPrompt({
      rootPostText,
      incomingCommentText,
      generatedReplyText,
    });

    const completion = await this.aiProvider.complete<PostGenerationGroundingOutput>({
      systemPrompt,
      userPrompt,
      outputSchema: PostGenerationGroundingOutputSchema,
    });

    const evaluation = completion.result;
    const policyDecision = this.evaluatePostGenerationPolicy(
      evaluation,
      accountAutonomyMode,
      killSwitchActive,
    );

    logger.info(
      {
        interactionId,
        isGrounded: evaluation.isGrounded,
        factualityRisk: evaluation.factualityRisk,
        safetyPass: evaluation.safetyPass,
        decision: policyDecision.decision,
        wouldAutoReplyInLive: policyDecision.wouldAutoReplyInLive,
        reasonCodes: policyDecision.reasonCodes,
      },
      'Post-generation grounding gate completed',
    );

    return {
      evaluation,
      policyDecision,
      promptVersion: PROMPT_VERSION_ENGAGEMENT_GROUNDING,
      model: completion.model,
    };
  }

  evaluatePostGenerationPolicy(
    evaluation: PostGenerationGroundingOutput,
    accountAutonomyMode: 'OFF' | 'SHADOW' | 'REVIEW_ONLY' | 'RULES_BASED',
    killSwitchActive: boolean,
  ): PostGenerationPolicyResult {
    const reasonCodes: string[] = [];
    const { thresholds } = this.policyConfig;

    // 1. Kill switch check
    if (killSwitchActive) {
      reasonCodes.push('KILL_SWITCH_ACTIVE');
    }

    // 2. Factual grounding check
    if (!evaluation.isGrounded || evaluation.unsupportedClaims.length > 0) {
      reasonCodes.push('UNSUPPORTED_CLAIM');
    }

    // 3. Factuality risk threshold
    if (evaluation.factualityRisk > thresholds.maxFactualityRisk) {
      reasonCodes.push('FACTUALITY_UNVERIFIED');
    }

    // 4. Safety & Tone check
    if (!evaluation.safetyPass) {
      reasonCodes.push('OUTPUT_SAFETY_FAILED');
    }
    if (!evaluation.tonePass) {
      reasonCodes.push('TONE_MISMATCH');
    }

    // ── Decision Determination ──
    let decision: 'AUTO_REPLY' | 'REVIEW_REQUIRED' | 'BLOCKED' = 'REVIEW_REQUIRED';
    let wouldAutoReplyInLive = false;

    if (!evaluation.safetyPass) {
      // Unsafe output is blocked
      decision = 'BLOCKED';
    } else if (
      evaluation.isGrounded &&
      evaluation.unsupportedClaims.length === 0 &&
      evaluation.factualityRisk <= thresholds.maxFactualityRisk &&
      evaluation.tonePass
    ) {
      // Passes factual grounding and safety
      wouldAutoReplyInLive = true;

      if (accountAutonomyMode === 'RULES_BASED' && !killSwitchActive) {
        decision = 'AUTO_REPLY';
      } else {
        if (killSwitchActive) {
          // Reason already contains KILL_SWITCH_ACTIVE
        } else if (accountAutonomyMode === 'SHADOW') {
          reasonCodes.push('SHADOW_MODE_ACTIVE');
        } else if (accountAutonomyMode === 'OFF') {
          reasonCodes.push('AUTONOMY_DISABLED');
        } else {
          reasonCodes.push('REVIEW_ONLY_MODE');
        }
        decision = 'REVIEW_REQUIRED';
      }
    } else {
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
