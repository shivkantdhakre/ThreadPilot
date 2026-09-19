import type { ThreadsApiUserInfo, ThreadsApiPostList, ThreadsApiPublishingLimit } from '@threadpilot/types';

/**
 * ThreadsApiClient — all Threads Graph API calls.
 *
 * All API paths, field names, and parameter names are here — nowhere else.
 * If the Threads API changes a field name, only this file changes.
 * THREADS_API_BASE_URL comes from env — not hardcoded.
 *
 * IMPORTANT: Verify all endpoint paths and field names against current
 * Meta developer documentation before implementing. These are planning-time stubs.
 */
export class ThreadsApiClient {
  constructor(private readonly baseUrl: string) {}

  async getUserInfo(accessToken: string): Promise<ThreadsApiUserInfo> {
    const fields = 'id,username,name,threads_profile_picture_url,threads_biography';
    const url = `${this.baseUrl}/me?fields=${fields}&access_token=${accessToken}`;
    const response = await this.get<ThreadsApiUserInfo>(url);
    return response;
  }

  async getUserPosts(
    accessToken: string,
    cursor?: string,
    limit = 25,
  ): Promise<ThreadsApiPostList> {
    const fields = 'id,text,media_type,timestamp,permalink,is_quote_post';
    const params = new URLSearchParams({
      fields,
      limit: String(Math.min(limit, 100)),
      access_token: accessToken,
    });
    if (cursor) params.set('after', cursor);

    const url = `${this.baseUrl}/me/threads?${params.toString()}`;
    return this.get<ThreadsApiPostList>(url);
  }

  async getPublishingLimit(accessToken: string): Promise<ThreadsApiPublishingLimit> {
    const fields = 'quota_usage,config,reply_quota_usage,reply_config';
    const url = `${this.baseUrl}/me/threads_publishing_limit?fields=${fields}&access_token=${accessToken}`;
    type LimitWrapper = { data: ThreadsApiPublishingLimit[] };
    const wrapper = await this.get<LimitWrapper>(url);
    const limit = wrapper.data[0];
    if (!limit) throw new Error('No publishing limit data returned from Threads API');
    return limit;
  }

  private async get<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) {
      const body = await response.text();
      throw new ThreadsApiError(response.status, body);
    }
    return response.json() as Promise<T>;
  }
}

export class ThreadsApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string,
  ) {
    super(`Threads API error ${statusCode}: ${body}`);
    this.name = 'ThreadsApiError';
  }
}
