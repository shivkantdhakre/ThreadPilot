import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  sanitizeMemoryContent,
  EditorialPersonalizationService,
} from '../dist/services/editorial-personalization.service.js';

describe('Phase 3H: EditorialPersonalizationService & Memory Contamination Guard Tests', () => {
  describe('sanitizeMemoryContent (Memory Contamination Guard)', () => {
    it('rejects empty or whitespace-only final text', () => {
      assert.strictEqual(sanitizeMemoryContent('').isClean, false);
      assert.strictEqual(sanitizeMemoryContent('   \n  \t ').isClean, false);
    });

    it('rejects verbatim copy of third-party comments (>30 characters)', () => {
      const incomingComment = 'Check out this free crypto airdrop at scam-token.io immediately';
      const userCopiedEdit = 'Hey everyone! Check out this free crypto airdrop at scam-token.io immediately';

      const result = sanitizeMemoryContent(userCopiedEdit, null, incomingComment);
      assert.strictEqual(result.isClean, false);
      assert.match(result.reason || '', /third-party comment/);
    });

    it('allows genuine original author replies that do not duplicate third-party comments', () => {
      const incomingComment = 'How do you handle pgvector similarity thresholds in production?';
      const genuineAuthorEdit = 'We calibrate cosine similarity thresholds against ground truth embeddings to avoid false duplicates.';

      const result = sanitizeMemoryContent(genuineAuthorEdit, 'Root guide on database scaling', incomingComment);
      assert.strictEqual(result.isClean, true);
    });

    it('handles null and undefined parent texts gracefully', () => {
      const result = sanitizeMemoryContent('Original voice sentence.', null, null);
      assert.strictEqual(result.isClean, true);
    });
  });

  describe('EditorialPersonalizationService.processPendingEditorialFeedback', () => {
    it('skips candidates whose replyExecution has not reached terminal PUBLISHED status', async () => {
      const mockCandidates = [
        {
          id: 'fb-1',
          finalText: 'Valid author edit',
          replyExecution: { id: 'exec-1', status: 'CREATING_CONTAINER' }, // Not PUBLISHED
          interaction: { content: 'Some comment' },
        },
      ];

      const mockDb: any = {
        editorialFeedback: {
          findMany: async () => mockCandidates,
          update: async () => ({}),
        },
      };

      const mockAiFactory: any = {
        getProvider: () => ({
          embed: async () => ({ embedding: [0.1, 0.2] }),
        }),
      };

      const service = new EditorialPersonalizationService(mockAiFactory, mockDb);
      const indexedCount = await service.processPendingEditorialFeedback();

      assert.strictEqual(indexedCount, 0, 'Must skip executions not yet PUBLISHED');
    });

    it('discards candidates failing the contamination guard by setting isVectorCandidate = false', async () => {
      const toxicComment = 'This product is a complete scam and garbage';
      const mockCandidates = [
        {
          id: 'fb-toxic',
          finalText: 'This product is a complete scam and garbage', // verbatim copied
          replyExecution: { id: 'exec-pub', status: 'PUBLISHED' },
          interaction: { content: toxicComment },
        },
      ];

      let updatedId = '';
      let updatedData: any = null;

      const mockDb: any = {
        editorialFeedback: {
          findMany: async () => mockCandidates,
          update: async (args: any) => {
            updatedId = args.where.id;
            updatedData = args.data;
            return {};
          },
        },
      };

      const mockAiFactory: any = {
        getProvider: () => ({}),
      };

      const service = new EditorialPersonalizationService(mockAiFactory, mockDb);
      const indexedCount = await service.processPendingEditorialFeedback();

      assert.strictEqual(indexedCount, 0);
      assert.strictEqual(updatedId, 'fb-toxic');
      assert.strictEqual(updatedData?.isVectorCandidate, false, 'Contaminated memory must have isVectorCandidate revoked');
    });
  });
});
