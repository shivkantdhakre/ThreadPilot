import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Optional } from '@nestjs/common';
import { prisma, PrismaClient } from '@threadpilot/database';

interface PostPublishedPayload {
  scheduledPostId: string;
  draftId?: string;
  threadsPostId: string;
  socialAccountId?: string;
  publishedAt: string | null;
  publishedObservedAt?: string;
}

@Injectable()
export class EventOutboxProcessor implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventOutboxProcessor.name);
  private isRunning = false;
  private isDestroyed = false;
  private timer?: NodeJS.Timeout;
  private static readonly POLL_INTERVAL_MS = 5000;
  private static readonly BATCH_SIZE = 10;
  private static readonly MAX_ATTEMPTS = 5;

  constructor(@Optional() private readonly db: PrismaClient = prisma) {}

  onModuleInit() {
    this.scheduleNext(2000);
  }

  onModuleDestroy() {
    this.isDestroyed = true;
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(delayMs: number = EventOutboxProcessor.POLL_INTERVAL_MS) {
    if (this.isDestroyed) return;
    this.timer = setTimeout(async () => {
      try {
        await this.processBatch();
      } catch (err) {
        this.logger.error(`Event outbox processing iteration failed: ${err}`);
      } finally {
        this.scheduleNext();
      }
    }, delayMs);
  }

  async processBatch(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    try {
      const claimedEvents: Array<{
        id: string;
        workspace_id: string;
        event_type: string;
        payload: any;
        attempt_count: number;
        lease_token: string;
      }> = await this.db.$queryRaw`
        WITH claimable AS (
          SELECT id
          FROM event_outbox
          WHERE (
            status = 'PENDING'
            OR (status = 'PROCESSING' AND lease_until <= NOW())
          )
          AND attempt_count < ${EventOutboxProcessor.MAX_ATTEMPTS}
          ORDER BY created_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${EventOutboxProcessor.BATCH_SIZE}
        )
        UPDATE event_outbox e
        SET status = 'PROCESSING',
            lease_token = uuid_generate_v4(),
            lease_until = NOW() + INTERVAL '60 seconds',
            attempt_count = e.attempt_count + 1
        FROM claimable
        WHERE e.id = claimable.id
        RETURNING e.id, e.workspace_id, e.event_type, e.payload, e.attempt_count, e.lease_token;
      `;

      if (claimedEvents.length === 0) return;

      this.logger.log(
        `Claimed ${claimedEvents.length} event outbox items for processing with individual lease tokens`,
      );

      for (const event of claimedEvents) {
        try {
          if (event.event_type === 'POST_PUBLISHED') {
            await this.handlePostPublished(event);
          } else {
            this.logger.error(
              `Unknown or unhandled event type "${event.event_type}" on outbox event ${event.id}. Dead-lettering to FAILED.`,
            );
            await this.db.$executeRaw`
              UPDATE event_outbox
              SET status = 'FAILED',
                  last_error = ${`Unrecognized event type: ${event.event_type}`},
                  lease_token = NULL,
                  lease_until = NULL,
                  updated_at = NOW()
              WHERE id = ${event.id}::uuid
                AND status = 'PROCESSING'
                AND lease_token = ${event.lease_token}::uuid
                AND lease_until > NOW()
            `;
            continue;
          }

          const updated = await this.db.$executeRaw`
            UPDATE event_outbox
            SET status = 'PROCESSED',
                processed_at = NOW(),
                lease_token = NULL,
                lease_until = NULL,
                last_error = NULL
            WHERE id = ${event.id}::uuid
              AND status = 'PROCESSING'
              AND lease_token = ${event.lease_token}::uuid
              AND lease_until > NOW()
          `;
          if (updated === 0) {
            this.logger.warn(
              `Event ${event.id} could not be marked PROCESSED: lost lease token or timed out`,
            );
          }
        } catch (err: any) {
          this.logger.error(
            `Failed processing outbox event ${event.id}: ${err?.message || err}`,
          );

          if (event.attempt_count >= EventOutboxProcessor.MAX_ATTEMPTS) {
            await this.db.$executeRaw`
              UPDATE event_outbox
              SET status = 'FAILED',
                  last_error = ${err?.message || 'Exceeded max processing attempts'},
                  lease_token = NULL,
                  lease_until = NULL
              WHERE id = ${event.id}::uuid
                AND status = 'PROCESSING'
                AND lease_token = ${event.lease_token}::uuid
                AND lease_until > NOW()
            `;
          } else {
            await this.db.$executeRaw`
              UPDATE event_outbox
              SET status = 'PENDING',
                  last_error = ${err?.message || 'Processing failed; retryable'},
                  lease_token = NULL,
                  lease_until = NULL
              WHERE id = ${event.id}::uuid
                AND status = 'PROCESSING'
                AND lease_token = ${event.lease_token}::uuid
                AND lease_until > NOW()
            `;
          }
        }
      }
    } finally {
      this.isRunning = false;
    }
  }

  private async handlePostPublished(event: {
    id: string;
    workspace_id: string;
    payload: PostPublishedPayload;
  }): Promise<void> {
    const { scheduledPostId, threadsPostId, publishedAt } = event.payload;
    const idempotencyKey = `POST_PUBLISHED:${scheduledPostId}`;

    const formattedDate = publishedAt ? new Date(publishedAt).toLocaleString() : 'just now';

    await this.db.notification.upsert({
      where: { idempotencyKey },
      update: {}, // Strict no-op if notification already created
      create: {
        workspaceId: event.workspace_id,
        type: 'POST_PUBLISHED',
        title: 'Post Published to Threads',
        body: `Your post was successfully published to Threads (${threadsPostId}) at ${formattedDate}.`,
        entityType: 'scheduled_post',
        entityId: scheduledPostId,
        idempotencyKey,
      },
    });

    this.logger.log(
      `Created idempotent notification for scheduled post ${scheduledPostId} (key: ${idempotencyKey})`,
    );
  }
}
