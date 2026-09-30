import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import * as fs from 'fs';
import * as path from 'path';

import * as dotenv from 'dotenv';

const logger = new Logger('RedisResolver');

let memoizedResolvedUrl: string | null = null;

function ensureEnvLoaded(): void {
  const currentDir = typeof __dirname !== 'undefined' ? __dirname : process.cwd();
  const candidates = [
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(currentDir, '../../../../.env'),
    path.resolve(currentDir, '../../../.env'),
    path.resolve(currentDir, '../../.env'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        dotenv.config({ path: c, override: true });
        break;
      } catch {
        try {
          if (typeof (process as any).loadEnvFile === 'function') {
            (process as any).loadEnvFile(c);
          }
          break;
        } catch {}
      }
    }
  }
}

export function resetRedisUrlCache(): void {
  memoizedResolvedUrl = null;
}

export function maskRedisUrl(urlStr?: string): string {
  if (!urlStr) return '[none]';
  return urlStr.replace(/:[^:@]+@/, ':***@');
}

export function parseRedisUrl(urlStr: string) {
  try {
    const cleaned = urlStr.replace(/^["']|["']$/g, '').trim();
    const u = new URL(cleaned);
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
  ensureEnvLoaded();

  const isProd =
    config.get<string>('NODE_ENV') === 'production' ||
    process.env.NODE_ENV === 'production';

  const configPrimary = config?.get<string>('REDIS_URL');
  const configFallback = config?.get<string>('REDIS_URL_FALLBACK');
  const configLocal = config?.get<string>('REDIS_URL_LOCAL');
  const hasConfigOverride =
    configPrimary !== undefined ||
    configFallback !== undefined ||
    configLocal !== undefined;

  const primaryUrl = configPrimary ?? (!hasConfigOverride ? process.env.REDIS_URL : undefined);
  const fallbackUrl = configFallback ?? (!hasConfigOverride ? process.env.REDIS_URL_FALLBACK : undefined);
  const localUrl = !isProd
    ? (configLocal ?? (!hasConfigOverride ? process.env.REDIS_URL_LOCAL : undefined))
    : undefined;

  // In production, local dev overrides are strictly ignored to prevent accidental localhost binding
  if (localUrl) {
    memoizedResolvedUrl = localUrl;
    return localUrl;
  }

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

  // Active probe on primary URL with bounded timeout (5000ms)
  const probe = new Redis(primaryUrl!, {
    maxRetriesPerRequest: 1,
    lazyConnect: false,
    commandTimeout: 5000,
    connectTimeout: 5000,
    enableReadyCheck: false,
    tls: primaryUrl!.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
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

    // Active probe on fallback URL with bounded timeout (5000ms)
    const fallbackProbe = new Redis(fallbackUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: false,
      commandTimeout: 5000,
      connectTimeout: 5000,
      enableReadyCheck: false,
      tls: fallbackUrl.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
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
  logger.log(`Creating Redis client for URL: ${maskRedisUrl(url)}`);
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: false,
    tls: url.startsWith('rediss://') ? { rejectUnauthorized: false } : undefined,
  });
  client.on('error', (err: any) => {
    logger.warn(`Redis client error [${err?.code || 'NO_CODE'}]: ${err?.message} target=${err?.address || 'unknown'}:${err?.port || 'unknown'}`);
  });
  return client;
}

