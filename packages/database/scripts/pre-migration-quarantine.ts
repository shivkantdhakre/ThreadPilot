import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[PRE-MIGRATION] Starting legacy scheduled posts quarantine and preflight validation...');

  // 1. Unconditionally create quarantine table outside the failing Prisma migration transaction
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "scheduled_posts_migration_quarantine" (
      "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
      "scheduled_post_id" UUID NOT NULL,
      "workspace_id" UUID NOT NULL,
      "draft_id" UUID NOT NULL,
      "status" TEXT NOT NULL,
      "container_id" TEXT,
      "publish_requested_at" TIMESTAMPTZ,
      "quarantined_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "reason" TEXT NOT NULL,
      CONSTRAINT "scheduled_posts_migration_quarantine_pkey" PRIMARY KEY ("id")
    );
  `);

  console.log('[PRE-MIGRATION] Quarantine table verified.');

  let quarantinedCount = 0;
  let nonAmbiguousCancelledCount = 0;

  // 2. Transactionally lock, inspect, copy, and clean
  await prisma.$transaction(async (tx) => {
    // Lock all active rows to avoid race conditions during pre-migration backfill
    const activeRows: Array<{
      id: string;
      workspace_id: string;
      draft_id: string;
      status: string;
      container_id: string | null;
      publish_requested_at: Date | null;
      created_at: Date;
    }> = await tx.$queryRaw`
      SELECT id, workspace_id, draft_id, status, container_id, publish_requested_at, created_at
      FROM scheduled_posts
      WHERE status NOT IN ('CANCELLED', 'EXPIRED', 'FAILED_PERMANENT', 'AUTH_REQUIRED', 'PUBLISHED')
      ORDER BY created_at ASC, id ASC
      FOR UPDATE
    `;

    // Group by draft_id to identify conflicting duplicates
    const draftMap = new Map<string, typeof activeRows>();
    for (const row of activeRows) {
      const list = draftMap.get(row.draft_id) || [];
      list.push(row);
      draftMap.set(row.draft_id, list);
    }

    for (const [draftId, rows] of draftMap.entries()) {
      if (rows.length <= 1) continue; // No collision

      const hasRecoveryRequired = rows.some((r) => r.status === 'RECOVERY_REQUIRED');

      if (hasRecoveryRequired) {
        // Conflicting draft involving RECOVERY_REQUIRED.
        // Copy conflicting rows to quarantine table for operator inspection
        for (const row of rows) {
          await tx.$executeRaw`
            INSERT INTO scheduled_posts_migration_quarantine (
              id, scheduled_post_id, workspace_id, draft_id, status, container_id, publish_requested_at, reason
            ) VALUES (
              uuid_generate_v4(),
              ${row.id}::uuid,
              ${row.workspace_id}::uuid,
              ${row.draft_id}::uuid,
              ${row.status},
              ${row.container_id},
              ${row.publish_requested_at},
              'LEGACY_CONFLICT_WITH_RECOVERY_REQUIRED'
            )
          `;
          quarantinedCount++;
        }
      } else {
        // Non-ambiguous duplicate schedules (e.g. multiple SCHEDULED / FAILED_RETRYABLE).
        // Deterministically keep the oldest active schedule by chronological created_at (with id tiebreaker) and cancel the duplicates.
        const sorted = [...rows].sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.id.localeCompare(b.id)
        );
        const [keep, ...duplicates] = sorted;

        for (const dup of duplicates) {
          await tx.$executeRaw`
            UPDATE scheduled_posts
            SET status = 'CANCELLED',
                last_error_msg = 'Cancelled by pre-migration cleanup: duplicate active schedule for draft (retained oldest schedule ' || ${keep.id} || ' created at ' || ${keep.created_at.toISOString()} || ')',
                updated_at = NOW()
            WHERE id = ${dup.id}::uuid
          `;
          nonAmbiguousCancelledCount++;
        }
      }
    }
  });

  console.log(`[PRE-MIGRATION] Cleaned up ${nonAmbiguousCancelledCount} ordinary duplicate active schedules.`);

  if (quarantinedCount > 0) {
    console.error(`\n================================================================================`);
    console.error(`[FATAL PRE-MIGRATION CONFLICT] Quarantined ${quarantinedCount} conflicting rows across legacy drafts.`);
    console.error(`Conflict includes RECOVERY_REQUIRED status. Automatic merge is unsafe.`);
    console.error(`ACTION REQUIRED: Operator must inspect 'scheduled_posts_migration_quarantine'`);
    console.error(`and verify external Threads status before proceeding with 'prisma migrate deploy'.`);
    console.error(`================================================================================\n`);
    process.exit(1);
  }

  console.log('[PRE-MIGRATION] Pre-migration quarantine check passed clean. Safe to run Prisma migration.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[PRE-MIGRATION] Execution failed:', err);
  process.exit(1);
});
