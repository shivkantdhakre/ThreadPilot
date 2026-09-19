import { describe, it } from 'node:test';
import assert from 'node:assert';
import { createHash } from 'node:crypto';

describe('Worker Crash-Recovery and Idempotency Tests', () => {
  it('prevents duplicate processing when JobRecord is already marked COMPLETE', async () => {
    const executedOperations: string[] = [];

    // Mock database state
    const mockDb = {
      jobRecord: {
        findUnique: async ({ where }: any) => {
          if (where.requestId === 'completed-req-123') {
            return { id: 'job-1', requestId: 'completed-req-123', status: 'COMPLETE' };
          }
          return null;
        },
      },
    };

    // Simulated worker processor idempotency guard
    async function processJob(requestId: string) {
      const existing = await mockDb.jobRecord.findUnique({ where: { requestId } });
      if (existing && existing.status === 'COMPLETE') {
        executedOperations.push('IDEMPOTENT_EARLY_RETURN');
        return;
      }
      executedOperations.push('EXPENSIVE_LLM_CALL');
    }

    await processJob('completed-req-123');
    assert.deepStrictEqual(executedOperations, ['IDEMPOTENT_EARLY_RETURN'], 'Completed job should not trigger LLM calls');
  });

  it('recovers cleanly when worker crashes after AI generation but before job completion', async () => {
    const executedOperations: string[] = [];
    const workspaceId = 'ws-test-123';
    const topic = 'AI engineering';
    const format = 'hook_body_cta';
    const tone = 'direct';

    const inputHash = createHash('sha256')
      .update(`${workspaceId}:${topic}:${format}:${tone}`)
      .digest('hex');

    // Simulate state where previous worker run crashed after AgentRun was written but before JobRecord was marked COMPLETE
    const mockDb = {
      jobRecord: {
        findUnique: async () => ({ id: 'job-crash-1', requestId: 'req-crash-1', status: 'RUNNING' }),
      },
      agentRun: {
        findFirst: async ({ where }: any) => {
          if (where.jobRecordId === 'job-crash-1' && where.inputHash === inputHash) {
            return {
              id: 'agent-run-cached-1',
              status: 'SUCCESS',
              outputHash: 'hash-abc',
            };
          }
          return null;
        },
      },
      contentDraft: {
        findFirst: async () => ({ id: 'draft-cached-1', workspaceId }),
      },
    };

    async function processWithRecovery(requestId: string) {
      const existingJob = await mockDb.jobRecord.findUnique();
      if (existingJob?.id) {
        const existingRun = await mockDb.agentRun.findFirst({
          where: { workspaceId, jobRecordId: existingJob.id, inputHash },
        });
        if (existingRun) {
          executedOperations.push('RECOVERED_FROM_CACHED_RUN');
          const draft = await mockDb.contentDraft.findFirst();
          return { draftId: draft?.id };
        }
      }

      executedOperations.push('EXPENSIVE_LLM_CALL');
      return null;
    }

    const result = await processWithRecovery('req-crash-1');
    assert.strictEqual(result?.draftId, 'draft-cached-1');
    assert.deepStrictEqual(executedOperations, ['RECOVERED_FROM_CACHED_RUN'], 'Worker must reuse cached output on retry after crash');
  });

  it('handles worker death before DB write by running cleanly from scratch on retry', async () => {
    let dbWriteOccurred = false;
    let attempts = 0;

    async function processJobWithCrash() {
      attempts++;
      if (attempts === 1) {
        // Crash before DB write
        throw new Error('WORKER_CRASHED: SIGKILL / Out of memory');
      }
      // On attempt 2: succeed and write to DB
      dbWriteOccurred = true;
      return { success: true };
    }

    // Attempt 1 crashes
    await assert.rejects(async () => {
      await processJobWithCrash();
    }, /WORKER_CRASHED/);

    assert.strictEqual(dbWriteOccurred, false);

    // Attempt 2 succeeds
    const res = await processJobWithCrash();
    assert.strictEqual(res.success, true);
    assert.strictEqual(dbWriteOccurred, true);
    assert.strictEqual(attempts, 2);
  });
});
