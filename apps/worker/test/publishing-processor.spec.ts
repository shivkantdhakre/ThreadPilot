import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  classifyPublishError,
  FencingTokenExpiredException,
} from '../dist/processors/publishing.processor.js';
import { ThreadsApiError } from '@threadpilot/threads-client';

describe('PublishingProcessor Unit & Invariant Tests', () => {
  describe('classifyPublishError', () => {
    it('classifies 401 and 403 as AUTH_REQUIRED', () => {
      const err401 = new ThreadsApiError(401, 'Unauthorized token');
      const err403 = new ThreadsApiError(403, 'Forbidden access');
      assert.strictEqual(classifyPublishError(err401).type, 'AUTH_REQUIRED');
      assert.strictEqual(classifyPublishError(err403).type, 'AUTH_REQUIRED');
    });

    it('classifies 400 as PERMANENT THREADS_BAD_REQUEST', () => {
      const err400 = new ThreadsApiError(400, 'Bad request payload');
      const res = classifyPublishError(err400);
      assert.strictEqual(res.type, 'PERMANENT');
      assert.strictEqual(res.code, 'THREADS_BAD_REQUEST');
    });

    it('classifies 404 as PERMANENT CONTAINER_NOT_FOUND', () => {
      const err404 = new ThreadsApiError(404, 'Container expired or not found');
      const res = classifyPublishError(err404);
      assert.strictEqual(res.type, 'PERMANENT');
      assert.strictEqual(res.code, 'CONTAINER_NOT_FOUND');
    });

    it('classifies 429 and 500+ as RETRYABLE', () => {
      const err429 = new ThreadsApiError(429, 'Rate limit hit');
      const err500 = new ThreadsApiError(500, 'Internal Meta server error');
      const err503 = new ThreadsApiError(503, 'Service unavailable');
      assert.strictEqual(classifyPublishError(err429).type, 'RETRYABLE');
      assert.strictEqual(classifyPublishError(err500).type, 'RETRYABLE');
      assert.strictEqual(classifyPublishError(err503).type, 'RETRYABLE');
    });

    it('classifies TimeoutError and AbortError as RETRYABLE NETWORK_TIMEOUT', () => {
      const timeoutErr = new Error('The operation was aborted due to timeout');
      timeoutErr.name = 'TimeoutError';
      const abortErr = new Error('Aborted');
      abortErr.name = 'AbortError';

      const resTimeout = classifyPublishError(timeoutErr);
      const resAbort = classifyPublishError(abortErr);

      assert.strictEqual(resTimeout.type, 'RETRYABLE');
      assert.strictEqual(resTimeout.code, 'NETWORK_TIMEOUT');
      assert.strictEqual(resAbort.type, 'RETRYABLE');
      assert.strictEqual(resAbort.code, 'NETWORK_TIMEOUT');
    });

    it('classifies missing OAuth token conditions as AUTH_REQUIRED', () => {
      // 1. Prisma P2025 error on OAuthToken
      const prismaP2025 = new Error('No OAuthToken found');
      (prismaP2025 as any).code = 'P2025';
      (prismaP2025 as any).meta = { modelName: 'OAuthToken' };
      const resPrisma = classifyPublishError(prismaP2025);
      assert.strictEqual(resPrisma.type, 'AUTH_REQUIRED');
      assert.strictEqual(resPrisma.code, 'AUTH_REQUIRED');

      // 2. Explicit No OAuth token error
      const noTokenErr = new Error('No OAuth token found for account acc-123');
      const resNoToken = classifyPublishError(noTokenErr);
      assert.strictEqual(resNoToken.type, 'AUTH_REQUIRED');

      // 3. Social account or OAuth token not found
      const socialAccErr = new Error('Social account or OAuth token not found');
      const resSocial = classifyPublishError(socialAccErr);
      assert.strictEqual(resSocial.type, 'AUTH_REQUIRED');

      // 4. Revoked token
      const revokedErr = new Error('Token for account acc-123 has been revoked');
      const resRevoked = classifyPublishError(revokedErr);
      assert.strictEqual(resRevoked.type, 'AUTH_REQUIRED');

      // 5. Expired token / refresh failure
      const expiredErr = new Error('Token refresh failed: 400 Bad Request');
      const resExpired = classifyPublishError(expiredErr);
      assert.strictEqual(resExpired.type, 'AUTH_REQUIRED');
    });

    it('does NOT classify unrelated Prisma P2025 errors as AUTH_REQUIRED', () => {
      const unrelatedP2025 = new Error('No ScheduledPost record was found');
      (unrelatedP2025 as any).code = 'P2025';
      (unrelatedP2025 as any).meta = { modelName: 'ScheduledPost' };

      const res = classifyPublishError(unrelatedP2025);
      assert.strictEqual(res.type, 'RETRYABLE', 'Unrelated Prisma error should be RETRYABLE');
      assert.strictEqual(res.code, 'INTERNAL_ERROR', 'Unrelated Prisma error should be INTERNAL_ERROR');
    });

    it('classifies unknown exceptions as RETRYABLE INTERNAL_ERROR', () => {
      const err = new Error('Database connection lost');
      const res = classifyPublishError(err);
      assert.strictEqual(res.type, 'RETRYABLE');
      assert.strictEqual(res.code, 'INTERNAL_ERROR');
    });
  });

  describe('FencingTokenExpiredException', () => {
    it('formats correct error message and name', () => {
      const ex = new FencingTokenExpiredException('CONTAINER_CREATED');
      assert.strictEqual(ex.name, 'FencingTokenExpiredException');
      assert.ok(ex.message.includes('CONTAINER_CREATED'));
    });
  });
});
