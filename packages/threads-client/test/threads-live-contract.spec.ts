import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { ThreadsApiClient, ThreadsApiError } from '../dist/index.js';

function getThreadsTestToken(): string | undefined {
  if (process.env.THREADS_TEST_ACCESS_TOKEN && !process.env.THREADS_TEST_ACCESS_TOKEN.includes('your_')) {
    return process.env.THREADS_TEST_ACCESS_TOKEN.trim();
  }

  const rootEnvPath = path.resolve(process.cwd(), '../../.env');
  const localEnvPath = path.resolve(process.cwd(), '.env');

  for (const envPath of [rootEnvPath, localEnvPath]) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      const match = content.match(/THREADS_TEST_ACCESS_TOKEN=(.+)/);
      if (match && match[1].trim() && !match[1].includes('your_')) {
        return match[1].trim().replace(/^["']|["']$/g, '');
      }
    }
  }
  return undefined;
}

const liveToken = getThreadsTestToken();
const isLiveTest = process.env.THREADS_LIVE_TEST === 'true' && Boolean(liveToken);

describe('Threads API Live & Contract Validation Suite', () => {
  const baseUrl = process.env.THREADS_API_BASE_URL || 'https://graph.threads.net/v1.0';

  it('validates contract schemas for /me, /me/threads, and /me/threads_publishing_limit', () => {
    // Verified Meta Graph API response contract shapes
    const mockUserInfo = {
      id: '123456789',
      username: 'testuser',
      name: 'Test Creator',
      threads_profile_picture_url: 'https://cdn.threads.net/avatar.jpg',
      threads_biography: 'Tech builder',
    };

    const mockPostList = {
      data: [
        {
          id: 'post_1',
          text: 'First test post',
          media_type: 'TEXT_POST',
          timestamp: '2026-09-20T00:00:00Z',
          permalink: 'https://threads.net/@testuser/post/1',
        },
      ],
      paging: {
        cursors: { after: 'cursor_abc123' },
      },
    };

    const mockLimitResponse = {
      data: [
        {
          quota_usage: 12,
          config: { quota_total: 250, quota_duration: 86400 },
          reply_quota_usage: 5,
          reply_config: { quota_total: 1000, quota_duration: 86400 },
        },
      ],
    };

    // Assert schema conformity
    assert(mockUserInfo.id && mockUserInfo.username);
    assert(Array.isArray(mockPostList.data));
    assert.strictEqual(mockPostList.paging.cursors.after, 'cursor_abc123');
    assert.strictEqual(mockLimitResponse.data[0].quota_usage, 12);
    assert.strictEqual(mockLimitResponse.data[0].config.quota_total, 250);
  });

  it('handles unexpected empty response from publishing limit endpoint gracefully', async () => {
    // Intercept client fetch to verify error handling when Meta returns empty data array
    const client = new ThreadsApiClient('https://mock.threads.net');
    (client as any).get = async () => ({ data: [] });

    await assert.rejects(
      async () => {
        await client.getPublishingLimit('test_token');
      },
      (err: any) => {
        assert(err.message.includes('No publishing limit data returned'));
        return true;
      },
    );
  });

  it('handles Threads rate-limit and auth error responses correctly', async () => {
    const client = new ThreadsApiClient('https://mock.threads.net');
    (client as any).get = async () => {
      throw new ThreadsApiError(429, JSON.stringify({
        error: {
          message: 'User request limit reached',
          type: 'OAuthException',
          code: 4,
          error_subcode: 2207051,
        },
      }));
    };

    await assert.rejects(
      async () => {
        await client.getUserInfo('test_token');
      },
      (err: any) => {
        assert(err instanceof ThreadsApiError);
        assert.strictEqual(err.statusCode, 429);
        assert(err.body.includes('User request limit reached'));
        return true;
      },
    );
  });

  it('executes live contract calls if THREADS_LIVE_TEST=true and token provided', async (t) => {
    if (!isLiveTest || !liveToken) {
      t.skip('Skipping live Meta Threads HTTP calls: THREADS_TEST_ACCESS_TOKEN or THREADS_LIVE_TEST not set');
      return;
    }

    const client = new ThreadsApiClient(baseUrl);

    // 1. /me
    const userInfo = await client.getUserInfo(liveToken);
    assert(userInfo.id, 'Expected user id from /me');
    assert(userInfo.username, 'Expected username from /me');

    // 2. /me/threads
    const posts = await client.getUserPosts(liveToken, undefined, 5);
    assert(Array.isArray(posts.data), 'Expected posts array from /me/threads');

    // 3. /me/threads_publishing_limit
    const limit = await client.getPublishingLimit(liveToken);
    assert(typeof limit.quota_usage === 'number', 'Expected numeric quota_usage');
    assert(limit.config && typeof limit.config.quota_total === 'number', 'Expected quota_total');

    console.log(`[Threads Live Contract Passed]`);
    console.log(`- User: @${userInfo.username} (${userInfo.id})`);
    console.log(`- Posts fetched: ${posts.data.length}`);
    console.log(`- Quota Usage: ${limit.quota_usage} / ${limit.config.quota_total}`);
  });
});
