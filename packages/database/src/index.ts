import { PrismaClient } from '@prisma/client';

// Singleton PrismaClient — reused across the application process.
// In workers, each process gets its own singleton (that's correct behaviour).
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    log:
      process.env['NODE_ENV'] === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env['NODE_ENV'] !== 'production') {
  globalThis.__prisma = prisma;
}

export * from '@prisma/client';
export {
  MemoryRepository,
  CURRENT_EMBEDDING_PIPELINE_VERSION,
  type EmbeddingMetadataProvenance,
} from './memory.repository';
