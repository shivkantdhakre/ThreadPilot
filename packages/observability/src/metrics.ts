import { logger } from './logger';

/**
 * Business event counters for operational observability.
 * These are structured log events — in production, ship logs to a metrics backend.
 * Not a replacement for APM; a complement to structured logs.
 */

type MetricName =
  | 'posts_generated'
  | 'posts_published'
  | 'publish_failures'
  | 'replies_generated'
  | 'replies_published'
  | 'agent_failures'
  | 'ai_latency_ms'
  | 'ai_cost_usd'
  | 'queue_latency_ms'
  | 'api_errors'
  | 'oauth_refresh_failures'
  | 'style_extractions'
  | 'ingestion_posts';

interface MetricEvent {
  metric: MetricName;
  value: number;
  workspaceId?: string | undefined;
  tags?: Record<string, string> | undefined;
}

export function recordMetric(event: MetricEvent): void {
  logger.info({ ...event, type: 'metric' }, `metric:${event.metric}`);
}

export function recordAILatency(latencyMs: number, model: string, workspaceId?: string): void {
  recordMetric({
    metric: 'ai_latency_ms',
    value: latencyMs,
    workspaceId,
    tags: { model },
  });
}

export function recordAICost(costUsd: number, model: string, workspaceId?: string): void {
  recordMetric({
    metric: 'ai_cost_usd',
    value: costUsd,
    workspaceId,
    tags: { model },
  });
}
