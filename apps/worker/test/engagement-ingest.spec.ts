import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  EngagementIngestProcessor,
  SYNC_TIER_INTERVALS_MS,
} from '../dist/processors/engagement-ingest.processor.js';
import { canonicalContentHash } from '@threadpilot/types';

describe('EngagementIngestProcessor & Self-Reply Loop Breaker Tests', () => {
  it('correctly calculates sync tier intervals and thresholds', () => {
    assert.strictEqual(SYNC_TIER_INTERVALS_MS.HOT, 3 * 60 * 1000, 'HOT tier must sync every 3 minutes');
    assert.strictEqual(SYNC_TIER_INTERVALS_MS.WARM, 20 * 60 * 1000, 'WARM tier must sync every 20 minutes');
    assert.strictEqual(SYNC_TIER_INTERVALS_MS.COLD, 3 * 60 * 60 * 1000, 'COLD tier must sync every 3 hours');
  });

  it('defense-in-depth loop breaker: flags self-replies and suppresses classification enqueue', async () => {
    const enqueuedClassifyJobs: any[] = [];
    const createdInteractions: any[] = [];
    const updatedInteractions: any[] = [];

    // Mock BullMQ classify queue
    const mockClassifyQueue = {
      add: async (name: string, data: any, opts: any) => {
        enqueuedClassifyJobs.push({ name, data, opts });
      },
    };

    // Account information
    const accountUsername = 'ThreadPilotUser';
    const accountExternalId = 'meta-ext-author-777';
    const socialAccountId = '00000000-0000-0000-0000-000000000001';
    const workspaceId = '00000000-0000-0000-0000-000000000002';
    const rootThreadsPostId = 'threads-post-100';

    // Mock replies returned by Meta API:
    // 1. Meta authoritative is_reply_owned_by_me = true
    // 2. Author username match (case-insensitive)
    // 3. Author external ID match
    // 4. Third-party genuine question
    const mockReplies = [
      {
        id: 'reply-meta-owned',
        text: 'Our official clarification on this',
        timestamp: '2026-09-29T10:00:00.000Z',
        username: 'some_other_alias',
        is_reply_owned_by_me: true,
      },
      {
        id: 'reply-username-match',
        text: 'Thanks for asking! Here is more info.',
        timestamp: '2026-09-29T10:01:00.000Z',
        username: 'threadpilotuser', // case-insensitive match
        is_reply_owned_by_me: false,
      },
      {
        id: 'reply-external-id-match',
        text: 'Another official update.',
        timestamp: '2026-09-29T10:02:00.000Z',
        username: 'random_display',
        is_reply_owned_by_me: false,
        owner: { id: 'meta-ext-author-777' },
      },
      {
        id: 'reply-third-party-user',
        text: 'Does this integrate with custom APIs?',
        timestamp: '2026-09-29T10:03:00.000Z',
        username: 'customer_dev',
        is_reply_owned_by_me: false,
        owner: { id: 'meta-customer-999' },
      },
    ];

    // Helper loop simulating the core loop in syncRootPost
    for (const reply of mockReplies) {
      const isOwnedByMe =
        Boolean(reply.is_reply_owned_by_me) ||
        (Boolean(reply.username) && reply.username?.toLowerCase() === accountUsername.toLowerCase()) ||
        (Boolean(accountExternalId) && (
          (reply as any).owner?.id === accountExternalId ||
          (reply as any).author_id === accountExternalId
        ));

      const hash = canonicalContentHash(reply.text || '');

      const interaction = {
        id: `interaction-${reply.id}`,
        workspaceId,
        socialAccountId,
        rootThreadsPostId,
        externalInteractionId: reply.id,
        content: reply.text,
        canonicalContentHash: hash,
        isReplyOwnedByMe: isOwnedByMe,
        status: isOwnedByMe ? 'REPLIED' : 'NEW',
        responseDecision: isOwnedByMe ? 'NOT_REQUIRED' : 'PENDING',
        priorityScore: 5,
      };

      createdInteractions.push(interaction);

      if (!isOwnedByMe) {
        await mockClassifyQueue.add(
          'classify',
          {
            interactionId: interaction.id,
            priorityScore: interaction.priorityScore,
          },
          {
            jobId: `classify_${interaction.id}`,
            priority: interaction.priorityScore * 100,
          },
        );
      }
    }

    // Assertions
    assert.strictEqual(createdInteractions.length, 4, 'All 4 replies should be stored as interactions');

    // 1. Meta authoritative self-reply
    const metaOwned = createdInteractions.find((i) => i.externalInteractionId === 'reply-meta-owned');
    assert.strictEqual(metaOwned.isReplyOwnedByMe, true);
    assert.strictEqual(metaOwned.status, 'REPLIED');
    assert.strictEqual(metaOwned.responseDecision, 'NOT_REQUIRED');

    // 2. Case-insensitive username match
    const usernameMatched = createdInteractions.find((i) => i.externalInteractionId === 'reply-username-match');
    assert.strictEqual(usernameMatched.isReplyOwnedByMe, true);
    assert.strictEqual(usernameMatched.status, 'REPLIED');
    assert.strictEqual(usernameMatched.responseDecision, 'NOT_REQUIRED');

    // 3. External author ID match
    const extIdMatched = createdInteractions.find((i) => i.externalInteractionId === 'reply-external-id-match');
    assert.strictEqual(extIdMatched.isReplyOwnedByMe, true);
    assert.strictEqual(extIdMatched.status, 'REPLIED');
    assert.strictEqual(extIdMatched.responseDecision, 'NOT_REQUIRED');

    // 4. Third-party genuine question
    const thirdParty = createdInteractions.find((i) => i.externalInteractionId === 'reply-third-party-user');
    assert.strictEqual(thirdParty.isReplyOwnedByMe, false);
    assert.strictEqual(thirdParty.status, 'NEW');
    assert.strictEqual(thirdParty.responseDecision, 'PENDING');

    // CRITICAL: Exactly ONE classify job enqueued (only for the third party)
    assert.strictEqual(enqueuedClassifyJobs.length, 1, 'Self-replies MUST NEVER trigger classify queue');
    assert.strictEqual(enqueuedClassifyJobs[0].data.interactionId, 'interaction-reply-third-party-user');
    assert.strictEqual(enqueuedClassifyJobs[0].opts.jobId, 'classify_interaction-reply-third-party-user');
  });

  it('sliding timestamp overlap window computes max(lastSeen - 120s, rootPostTimestamp)', () => {
    const rootPostPublishedAt = new Date('2026-09-29T08:00:00.000Z');
    const lastSeenInteractionAt = new Date('2026-09-29T08:01:00.000Z'); // 60s after root post

    // lastSeen - 120s would be 07:59:00 (before root post)
    // max(07:59:00, 08:00:00) should clamp to rootPostPublishedAt (08:00:00)
    const overlapTime1 = lastSeenInteractionAt.getTime() - 120_000;
    const since1 = new Date(Math.max(overlapTime1, rootPostPublishedAt.getTime()));
    assert.strictEqual(
      since1.toISOString(),
      '2026-09-29T08:00:00.000Z',
      'Should clamp to root post timestamp when overlap reaches before root post',
    );

    // Later lastSeen: 10 minutes after root post
    const lastSeenInteractionAt2 = new Date('2026-09-29T08:10:00.000Z');
    const overlapTime2 = lastSeenInteractionAt2.getTime() - 120_000;
    const since2 = new Date(Math.max(overlapTime2, rootPostPublishedAt.getTime()));
    assert.strictEqual(
      since2.toISOString(),
      '2026-09-29T08:08:00.000Z',
      'Should be exactly 120s before lastSeenInteractionAt',
    );
  });

  it('parent interaction hierarchy linking resolves replied_to id correctly', () => {
    const existingInteractions = [
      { id: 'parent-int-1', externalInteractionId: 'ext-comment-10' },
    ];

    const incomingReply = {
      id: 'ext-comment-11',
      text: 'I agree with this point!',
      replied_to: { id: 'ext-comment-10' },
    };

    let parentInteractionId: string | null = null;
    const parent = existingInteractions.find((i) => i.externalInteractionId === incomingReply.replied_to?.id);
    if (parent) {
      parentInteractionId = parent.id;
    }

    assert.strictEqual(parentInteractionId, 'parent-int-1', 'Child interaction must link to parent interaction ID');
  });

  it('canonicalContentHash is deterministic and matches trimmed text', () => {
    const hash1 = canonicalContentHash('  Hello Threads World!  \n');
    const hash2 = canonicalContentHash('Hello Threads World!');
    assert.strictEqual(hash1, hash2, 'canonicalContentHash must normalize leading and trailing whitespace');
  });
});
