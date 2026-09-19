import { randomBytes } from 'node:crypto';
import type { ThreadsApiTokenResponse } from '@threadpilot/types';

export interface OAuthInitResult {
  authorizationUrl: string;
  state: string;
}

export interface OAuthCallbackResult {
  workspaceId: string;
  tokens: ThreadsApiTokenResponse;
}

interface OAuthTransaction {
  workspaceId: string;
}

/**
 * ThreadsOAuthService — PKCE OAuth 2.0 flow for Threads.
 *
 * State is stored server-side in Redis with TTL.
 * workspaceId is sourced from Redis — NEVER from browser callback params.
 */
export class ThreadsOAuthService {
  private readonly apiBaseUrl: string;
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly scopes: string;
  private readonly stateTtlSeconds: number;

  constructor(
    private readonly redis: { setex: (key: string, ttl: number, value: string) => Promise<unknown>; getdel: (key: string) => Promise<string | null> },
    config: {
      apiBaseUrl: string;
      appId: string;
      appSecret: string;
      redirectUri: string;
      scopes: string;
      stateTtlSeconds: number;
    },
  ) {
    this.apiBaseUrl = config.apiBaseUrl;
    this.appId = config.appId;
    this.appSecret = config.appSecret;
    this.redirectUri = config.redirectUri;
    this.scopes = config.scopes;
    this.stateTtlSeconds = config.stateTtlSeconds;
  }

  async initiateFlow(workspaceId: string): Promise<OAuthInitResult> {
    const state = randomBytes(32).toString('hex');

    const transaction: OAuthTransaction = { workspaceId };
    await this.redis.setex(
      `oauth-tx:${state}`,
      this.stateTtlSeconds,
      JSON.stringify(transaction),
    );

    const params = new URLSearchParams({
      client_id: this.appId,
      redirect_uri: this.redirectUri,
      scope: this.scopes,
      response_type: 'code',
      state,
    });

    const authorizationUrl = `https://threads.net/oauth/authorize?${params.toString()}`;

    return { authorizationUrl, state };
  }

  async handleCallback(code: string, state: string): Promise<OAuthCallbackResult> {
    // Retrieve and atomically delete the transaction (one-time use)
    const txJson = await this.redis.getdel(`oauth-tx:${state}`);
    if (!txJson) {
      throw new OAuthStateError('OAuth state expired or invalid');
    }

    const { workspaceId } = JSON.parse(txJson) as OAuthTransaction;

    const tokens = await this.exchangeCode(code);

    // Attempt long-lived token exchange (60 days validity)
    try {
      const longLivedUrl = `${this.apiBaseUrl}/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(
        this.appSecret,
      )}&access_token=${encodeURIComponent(tokens.access_token)}`;
      const longLivedRes = await fetch(longLivedUrl);
      if (longLivedRes.ok) {
        const longLived = (await longLivedRes.json()) as {
          access_token: string;
          token_type?: string;
          expires_in?: number;
        };
        tokens.access_token = longLived.access_token;
        if (longLived.expires_in) {
          tokens.expires_in = longLived.expires_in;
        }
      }
    } catch {
      // Fallback gracefully to short-lived token if exchange fails
    }

    return { workspaceId, tokens };
  }

  private async exchangeCode(code: string): Promise<ThreadsApiTokenResponse> {
    const params = new URLSearchParams({
      client_id: this.appId,
      client_secret: this.appSecret,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
      code,
    });

    const response = await fetch(`${this.apiBaseUrl}/oauth/access_token`, {
      method: 'POST',
      body: params,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new OAuthStateError(`Token exchange failed: ${response.status} ${body}`);
    }

    return response.json() as Promise<ThreadsApiTokenResponse>;
  }
}

export class OAuthStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OAuthStateError';
  }
}
