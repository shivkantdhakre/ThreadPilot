// ─── Agent types ──────────────────────────────────────────────────────────────

export interface AgentResult<T = unknown> {
  workflowId: string;
  status: 'success' | 'failure' | 'needs_approval';
  result: T | null;
  error?: string;
}

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'BLOCKED';

export interface AgentRunDto {
  id: string;
  workspaceId: string;
  workflowId: string;
  status: string;
  promptVersion: string;
  profileVersion: number | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  latencyMs: number | null;
  startedAt: string;
  completedAt: string | null;
}
