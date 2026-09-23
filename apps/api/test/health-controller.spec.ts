import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { HealthCheckError } from '@nestjs/terminus';
import { HealthController } from '../dist/health/health.controller.js';

describe('HealthController Dependency Failure Semantics', () => {
  it('reports status: ok when Database, Redis, and Worker are healthy', async () => {
    const mockHealthService: any = {
      check: async (indicators: Array<() => Promise<any>>) => {
        const results = await Promise.all(indicators.map((fn) => fn()));
        const details = Object.assign({}, ...results);
        return {
          status: 'ok',
          info: details,
          error: {},
          details,
        };
      },
    };

    const mockPrismaHealth: any = {
      pingCheck: async () => ({ database: { status: 'up' } }),
    };

    const mockRedis: any = {
      ping: async () => 'PONG',
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as any;

    try {
      const controller = new HealthController(mockHealthService, mockPrismaHealth, mockRedis);
      const res = await controller.check();
      assert.strictEqual(res.status, 'ok');
      assert.strictEqual(res.details.database.status, 'up');
      assert.strictEqual(res.details.redis.status, 'up');
      assert.strictEqual(res.details.worker.status, 'up');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('fails and reports error when Database is down', async () => {
    const mockHealthService: any = {
      check: async (indicators: Array<() => Promise<any>>) => {
        try {
          await indicators[0]();
          assert.fail('Should have thrown database error');
        } catch (err: any) {
          return {
            status: 'error',
            details: { database: { status: 'down', message: err.message } },
          };
        }
      },
    };

    const mockPrismaHealth: any = {
      pingCheck: async () => {
        throw new Error('Database connection failed: Connection refused');
      },
    };

    const mockRedis: any = { ping: async () => 'PONG' };
    const controller = new HealthController(mockHealthService, mockPrismaHealth, mockRedis);
    const res = await controller.check();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(res.details.database.status, 'down');
  });

  it('fails and reports error when Redis ping times out or throws', async () => {
    const mockHealthService: any = {
      check: async (indicators: Array<() => Promise<any>>) => {
        try {
          // Run redis indicator (index 1)
          await indicators[1]();
          assert.fail('Should have thrown redis error');
        } catch (err: any) {
          assert.ok(err instanceof HealthCheckError);
          return {
            status: 'error',
            details: { redis: { status: 'down', error: err.message } },
          };
        }
      },
    };

    const mockPrismaHealth: any = { pingCheck: async () => ({ database: { status: 'up' } }) };
    const mockRedis: any = {
      ping: async () => {
        throw new Error('ERR max requests limit exceeded');
      },
    };

    const controller = new HealthController(mockHealthService, mockPrismaHealth, mockRedis);
    const res = await controller.check();
    assert.strictEqual(res.status, 'error');
    assert.strictEqual(res.details.redis.status, 'down');
  });

  it('fails and reports error when Worker is unreachable', async () => {
    const mockHealthService: any = {
      check: async (indicators: Array<() => Promise<any>>) => {
        try {
          // Run worker indicator (index 2)
          await indicators[2]();
          assert.fail('Should have thrown worker error');
        } catch (err: any) {
          assert.ok(err instanceof HealthCheckError);
          return {
            status: 'error',
            details: { worker: { status: 'down', error: err.message } },
          };
        }
      },
    };

    const mockPrismaHealth: any = { pingCheck: async () => ({ database: { status: 'up' } }) };
    const mockRedis: any = { ping: async () => 'PONG' };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new Error('ECONNREFUSED 127.0.0.1:3002');
    }) as any;

    try {
      const controller = new HealthController(mockHealthService, mockPrismaHealth, mockRedis);
      const res = await controller.check();
      assert.strictEqual(res.status, 'error');
      assert.strictEqual(res.details.worker.status, 'down');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
