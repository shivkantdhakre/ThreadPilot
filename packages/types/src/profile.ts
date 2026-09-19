// ─── Profile types ────────────────────────────────────────────────────────────

export interface StyleFeatures {
  avgPostLengthChars: number;
  avgSentenceLengthWords: number;
  questionFrequency: number;       // 0–1
  emojiFrequency: number;          // 0–1
  firstPersonFrequency: number;    // 0–1
  technicalVocabScore: number;     // 0–1
  listUsageFrequency: number;      // 0–1
  contraryHookFrequency: number;   // 0–1
}

export interface UserProfileDto {
  id: string;
  workspaceId: string;
  bio: string | null;
  profession: string | null;
  expertise: string[];
  positioning: string | null;
  styleFeatures: StyleFeatures | null;
  profileVersion: number;
  styleExtractedAt: string | null;
  updatedAt: string;
}

export interface UpdateProfileDto {
  bio?: string;
  profession?: string;
  expertise?: string[];
  positioning?: string;
}

export interface UserPreferencesDto {
  workspaceId: string;
  preferredTopics: string[];
  excludedTopics: string[];
  preferredFormats: string[];
  postingFrequency: number | null;
  preferredTimezone: string;
  autonomyPublishing: AutomationLevel;
  autonomyReplies: AutomationLevel;
  autonomyResearch: AutomationLevel;
  autonomyContentGen: AutomationLevel;
  automationPaused: boolean;
  publishingPaused: boolean;
  repliesPaused: boolean;
}

export type AutomationLevel = 'MANUAL' | 'APPROVAL' | 'RULES_BASED' | 'AUTONOMOUS';

export interface StyleExampleDto {
  id: string;
  text: string;
  topic: string | null;
  format: string | null;
  styleFeatures: StyleFeatures;
  quality: number | null;
  userRating: number | null;  // -1 | 0 | 1
}

export interface StyleProfileSnapshotDto {
  id: string;
  version: number;
  features: StyleFeatures;
  source: string;
  createdAt: string;
}
