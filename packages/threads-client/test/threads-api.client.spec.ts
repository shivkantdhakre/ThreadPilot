import { describe, it } from 'node:test';
import assert from 'node:assert';
import { ThreadsApiClient, ThreadsApiError } from '../dist/index.js';

describe('ThreadsApiClient Publishing & Graph API Tests', () => {
  const baseUrl = 'https://graph.threads.net/v1.0';

  it('createTextContainer sends media_type=TEXT and Bearer token header', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ id: 'container_abc123' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      const result = await client.createTextContainer('test-access-token', 'Hello world from ThreadPilot!');

      assert.strictEqual(result.id, 'container_abc123');
      assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-access-token');
      assert.ok(capturedUrl.includes('/me/threads?'));
      assert.ok(capturedUrl.includes('media_type=TEXT'));
      assert.ok(capturedUrl.includes('text=Hello+world+from+ThreadPilot%21'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('publishContainer sends creation_id and Bearer token header', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ id: 'post_xyz789' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      const result = await client.publishContainer('test-access-token', 'container_abc123');

      assert.strictEqual(result.id, 'post_xyz789');
      assert.strictEqual(capturedHeaders['Authorization'], 'Bearer test-access-token');
      assert.ok(capturedUrl.includes('/me/threads_publish?'));
      assert.ok(capturedUrl.includes('creation_id=container_abc123'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getContainerStatus fetches container status with Bearer token', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ id: 'container_abc123', status: 'FINISHED' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      const result = await client.getContainerStatus('test-access-token', 'container_abc123');

      assert.strictEqual(result.id, 'container_abc123');
      assert.strictEqual(result.status, 'FINISHED');
      assert.ok(capturedUrl.includes('/container_abc123?fields=id,status,error_message'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getPost fetches single post and normalizes ownerId', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(
        JSON.stringify({
          id: 'post_xyz789',
          text: 'Published post text',
          media_type: 'TEXT_POST',
          timestamp: '2026-09-20T12:00:00Z',
          permalink: 'https://threads.net/@user/post/xyz',
          username: 'threadpilot_dev',
          owner: { id: 'meta_user_456' },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      const post = await client.getPost('test-access-token', 'post_xyz789');

      assert.strictEqual(post.id, 'post_xyz789');
      assert.strictEqual(post.ownerId, 'meta_user_456');
      assert.strictEqual(post.media_type, 'TEXT_POST');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('getUserPosts handles structured options and timestamps', async () => {
    const originalFetch = globalThis.fetch;
    let capturedUrl = '';

    globalThis.fetch = (async (input: RequestInfo | URL) => {
      capturedUrl = String(input);
      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      const sinceDate = new Date('2026-09-20T00:00:00Z');
      const untilDate = new Date('2026-09-20T23:59:59Z');
      await client.getUserPosts('test-access-token', {
        since: sinceDate,
        until: untilDate,
        limit: 10,
      });

      assert.ok(capturedUrl.includes(`since=${Math.floor(sinceDate.getTime() / 1000)}`));
      assert.ok(capturedUrl.includes(`until=${Math.floor(untilDate.getTime() / 1000)}`));
      assert.ok(capturedUrl.includes('limit=10'));
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('throws ThreadsApiError on non-200 responses', async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ error: { message: 'OAuthException' } }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const client = new ThreadsApiClient(baseUrl);
      await assert.rejects(
        () => client.createTextContainer('invalid-token', 'fail'),
        (err: any) => {
          assert.ok(err instanceof ThreadsApiError);
          assert.strictEqual(err.statusCode, 400);
          assert.ok(err.body.includes('OAuthException'));
          return true;
        },
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
