import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

const logger = new Logger('RedisResolver');

let memoizedResolvedUrl: string | null = null;

export function resetRedisUrlCache(): void {
  memoizedResolvedUrl = null;
}

export function maskRedisUrl(urlStr?: string): string {
  if (!urlStr) return '[none]';
  return urlStr.replace(/:[^:@]+@/, ':***@');
}

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
  if (memoizedResolvedUrl) {
    return memoizedResolvedUrl;
  }

  const isProd =
    config.get<string>('NODE_ENV') === 'production' ||
    process.env.NODE_ENV === 'production';

  // In production, local dev overrides are strictly ignored to prevent accidental localhost binding
  const localUrl = !isProd ? config.get<string>('REDIS_URL_LOCAL') : undefined;
  if (localUrl) {
    memoizedResolvedUrl = localUrl;
    return localUrl;
  }

  const primaryUrl = config.get<string>('REDIS_URL');
  const fallbackUrl = config.get<string>('REDIS_URL_FALLBACK');

  if (!primaryUrl && !fallbackUrl) {
    if (!isProd) {
      memoizedResolvedUrl = 'redis://localhost:6379';
      return memoizedResolvedUrl;
    }
    throw new Error('Neither REDIS_URL nor REDIS_URL_FALLBACK is configured in production environment.');
  }

  if (!primaryUrl && fallbackUrl) {
    memoizedResolvedUrl = fallbackUrl;
    return fallbackUrl;
  }

  // Active probe on primary URL with bounded timeout (2000ms)
  const probe = new Redis(primaryUrl!, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
    commandTimeout: 2000,
    connectTimeout: 2000,
    enableReadyCheck: false,
  });
  probe.on('error', () => {}); // silence unhandled event during probe failure

  try {
    await probe.ping();
    memoizedResolvedUrl = primaryUrl!;
    return primaryUrl!;
  } catch (err: any) {
    logger.warn(
      `Primary Redis check failed (${err?.message || err}). Evaluating fallback Redis.`,
    );

    if (!fallbackUrl) {
      logger.error('Primary Redis check failed and no REDIS_URL_FALLBACK is configured.');
      throw new Error(`Primary Redis failed (${err?.message || err}) and no fallback configured.`);
    }

    // Active probe on fallback URL with bounded timeout (2000ms)
    const fallbackProbe = new Redis(fallbackUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      commandTimeout: 2000,
      connectTimeout: 2000,
      enableReadyCheck: false,
    });
    fallbackProbe.on('error', () => {}); // silence unhandled event

    try {
      await fallbackProbe.ping();
      logger.warn(
        `Switched to healthy fallback Redis: ${maskRedisUrl(fallbackUrl)}`,
      );
      memoizedResolvedUrl = fallbackUrl;
      return fallbackUrl;
    } catch (fallbackErr: any) {
      logger.error(
        `Both primary and fallback Redis are unreachable. Startup aborted.`,
      );
      throw new Error(
        `All Redis instances unreachable: primary failed (${err?.message || err}), fallback failed (${fallbackErr?.message || fallbackErr})`,
      );
    } finally {
      fallbackProbe.disconnect();
    }
  } finally {
    probe.disconnect();
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

