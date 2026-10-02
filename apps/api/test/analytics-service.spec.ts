import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AnalyticsService } from '../dist/analytics/analytics.service.js';
import {
  RecommendationAttributionStatus,
  RecommendationProvenanceType,
} from '@threadpilot/database';

describe('AnalyticsService Unit & Invariant Tests', () => {
  it('validates legal exposure transition from EXPOSED to ACCEPTED', async () => {
    const mockContentService: any = {
      createDraft: async () => ({ id: 'draft-123' }),
    };

    const service = new AnalyticsService(mockContentService);

    // Mock db
    const exposureRecord = {
      id: 'exp-1',
      workspaceId: 'ws-1',
      socialAccountId: 'acc-1',
      contentIdeaId: 'idea-1',
      attributionStatus: RecommendationAttributionStatus.EXPOSED,
      contentIdea: {
        id: 'idea-1',
        topic: 'AI Agents',
        hookStyle: 'QUESTION',
        suggestedPrompt: 'Prompt text',
      },
    };

    let updatedRecord: any = null;
    (service as any).db = {
      recommendationExposure: {
        findUnique: async () => exposureRecord,
        update: async ({ data }: any) => {
          updatedRecord = { ...exposureRecord, ...data };
          return updatedRecord;
        },
      },
    };

    const result = await service.acceptRecommendation('ws-1', 'user-1', 'exp-1');

    assert.equal(result.draft.id, 'draft-123');
    assert.equal(result.exposure.attributionStatus, RecommendationAttributionStatus.ACCEPTED);
    assert.equal(result.exposure.draftId, 'draft-123');
    assert.ok(result.exposure.acceptedAt instanceof Date);
  });

  it('rejects acceptRecommendation if exposure is already ACCEPTED or DISMISSED', async () => {
    const mockContentService: any = {};
    const service = new AnalyticsService(mockContentService);

    (service as any).db = {
      recommendationExposure: {
        findUnique: async () => ({
          id: 'exp-2',
          workspaceId: 'ws-1',
          attributionStatus: RecommendationAttributionStatus.ACCEPTED,
          contentIdea: { id: 'idea-2' },
        }),
      },
    };

    await assert.rejects(
      async () => service.acceptRecommendation('ws-1', 'user-1', 'exp-2'),
      /Cannot accept recommendation: current status is ACCEPTED, expected EXPOSED/,
    );
  });

  it('rejects cross-workspace exposure access (tenant isolation)', async () => {
    const mockContentService: any = {};
    const service = new AnalyticsService(mockContentService);

    (service as any).db = {
      recommendationExposure: {
        findUnique: async () => ({
          id: 'exp-3',
          workspaceId: 'ws-OTHER',
          attributionStatus: RecommendationAttributionStatus.EXPOSED,
        }),
      },
    };

    await assert.rejects(
      async () => service.acceptRecommendation('ws-1', 'user-1', 'exp-3'),
      /Multi-tenant isolation violation/,
    );
  });

  it('transitions exposure to DISMISSED correctly', async () => {
    const mockContentService: any = {};
    const service = new AnalyticsService(mockContentService);

    let updatedRecord: any = null;
    (service as any).db = {
      recommendationExposure: {
        findUnique: async () => ({
          id: 'exp-4',
          workspaceId: 'ws-1',
          contentIdeaId: 'idea-4',
          attributionStatus: RecommendationAttributionStatus.EXPOSED,
        }),
        update: async ({ data }: any) => {
          updatedRecord = data;
          return { id: 'exp-4', ...data };
        },
      },
    };

    const result = await service.dismissRecommendation('ws-1', 'exp-4');
    assert.equal(result.exposure.attributionStatus, RecommendationAttributionStatus.DISMISSED);
  });
});
