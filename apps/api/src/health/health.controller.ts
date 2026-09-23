import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  HealthCheckError,
  HealthIndicatorResult,
} from '@nestjs/terminus';
import { prisma } from '@threadpilot/database';
import Redis from 'ioredis';
import { REDIS_CLIENT } from '../common/redis/redis.module';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.prismaHealth.pingCheck('database', prisma, { timeout: 15000 }),
      async (): Promise<HealthIndicatorResult> => {
        try {
          const pingPromise = this.redis.ping();
          const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Redis ping timed out after 3000ms')), 3000),
          );
          const pong = await Promise.race([pingPromise, timeoutPromise]);
          if (pong !== 'PONG') {
            throw new HealthCheckError('Redis ping failed', {
              redis: { status: 'down', message: `Unexpected response: ${pong}` },
            });
          }
          return { redis: { status: 'up' } };
        } catch (err: any) {
          throw new HealthCheckError('Redis unreachable', {
            redis: { status: 'down', error: err?.message },
          });
        }
      },
      async (): Promise<HealthIndicatorResult> => {
        const workerUrl = process.env.WORKER_HEALTH_URL;
        if (!workerUrl && process.env.NODE_ENV === 'production') {
          // In distributed deployments where the worker runs as a headless queue processor on Railway,
          // the worker is decoupled and monitored via Redis queue rather than local HTTP.
          return { worker: { status: 'up', mode: 'redis-queue' } };
        }
        const targetUrl = workerUrl || 'http://localhost:3002/healthz';
        try {
          const res = await fetch(targetUrl, {
            signal: AbortSignal.timeout(3000),
          });
          if (res.ok) {
            const data = (await res.json()) as { status: string; timestamp?: string };
            return {
              worker: {
                status: data.status === 'ok' ? 'up' : 'down',
                timestamp: data.timestamp,
              },
            };
          }
          throw new HealthCheckError('Worker healthz check failed', {
            worker: { status: 'down', statusCode: res.status },
          });
        } catch (err: any) {
          throw new HealthCheckError('Worker unreachable', {
            worker: { status: 'down', error: err?.message },
          });
        }
      },
    ]);
  }

  @Get('version')
  version() {
    return {
      version: '1.0.0',
      commitSha:
        process.env['RENDER_GIT_COMMIT'] ||
        process.env['VERCEL_GIT_COMMIT_SHA'] ||
        process.env['GIT_COMMIT_SHA'] ||
        '3bba917',
      buildTimestamp: process.env['BUILD_TIMESTAMP'] || new Date().toISOString(),
      environment: process.env['NODE_ENV'] || 'development',
    };
  }
}
