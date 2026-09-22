import 'dotenv/config';
import { prisma } from '@threadpilot/database';
import { QUEUES } from '@threadpilot/types';
import { Queue } from 'bullmq';
import Redis from 'ioredis';

async function reconstructRedis() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`=== STARTING REDIS-LOSS RECONSTRUCTION [DryRun=${isDryRun}] ===`);

  let publishQueue = null;
  let redis = null;

  if (!isDryRun) {
    const redisUrl = process.env.REDIS_URL_LOCAL ?? process.env.REDIS_URL ?? 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    publishQueue = new Queue(QUEUES.PUBLISH, { connection: redis });
  }

  const activePosts = await prisma.scheduledPost.findMany({
    where: {
      status: { in: ['SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'CLAIMED'] },
    },
  });

  console.log(`Found ${activePosts.length} active/runnable schedules in PostgreSQL.`);

  let reconstructedCount = 0;
  let skippedActiveLeaseCount = 0;

  for (const post of activePosts) {
    const bullJobId = `publish-${post.id}`;
    const targetTime = post.nextRetryAt ? new Date(post.nextRetryAt) : new Date(post.scheduledAt);
    const delayMs = Math.max(0, targetTime.getTime() - Date.now());

    // Defensive Lease Handling for CLAIMED posts: preserve active leases against dual-worker split brain
    if (post.status === 'CLAIMED') {
      const isLeaseExpired = !post.leaseUntil || new Date(post.leaseUntil) < new Date();
      if (!isLeaseExpired) {
        console.log(`[Skip] Post ${post.id} is CLAIMED with ACTIVE lease until ${post.leaseUntil}.`);
        skippedActiveLeaseCount++;
        continue;
      }
      console.log(`[Reset] Post ${post.id} was CLAIMED with EXPIRED lease. Resetting to SCHEDULED.`);
      if (!isDryRun) {
        await prisma.scheduledPost.update({
          where: { id: post.id },
          data: { status: 'SCHEDULED', claimedBy: null, attemptId: null, leaseUntil: null },
        });
      }
    }

    console.log(`[Reconstruct] Job ${bullJobId} -> Queue '${QUEUES.PUBLISH}' (delay: ${delayMs}ms, status: ${post.status})`);
    reconstructedCount++;

    if (!isDryRun) {
      await publishQueue.add(
        'PUBLISH',
        { requestId: `reconstruct-${Date.now()}`, workspaceId: post.workspaceId, scheduledPostId: post.id },
        { jobId: bullJobId, delay: delayMs, removeOnComplete: 100, removeOnFail: 500 }
      );

      await prisma.scheduledPostDispatch.upsert({
        where: { scheduledPostId: post.id },
        create: { scheduledPostId: post.id, status: 'DISPATCHED', dispatchedAt: new Date(), bullJobId },
        update: { status: 'DISPATCHED', bullJobId },
      });
    }
  }

  if (!isDryRun && publishQueue && redis) {
    await publishQueue.close();
    await redis.quit();
  }
  await prisma.$disconnect();

  console.log(`=== SUMMARY: ${reconstructedCount} jobs ${isDryRun ? 'would be re-enqueued' : 're-enqueued'}, ${skippedActiveLeaseCount} active leases preserved ===`);
}

reconstructRedis().catch((err) => {
  console.error('Reconstruction failed:', err);
  process.exit(1);
});
