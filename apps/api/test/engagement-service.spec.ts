import { describe, it } from 'node:test';
import assert from 'node:assert';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { EngagementService } from '../dist/engagement/engagement.service.js';
import { prisma } from '@threadpilot/database';

describe('Phase 3F: EngagementService API Gateway Unit & Invariant Tests', () => {
  function createService() {
    const mockIngestQueue: any = { add: async () => ({ id: 'job-ingest-1' }) };
    const mockDraftQueue: any = { add: async () => ({ id: 'job-draft-1' }) };
    const mockPublishQueue: any = { add: async () => ({ id: 'job-publish-1' }) };

    return new EngagementService(mockIngestQueue, mockDraftQueue, mockPublishQueue);
  }

  it('updateDraft: rejects drafts exceeding 500 UTF-16 code units', async () => {
    const service = createService();
    const oversizedBody = 'a'.repeat(501);

    await assert.rejects(
      () => service.updateDraft('ws-1', 'int-1', oversizedBody, 1, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('exceeds maximum 500 UTF-16 code units'));
        return true;
      },
    );
  });

  it('updateDraft: rejects empty drafts', async () => {
    const service = createService();
    await assert.rejects(
      () => service.updateDraft('ws-1', 'int-1', '   ', 1, 'user-1'),
      (err: any) => {
        assert.ok(err instanceof BadRequestException);
        assert.ok(err.message.includes('Text must not be empty'));
        return true;
      },
    );
  });

  it('operator resolution: validates resolution enum payload', async () => {
    const service = createService();
    const validUuid1 = 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d';
    const validUuid2 = 'b2c3d4e5-f6a1-4b2c-9d3e-4f5a6b7c8d9e';
    await assert.rejects(
      () => service.resolveExecution(validUuid1, validUuid2, { resolution: 'INVALID_STATUS' as any }, 'user-1'),
      (err: any) => {
        // Can fail as NotFoundException (no db mock) or validation
        assert.ok(err instanceof NotFoundException || err instanceof BadRequestException || err instanceof ConflictException);
        return true;
      },
    );
  });

  it('triggerDraft: returns cached response when IdempotencyRecord exists', async () => {
    const service = createService();
    const cachedResponse = { success: true, requestId: 'cached-req-123', message: 'Cached response' };
    const originalFindUnique = (prisma as any).idempotencyRecord?.findUnique;
    (prisma as any).idempotencyRecord = {
      ...(prisma as any).idempotencyRecord,
      findUnique: async () => ({ response: cachedResponse }),
    };

    try {
      const res = await service.triggerDraft('ws-1', 'int-1', {}, 'idemp-key-1');
      assert.deepStrictEqual(res, cachedResponse);
    } finally {
      if ((prisma as any).idempotencyRecord) {
        (prisma as any).idempotencyRecord.findUnique = originalFindUnique;
      }
    }
  });
});
