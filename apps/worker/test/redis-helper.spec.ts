import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseRedisUrl,
  maskRedisUrl,
  resolveResilientRedisUrl,
  resetRedisUrlCache,
} from '../src/redis/redis-helper.ts';

test('Worker Redis Helper & Resilient Resolver Tests', async (t) => {
  t.beforeEach(() => {
    resetRedisUrlCache();
  });

  await t.test('parseRedisUrl correctly parses rediss:// and redis:// URLs', () => {
    const redissParsed = parseRedisUrl('rediss://user:secret@redis.domain.com:6380');
    assert.equal(redissParsed.host, 'redis.domain.com');
    assert.equal(redissParsed.port, 6380);
    assert.equal(redissParsed.username, 'user');
    assert.equal(redissParsed.password, 'secret');
    assert.deepEqual(redissParsed.tls, {});

    const redisParsed = parseRedisUrl('redis://localhost:6379');
    assert.equal(redisParsed.host, 'localhost');
    assert.equal(redisParsed.port, 6379);
    assert.equal(redisParsed.tls, undefined);

    const invalidParsed = parseRedisUrl('not-a-valid-url');
    assert.equal(invalidParsed.host, 'localhost');
    assert.equal(invalidParsed.port, 6379);
  });

  await t.test('maskRedisUrl redacts passwords without exposing secrets', () => {
    assert.equal(maskRedisUrl(undefined), '[none]');
    assert.equal(
      maskRedisUrl('rediss://default:supersecretpassword123@upstash.io:6379'),
      'rediss://default:***@upstash.io:6379',
    );
    assert.equal(
      maskRedisUrl('redis://:passwordonly@localhost:6379'),
      'redis://:***@localhost:6379',
    );
    assert.equal(maskRedisUrl('redis://localhost:6379'), 'redis://localhost:6379');
  });

  await t.test('memoization guarantees same URL returned without repeated probing', async () => {
    const mockConfig: any = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'development';
        if (key === 'REDIS_URL_LOCAL') return 'redis://local-override:6379';
        return undefined;
      },
    };

    const first = await resolveResilientRedisUrl(mockConfig);
    assert.equal(first, 'redis://local-override:6379');

    // Change mock return value; should still return memoized URL
    mockConfig.get = () => 'redis://should-be-ignored:6379';
    const second = await resolveResilientRedisUrl(mockConfig);
    assert.equal(second, 'redis://local-override:6379');
  });

  await t.test('in production, REDIS_URL_LOCAL is ignored', async () => {
    const mockConfig: any = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'REDIS_URL_LOCAL') return 'redis://localhost:6379';
        if (key === 'REDIS_URL_FALLBACK') return 'rediss://fallback:6379';
        return undefined;
      },
    };

    const resolved = await resolveResilientRedisUrl(mockConfig);
    assert.equal(resolved, 'rediss://fallback:6379');
  });

  await t.test('fails explicitly when both primary and fallback fail (no silent degraded mode)', async () => {
    const mockConfig: any = {
      get: (key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'REDIS_URL') return 'redis://127.0.0.1:1';
        if (key === 'REDIS_URL_FALLBACK') return 'redis://127.0.0.1:2';
        return undefined;
      },
    };

    await assert.rejects(
      async () => {
        await resolveResilientRedisUrl(mockConfig);
      },
      (err: any) => {
        assert.match(err.message, /All Redis instances unreachable/);
        return true;
      },
    );
  });
});
