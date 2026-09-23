import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const logger = new Logger('WorkerRedisResolver');

export const DEFAULT_FALLBACK_REDIS_URL =
  'rediss://default:gQAAAAAABH1VAAIgcDE1MjAzNDczYWU1MzI0MTJlODBkMjlmODI4YjM1NWRmOA@trusting-jennet-294229.upstash.io:6379';

export function parseRedisUrl(urlStr: string) {
  try {
    const u = new URL(urlStr);
    return {
      host: u.hostname || 'localhost',
      port: u.port ? parseInt(u.port, 10) : 6379,
      password: u.password || undefined,
      username: u.username || undefined,
      tls: u.protocol === 'rediss:' ? {} : undefined,
    };
  } catch {
    return { host: 'localhost', port: 6379 };
  }
}

export async function resolveResilientRedisUrl(config: ConfigService): Promise<string> {
  const localUrl = config.get<string>('REDIS_URL_LOCAL');
  if (localUrl) {
    return localUrl;
  }

  const primaryUrl = config.get<string>('REDIS_URL');
  const fallbackUrl =
    config.get<string>('REDIS_URL_FALLBACK') ?? DEFAULT_FALLBACK_REDIS_URL;

  if (!primaryUrl) {
    return fallbackUrl;
  }

  // Quick probe to verify primary URL is responding and hasn't hit request quota limits
  try {
    const probe = new Redis(primaryUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      commandTimeout: 2000,
      connectTimeout: 2000,
      enableReadyCheck: false,
    });
    probe.on('error', () => {}); // silence unhandled event
    await probe.ping();
    await probe.quit();
    return primaryUrl;
  } catch (err: any) {
    logger.warn(
      `Primary Redis check failed (${err?.message || err}). Falling back to backup Redis: ${fallbackUrl.replace(/:[^:@]+@/, ':***@')}`,
    );
    return fallbackUrl;
  }
}

export async function createResilientRedisClient(config: ConfigService): Promise<Redis> {
  const url = await resolveResilientRedisUrl(config);
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });
}
