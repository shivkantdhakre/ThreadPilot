import { PrismaClient } from '@prisma/client';
import { canonicalOutboundText, canonicalRequestFingerprint } from '@threadpilot/types';
import * as crypto from 'crypto';
import * as fs from 'fs';

const prisma = new PrismaClient();

interface AccountMap {
  [draftOrWorkspaceId: string]: string; // draft_id or workspace_id -> social_account_id
}

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const accountMapArg = args.find((a) => a.startsWith('--account-map='));

  let explicitAccountMap: AccountMap = {};
  if (accountMapArg) {
    const mapVal = accountMapArg.split('=')[1];
    if (fs.existsSync(mapVal)) {
      explicitAccountMap = JSON.parse(fs.readFileSync(mapVal, 'utf8'));
    } else {
      explicitAccountMap = JSON.parse(mapVal);
    }
  }

  console.log(`[PRE-MIGRATION-BACKFILL] Starting legacy data backfill (dryRun=${isDryRun})...`);

  let totalInspected = 0;
  let totalBackfilled = 0;
  const unmappableErrors: Array<{ id: string; draftId: string; reason: string }> = [];

  try {
    await prisma.$transaction(async (tx) => {
      // 0. Phase 2a: Safe Expand
      // On a legacy database, the 5 target nullable columns do not exist yet.
      // We safely add them via ADD COLUMN IF NOT EXISTS before querying them.
      await tx.$executeRaw`
        ALTER TABLE scheduled_posts
          ADD COLUMN IF NOT EXISTS social_account_id UUID,
          ADD COLUMN IF NOT EXISTS content_version_id UUID,
          ADD COLUMN IF NOT EXISTS content_snapshot JSONB,
          ADD COLUMN IF NOT EXISTS content_hash TEXT,
          ADD COLUMN IF NOT EXISTS request_fingerprint TEXT;
      `;

      // 1. Fetch all scheduled posts that have any of the 5 target fields NULL
      const legacyRows: Array<{
        id: string;
        workspace_id: string;
        draft_id: string;
        scheduled_at: Date;
        timezone: string | null;
        status: string;
        social_account_id: string | null;
        content_version_id: string | null;
        content_snapshot: any | null;
        content_hash: string | null;
        request_fingerprint: string | null;
      }> = await tx.$queryRaw`
        SELECT id, workspace_id, draft_id, scheduled_at, timezone, status,
               social_account_id, content_version_id, content_snapshot,
               content_hash, request_fingerprint
        FROM scheduled_posts
        WHERE social_account_id IS NULL
           OR content_version_id IS NULL
           OR content_snapshot IS NULL
           OR content_hash IS NULL
           OR request_fingerprint IS NULL
        ORDER BY created_at ASC, id ASC
        FOR UPDATE
      `;

      totalInspected = legacyRows.length;
      console.log(`[PRE-MIGRATION-BACKFILL] Found ${legacyRows.length} legacy rows requiring column backfills.`);

      if (legacyRows.length === 0) {
        console.log('[PRE-MIGRATION-BACKFILL] No legacy rows requiring backfill. Ready for migration.');
        return;
      }

      for (const row of legacyRows) {
        // --- 1. Social Account Resolution ---
        let targetAccountId = row.social_account_id;

        if (!targetAccountId) {
          // Check explicit mapping by draft_id or workspace_id
          if (explicitAccountMap[row.draft_id]) {
            targetAccountId = explicitAccountMap[row.draft_id];
          } else if (explicitAccountMap[row.workspace_id]) {
            targetAccountId = explicitAccountMap[row.workspace_id];
          } else {
            // Query social accounts for workspace
            const workspaceAccounts: Array<{ id: string }> = await tx.$queryRaw`
              SELECT id FROM social_accounts
              WHERE workspace_id = ${row.workspace_id}::uuid
              ORDER BY created_at ASC
            `;

            if (workspaceAccounts.length === 1) {
              // Exactly 1 account in workspace -> unambiguous automatic assignment
              targetAccountId = workspaceAccounts[0].id;
            } else if (workspaceAccounts.length > 1) {
              unmappableErrors.push({
                id: row.id,
                draftId: row.draft_id,
                reason: `Ambiguous social accounts (${workspaceAccounts.length} found for workspace ${row.workspace_id}). Specify mapping via --account-map.`,
              });
              continue;
            } else {
              unmappableErrors.push({
                id: row.id,
                draftId: row.draft_id,
                reason: `No social accounts found for workspace ${row.workspace_id}.`,
              });
              continue;
            }
          }
        }

        // Verify that targetAccountId exists in social_accounts AND belongs to the workspace
        const accountExists: Array<{ id: string }> = await tx.$queryRaw`
          SELECT id FROM social_accounts
          WHERE id = ${targetAccountId}::uuid
            AND workspace_id = ${row.workspace_id}::uuid
        `;
        if (accountExists.length === 0) {
          unmappableErrors.push({
            id: row.id,
            draftId: row.draft_id,
            reason: `Mapped social account ${targetAccountId} does not exist or does not belong to workspace ${row.workspace_id}.`,
          });
          continue;
        }

        // --- 2. Content Version & Snapshot Pinning ---
        let targetVersionId = row.content_version_id;
        let canonicalBody = '';
        let hook: string | null = null;
        let cta: string | null = null;

        if (targetVersionId) {
          const versionRow: Array<{ id: string; body: string; hook: string | null; cta: string | null }> = await tx.$queryRaw`
            SELECT id, body, hook, cta FROM content_versions WHERE id = ${targetVersionId}::uuid
          `;
          if (versionRow.length > 0) {
            canonicalBody = canonicalOutboundText(versionRow[0].body);
            hook = versionRow[0].hook;
            cta = versionRow[0].cta;
          }
        }

        if (!canonicalBody) {
          // Select latest content version for draft
          const latestVersions: Array<{ id: string; body: string; hook: string | null; cta: string | null }> = await tx.$queryRaw`
            SELECT id, body, hook, cta FROM content_versions
            WHERE draft_id = ${row.draft_id}::uuid
            ORDER BY version DESC, created_at DESC
            LIMIT 1
          `;

          if (latestVersions.length > 0) {
            targetVersionId = latestVersions[0].id;
            canonicalBody = canonicalOutboundText(latestVersions[0].body);
            hook = latestVersions[0].hook;
            cta = latestVersions[0].cta;
          } else {
            // Fallback: Check if draft exists directly
            const draftRow: Array<{ id: string; hook: string | null; cta: string | null }> = await tx.$queryRaw`
              SELECT id, hook, cta FROM content_drafts WHERE id = ${row.draft_id}::uuid
            `;
            if (draftRow.length > 0) {
              // Create synthetic content version 1
              const newVersionId: Array<{ id: string }> = await tx.$queryRaw`
                INSERT INTO content_versions (id, draft_id, version, body, hook, cta, edited_by, created_at)
                VALUES (uuid_generate_v4(), ${row.draft_id}::uuid, 1, '', ${draftRow[0].hook}, ${draftRow[0].cta}, 'SYSTEM_MIGRATION', NOW())
                RETURNING id
              `;
              targetVersionId = newVersionId[0].id;
              canonicalBody = '';
              hook = draftRow[0].hook;
              cta = draftRow[0].cta;
            } else {
              unmappableErrors.push({
                id: row.id,
                draftId: row.draft_id,
                reason: `No content versions or draft record found for draft_id ${row.draft_id}.`,
              });
              continue;
            }
          }
        }

        // --- 3. Content Snapshot & Hash Generation ---
        const contentSnapshot = {
          body: canonicalBody,
          hook: hook ?? null,
          cta: cta ?? null,
        };
        const contentHash = crypto.createHash('sha256').update(canonicalBody).digest('hex');

        // --- 4. Canonical Request Fingerprint Generation ---
        const requestFingerprint = canonicalRequestFingerprint({
          draftId: row.draft_id,
          socialAccountId: targetAccountId,
          scheduledAt: row.scheduled_at,
          timezone: row.timezone || 'UTC',
          contentVersionId: targetVersionId,
        });

        // --- 5. Atomic Update ---
        await tx.$executeRaw`
          UPDATE scheduled_posts
          SET social_account_id = ${targetAccountId}::uuid,
              content_version_id = ${targetVersionId}::uuid,
              content_snapshot = ${JSON.stringify(contentSnapshot)}::jsonb,
              content_hash = ${contentHash},
              request_fingerprint = ${requestFingerprint},
              updated_at = NOW()
          WHERE id = ${row.id}::uuid
        `;

        totalBackfilled++;
      }

      if (unmappableErrors.length > 0) {
        console.error('\n================================================================================');
        console.error(`[PRE-MIGRATION-BACKFILL ERROR] Encountered ${unmappableErrors.length} unmappable legacy rows:`);
        for (const err of unmappableErrors) {
          console.error(`  - Schedule ${err.id} (Draft: ${err.draftId}): ${err.reason}`);
        }
        console.error('ACTION REQUIRED: Provide an explicit --account-map=<json_path> or resolve orphan drafts before migration.');
        console.error('================================================================================\n');
        throw new Error(`PRE_MIGRATION_BACKFILL_ABORTED: ${unmappableErrors.length} unmappable rows.`);
      }

      if (isDryRun) {
        console.log('\n[PRE-MIGRATION-BACKFILL DRY RUN REPORT]');
        console.log(`- Total Legacy Rows Inspected: ${totalInspected}`);
        console.log(`- Successfully Backfilled:     ${totalBackfilled}`);
        console.log(`- Unmappable Errors:           ${unmappableErrors.length}`);
        console.log('- Result: DRY RUN SUCCESS. Rolling back transaction (no DB changes persisted).\n');
        throw new Error('DRY_RUN_ROLLBACK');
      }
    });

    console.log('\n[PRE-MIGRATION-BACKFILL REPORT]');
    console.log(`- Total Legacy Rows Inspected: ${totalInspected}`);
    console.log(`- Successfully Backfilled:     ${totalBackfilled}`);
    console.log(`- Unmappable Errors:           0`);
    console.log('- Result: BACKFILL COMMITTED TO DATABASE. Safe to execute "prisma migrate deploy".\n');
    process.exit(0);
  } catch (err: any) {
    if (err?.message === 'DRY_RUN_ROLLBACK') {
      process.exit(0);
    }
    console.error('[PRE-MIGRATION-BACKFILL] Failed:', err?.message || err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[PRE-MIGRATION-BACKFILL] Fatal error:', err);
  process.exit(1);
});
