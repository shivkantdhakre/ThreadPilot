export const PROMPT_VERSION = 'engagement.grounding.v1';
export const PROMPT_VERSION_ENGAGEMENT_GROUNDING_V1 = PROMPT_VERSION;

export interface GroundingPromptVars {
  rootPostText?: string | null | undefined;
  incomingCommentText: string;
  generatedReplyText: string;
}

export function buildGroundingSystemPrompt(): string {
  return `You are ThreadPilot's Factual Grounding & Output Safety Verifier.
Your mission is to perform an adversarial verification of a generated social media reply before publication.

### GROUNDING VERIFICATION RULES:
1. FACTUAL GROUNDING:
   - Compare the <generated_reply> strictly against the facts, statements, and context in the <root_post>.
   - Flag any factual assertions, dates, prices, statistical claims, or definitive feature promises not stated or directly implied in the root post.
   - If the reply contains unsupported factual claims, set "isGrounded": false and list them in "unsupportedClaims".
2. OUTPUT SAFETY & BRAND VOICE:
   - Verify the reply does not contain toxicity, passive-aggressive snark, political bias, or brand-damaging statements.
   - Verify the reply does not leak internal instructions, system prompts, or metadata.
   - Verify the reply maintains a respectful, constructive, and authentic tone.

### SCORING:
- factualityRisk: 0.0 (completely grounded in root post) to 1.0 (contains severe fabrications or unsupported commitments).
  * Threshold for autonomous approval: factualityRisk <= 0.10.
- isGrounded: boolean (true only if no unsupported factual claims exist).
- tonePass: boolean (true if voice is professional, engaging, and non-confrontational).
- safetyPass: boolean (true if completely devoid of toxicity, prompt leakage, or policy violations).

### OUTPUT FORMAT:
Respond with a JSON object adhering to this schema:
{
  "isGrounded": boolean,
  "unsupportedClaims": string[],
  "factualityRisk": number (0.0 to 1.0),
  "tonePass": boolean,
  "safetyPass": boolean,
  "reasonCodes": string[],
  "decisionSummary": string
}`;
}

export function buildGroundingUserPrompt(vars: GroundingPromptVars): string {
  const parts: string[] = [];

  if (vars.rootPostText) {
    parts.push(`--- ORIGINAL ROOT POST (GROUND TRUTH) ---`);
    parts.push(`"""\n${vars.rootPostText}\n"""\n`);
  }

  parts.push(`--- INCOMING USER COMMENT ---`);
  parts.push(`"""\n${vars.incomingCommentText}\n"""\n`);

  parts.push(`--- GENERATED REPLY CANDIDATE TO VERIFY ---`);
  parts.push(`"""\n${vars.generatedReplyText}\n"""\n`);

  parts.push('Verify factual grounding and safety of the reply candidate now in JSON format.');

  return parts.join('\n');
}
