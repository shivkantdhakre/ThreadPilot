import { prisma } from '@threadpilot/database';

async function main() {
  const user = await prisma.user.findUnique({
    where: { email: 'test@threadpilot.ai' },
    include: { workspaces: true },
  });

  if (!user || user.workspaces.length === 0) {
    throw new Error('Test user not found');
  }

  const workspaceId = user.workspaces[0].id;
  console.log('Seeding demo data for workspace:', workspaceId);

  // Check or create social account
  let socialAccount = await prisma.socialAccount.findFirst({
    where: { workspaceId },
  });

  if (!socialAccount) {
    socialAccount = await prisma.socialAccount.create({
      data: {
        workspaceId,
        platform: 'threads',
        externalId: 'threads_act_demo_101',
        username: 'techlead_pilot',
        displayName: 'Tech Lead @ ThreadPilot',
        connectedAt: new Date(),
        isConnected: true,
      },
    });
  }

  // Seed 1: REVIEW_REQUIRED interaction with AI Reply Draft
  const intReview = await prisma.interaction.create({
    data: {
      workspaceId,
      socialAccountId: socialAccount.id,
      rootThreadsPostId: 'post_threads_demo_1',
      externalInteractionId: `ext_reply_${Date.now()}_1`,
      authorExternalId: 'author_dev_alice',
      authorUsernameSnapshot: 'alice_dev',
      authorDisplayNameSnapshot: 'Alice Vance',
      content: 'Does ThreadPilot support fine-tuning our own editorial voice model on custom brand guidelines?',
      canonicalContentHash: `hash_demo_${Date.now()}_1`,
      interactionType: 'REPLY',
      status: 'REVIEW_REQUIRED',
      responseDecision: 'REQUIRED',
      priorityScore: 9,
      postedAt: new Date(Date.now() - 15 * 60 * 1000), // 15 mins ago
      firstSeenAt: new Date(Date.now() - 14 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });

  const draftReview = await prisma.replyDraft.create({
    data: {
      workspaceId,
      interactionId: intReview.id,
      status: 'ACTIVE',
    },
  });

  const v1 = await prisma.replyDraftVersion.create({
    data: {
      replyDraftId: draftReview.id,
      versionNumber: 1,
      body: 'Absolutely! ThreadPilot indexes your historical high-performing posts and editorial memories in pgvector, adapting tone and vocabulary dynamically while maintaining full compliance boundaries.',
      canonicalHash: `vhash_${Date.now()}_1`,
      source: 'AI_GENERATED',
      generationModel: 'gemini-1.5-pro',
      promptVersion: 'v2.4-frozen',
    },
  });

  await prisma.replyDraft.update({
    where: { id: draftReview.id },
    data: { currentVersionId: v1.id },
  });

  // Seed 2: REPLIED interaction
  const intReplied = await prisma.interaction.create({
    data: {
      workspaceId,
      socialAccountId: socialAccount.id,
      rootThreadsPostId: 'post_threads_demo_2',
      externalInteractionId: `ext_reply_${Date.now()}_2`,
      authorExternalId: 'author_dev_bob',
      authorUsernameSnapshot: 'bob_builds',
      authorDisplayNameSnapshot: 'Bob Martinez',
      content: 'Can we configure emergency circuit breakers if our rate limits are close to exhausting?',
      canonicalContentHash: `hash_demo_${Date.now()}_2`,
      interactionType: 'REPLY',
      status: 'REPLIED',
      responseDecision: 'REQUIRED',
      priorityScore: 8,
      postedAt: new Date(Date.now() - 60 * 60 * 1000), // 1 hour ago
      firstSeenAt: new Date(Date.now() - 59 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });

  const draftReplied = await prisma.replyDraft.create({
    data: {
      workspaceId,
      interactionId: intReplied.id,
      status: 'PUBLISHED',
    },
  });

  const v2 = await prisma.replyDraftVersion.create({
    data: {
      replyDraftId: draftReplied.id,
      versionNumber: 1,
      body: 'Yes, our adaptive rate-limiter monitors Meta Graph API quotas and automatically backs off exponentially when approaching the 250 post/reply 24-hour ceiling.',
      canonicalHash: `vhash_${Date.now()}_2`,
      source: 'AI_GENERATED',
    },
  });

  await prisma.replyDraft.update({
    where: { id: draftReplied.id },
    data: { currentVersionId: v2.id, approvedVersionId: v2.id },
  });

  // Seed 3: AUTO_REPLIED interaction
  const intAuto = await prisma.interaction.create({
    data: {
      workspaceId,
      socialAccountId: socialAccount.id,
      rootThreadsPostId: 'post_threads_demo_3',
      externalInteractionId: `ext_reply_${Date.now()}_3`,
      authorExternalId: 'author_dev_carol',
      authorUsernameSnapshot: 'carol_codes',
      authorDisplayNameSnapshot: 'Carol Chen',
      content: 'Huge fan of this tool! Clean architecture and super fast.',
      canonicalContentHash: `hash_demo_${Date.now()}_3`,
      interactionType: 'REPLY',
      status: 'REPLIED',
      responseDecision: 'REQUIRED',
      priorityScore: 7,
      postedAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      firstSeenAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });

  // Seed 4: DISMISSED interaction
  await prisma.interaction.create({
    data: {
      workspaceId,
      socialAccountId: socialAccount.id,
      rootThreadsPostId: 'post_threads_demo_4',
      externalInteractionId: `ext_reply_${Date.now()}_4`,
      authorExternalId: 'author_bot_99',
      authorUsernameSnapshot: 'promo_crypto_bot',
      authorDisplayNameSnapshot: 'Free Crypto Giveaway',
      content: 'Check out this free crypto drop now! Visit example-scam.xyz',
      canonicalContentHash: `hash_demo_${Date.now()}_4`,
      interactionType: 'REPLY',
      status: 'DISMISSED',
      responseDecision: 'POLICY_BLOCKED',
      priorityScore: 10,
      dismissedReason: 'SPAM_AND_POLICY_VIOLATION',
      postedAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      firstSeenAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      lastSeenAt: new Date(),
    },
  });

  console.log('✓ Successfully seeded demo interactions across all review states!');
}

main().catch(err => {
  console.error('Failed to seed:', err);
  process.exit(1);
});
