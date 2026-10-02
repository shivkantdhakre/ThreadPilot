import type {
  ThreadsApiUserInfo,
  ThreadsApiPostList,
  ThreadsApiPublishingLimit,
  ThreadsApiPost,
  ThreadsApiReplyList,
} from '@threadpilot/types';

export interface GetUserPostsOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  since?: Date | undefined;
  until?: Date | undefined;
  timeoutMs?: number | undefined;
}

export interface GetPostRepliesOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  since?: Date | undefined;
  until?: Date | undefined;
  reverse?: boolean | undefined;
  timeoutMs?: number | undefined;
}

export interface GetConversationOptions {
  cursor?: string | undefined;
  limit?: number | undefined;
  timeoutMs?: number | undefined;
}

/**
 * ThreadsApiClient — all Threads Graph API calls.
 *
 * All API paths, field names, and parameter names are here — nowhere else.
 * If the Threads API changes a field name, only this file changes.
 * THREADS_API_BASE_URL comes from env — not hardcoded.
 */
export class ThreadsApiClient {
  constructor(private readonly baseUrl: string) {}

  async getUserInfo(
    accessToken: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<ThreadsApiUserInfo> {
    const fields = 'id,username,name,threads_profile_picture_url,threads_biography';
    const url = `${this.baseUrl}/me?fields=${fields}`;
    return this.get<ThreadsApiUserInfo>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  /**
   * Supports both legacy positional arguments (for existing ingestion)
   * and structured options with timeoutMs (for publishing recovery).
   */
  async getUserPosts(
    accessToken: string,
    optionsOrCursor?: string | GetUserPostsOptions,
    limit = 25,
  ): Promise<ThreadsApiPostList> {
    const opts: GetUserPostsOptions =
      typeof optionsOrCursor === 'string'
        ? { cursor: optionsOrCursor, limit }
        : optionsOrCursor === undefined
          ? { limit }
          : optionsOrCursor;

    const fields = 'id,text,media_type,timestamp,permalink,is_quote_post';
    const params = new URLSearchParams({
      fields,
      limit: String(Math.min(opts.limit ?? 25, 100)),
    });
    if (opts.cursor) params.set('after', opts.cursor);
    if (opts.since) params.set('since', String(Math.floor(opts.since.getTime() / 1000)));
    if (opts.until) params.set('until', String(Math.floor(opts.until.getTime() / 1000)));

    const url = `${this.baseUrl}/me/threads?${params.toString()}`;
    return this.get<ThreadsApiPostList>(url, accessToken, opts.timeoutMs ?? 15_000);
  }

  async getPostReplies(
    accessToken: string,
    threadId: string,
    options?: GetPostRepliesOptions,
  ): Promise<ThreadsApiReplyList> {
    const fields = 'id,text,timestamp,username,media_type,is_reply,is_reply_owned_by_me,root_post,replied_to,hide_status';
    const params = new URLSearchParams({
      fields,
      limit: String(Math.min(options?.limit ?? 50, 100)),
      reverse: String(options?.reverse ?? false),
    });
    if (options?.cursor) params.set('after', options.cursor);
    if (options?.since) params.set('since', String(Math.floor(options.since.getTime() / 1000)));
    if (options?.until) params.set('until', String(Math.floor(options.until.getTime() / 1000)));

    const url = `${this.baseUrl}/${threadId}/replies?${params.toString()}`;
    return this.get<ThreadsApiReplyList>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  async getConversation(
    accessToken: string,
    threadId: string,
    options?: GetConversationOptions,
  ): Promise<ThreadsApiReplyList> {
    const fields = 'id,text,timestamp,username,media_type,is_reply,replied_to';
    const params = new URLSearchParams({
      fields,
      limit: String(Math.min(options?.limit ?? 50, 100)),
    });
    if (options?.cursor) params.set('after', options.cursor);

    const url = `${this.baseUrl}/${threadId}/conversation?${params.toString()}`;
    return this.get<ThreadsApiReplyList>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  async getPublishingLimit(
    accessToken: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<ThreadsApiPublishingLimit> {
    const fields = 'quota_usage,config';
    const url = `${this.baseUrl}/me/threads_publishing_limit?fields=${fields}`;
    type LimitWrapper = { data: ThreadsApiPublishingLimit[] };
    const wrapper = await this.get<LimitWrapper>(url, accessToken, options?.timeoutMs ?? 15_000);
    const limit = wrapper.data[0];
    if (!limit) throw new Error('No publishing limit data returned from Threads API');
    return limit;
  }

  async getReplyPublishingLimit(
    accessToken: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<ThreadsApiPublishingLimit> {
    const fields = 'reply_quota_usage,reply_config,quota_usage,config';
    const url = `${this.baseUrl}/me/threads_publishing_limit?fields=${fields}`;
    type LimitWrapper = { data: ThreadsApiPublishingLimit[] };
    const wrapper = await this.get<LimitWrapper>(url, accessToken, options?.timeoutMs ?? 15_000);
    const limit = wrapper.data[0];
    if (!limit) throw new Error('No reply publishing limit data returned from Threads API');
    return limit;
  }

  async createTextContainer(
    accessToken: string,
    text: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'TEXT',
      text,
    });
    const url = `${this.baseUrl}/me/threads?${params.toString()}`;
    return this.postQuery<{ id: string }>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  async createReplyContainer(
    accessToken: string,
    text: string,
    replyToId: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      media_type: 'TEXT',
      text,
      reply_to_id: replyToId,
    });
    // auto_publish_text is strictly prohibited per Phase 3 architecture contract
    const url = `${this.baseUrl}/me/threads?${params.toString()}`;
    return this.postQuery<{ id: string }>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  async getContainerStatus(
    accessToken: string,
    containerId: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ id: string; status: string; error_message?: string }> {
    const url = `${this.baseUrl}/${containerId}?fields=id,status,error_message`;
    return this.get<{ id: string; status: string; error_message?: string }>(
      url,
      accessToken,
      options?.timeoutMs ?? 15_000,
    );
  }

  async getContainerPublishingStatus(
    accessToken: string,
    containerId: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ id: string; status: string; error_message?: string }> {
    return this.getContainerStatus(accessToken, containerId, options);
  }

  async publishContainer(
    accessToken: string,
    containerId: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<{ id: string }> {
    const params = new URLSearchParams({
      creation_id: containerId,
    });
    const url = `${this.baseUrl}/me/threads_publish?${params.toString()}`;
    return this.postQuery<{ id: string }>(url, accessToken, options?.timeoutMs ?? 15_000);
  }

  async getPost(
    accessToken: string,
    postId: string,
    options?: { timeoutMs?: number | undefined },
  ): Promise<ThreadsApiPost> {
    const fields = 'id,text,media_type,timestamp,permalink,username,owner';
    const url = `${this.baseUrl}/${postId}?fields=${fields}`;
    const post = await this.get<ThreadsApiPost>(url, accessToken, options?.timeoutMs ?? 15_000);
    if (post.owner?.id && !post.ownerId) {
      post.ownerId = post.owner.id;
    }
    return post;
  }

  async getPostInsights(
    accessToken: string,
    threadsPostId: string,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<{ data: Array<{ name: string; values: Array<{ value: number }> }> }> {
    const metrics = 'views,likes,replies,reposts,quotes';
    const url = `${this.baseUrl}/${threadsPostId}/insights?metric=${metrics}`;
    return this.get<{ data: Array<{ name: string; values: Array<{ value: number }> }> }>(
      url,
      accessToken,
      options?.timeoutMs ?? 15_000,
      options?.signal,
    );
  }

  private async get<T>(
    url: string,
    accessToken: string,
    timeoutMs = 15_000,
    externalSignal?: AbortSignal,
  ): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = externalSignal
      ? AbortSignal.any([timeoutSignal, externalSignal])
      : timeoutSignal;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal,
    });
    if (!response.ok) {
      const body = await response.text();
      throw new ThreadsApiError(response.status, body);
    }
    return response.json() as Promise<T>;
  }

  private async postQuery<T>(url: string, accessToken: string, timeoutMs = 15_000): Promise<T> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const respBody = await response.text();
      throw new ThreadsApiError(response.status, respBody);
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
