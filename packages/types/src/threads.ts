// ─── Threads API wire types ───────────────────────────────────────────────────
// Prefixed ThreadsApi* to distinguish from internal application types.
// These mirror the Threads Graph API response shapes.
// IMPORTANT: Verify all field names against current Meta developer documentation
// before implementation — these are planning-time assumptions.

export interface ThreadsApiUserInfo {
  id: string;
  username: string;
  name: string;
  threads_profile_picture_url?: string;
  threads_biography?: string;
}

export interface ThreadsApiPost {
  id: string;
  text?: string;
  media_type: 'TEXT_POST' | 'IMAGE' | 'VIDEO' | 'CAROUSEL_ALBUM';
  timestamp: string;      // ISO 8601
  permalink?: string;
  is_quote_post?: boolean;
}

export interface ThreadsApiPostList {
  data: ThreadsApiPost[];
  paging?: {
    cursors?: {
      before?: string;
      after?: string;
    };
    next?: string;
    previous?: string;
  };
}

export interface ThreadsApiPublishingLimit {
  quota_usage: number;
  config: {
    quota_total: number;
    quota_duration: number;  // seconds (typically 86400)
  };
  reply_quota_usage?: number;
  reply_config?: {
    quota_total: number;
    quota_duration: number;
  };
}

export interface ThreadsApiTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  user_id?: string | number;
  username?: string;
  refresh_token?: string;
}

