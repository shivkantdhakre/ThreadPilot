import { NestFactory } from '@nestjs/core';
import { WorkerModule } from './worker.module';
import { logger } from '@threadpilot/observability';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(WorkerModule, {
    logger: ['error', 'warn', 'log'],
  });

  const port = parseInt(process.env['WORKER_PORT'] ?? '3002', 10);
  await app.listen(port);

  logger.info({ port }, `ThreadPilot Worker listening on port ${port}`);
}

bootstrap().catch((error: unknown) => {
  logger.error({ error }, 'Failed to start worker');
  process.exit(1);
});
