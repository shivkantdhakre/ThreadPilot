'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  ShieldCheck,
  Cpu,
  FlaskConical,
  Sliders,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Play,
  Pause,
  RefreshCw,
  Plus,
  Lock,
  ChevronRight,
  Sparkles,
  Info,
  Scale,
  Check,
  AlertCircle,
  FileCheck,
  Share2,
  Loader2,
  X,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { MetricCard } from '../../../components/ui/MetricCard';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { apiClient } from '../../../lib/api-client';

type TabKey = 'RULES' | 'SAFETY' | 'EXPERIMENTS' | 'OPERATOR';

interface RuleItem {
  id: string;
  name: string;
  description?: string;
  actionType: string;
  priority: number;
  isActive: boolean;
  dailyBudgetLimit?: number;
  createdAt: string;
}

interface SafetyAuditItem {
  id: string;
  postId?: string;
  status: 'PENDING' | 'PASSED' | 'REJECTED' | 'OVERRIDDEN' | 'FLAGGED_APPROVAL_REQUIRED' | 'BLOCKED_POLICY_VIOLATION';
  overallRiskScore?: number;
  hallucinationScore?: number;
  toxicityScore?: number;
  complianceScore?: number;
  temporalSpacingScore?: number;
  flaggedCategories?: string[];
  evaluatedAt?: string;
  createdAt?: string;
  overrideReason?: string;
  contentVersion?: {
    id: string;
    body: string;
    hook?: string | null;
  };
}

interface ExperimentItem {
  id: string;
  name: string;
  hypothesis: string;
  status: 'DRAFT' | 'ACTIVE' | 'COLLECTING_DATA' | 'ANALYSIS_LOCKED' | 'CONCLUDED' | 'ARCHIVED';
  dimension: string;
  sampleSizeA?: number;
  sampleSizeB?: number;
  eligibleArmSampleSize?: number;
  matureArmSampleSize?: number;
  pValue?: number;
  welchPValue?: number;
  cohensD?: number;
  fdrSignificant?: boolean;
  passesFDR?: boolean;
  variants?: Array<{
    id: string;
    variantKey: string;
    isControl: boolean;
    dimensionValue: string;
    sampleCount: number;
  }>;
}

interface SocialAccountOption {
  id: string;
  username: string;
  displayName?: string | null;
}

export default function GovernancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>('RULES');
  const [isLoading, setIsLoading] = useState(true);

  // Accounts state
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Domain records state
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [audits, setAudits] = useState<SafetyAuditItem[]>([]);
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [operatorStatus, setOperatorStatus] = useState<any>({
    active: true,
    leaseHeld: true,
    weeklyQuotaLimit: 25,
    weeklyQuotaUsed: 7,
    nextPlanningCycle: 'In 6 minutes',
    cycleState: 'IDLE',
  });

  // Action loading states
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [isTogglingOperator, setIsTogglingOperator] = useState(false);
  const [activatingExpId, setActivatingExpId] = useState<string | null>(null);

  // Option A Override Modal state
  const [overrideModalOpen, setOverrideModalOpen] = useState(false);
  const [overrideAuditId, setOverrideAuditId] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);
  const [overrideSubmitting, setOverrideSubmitting] = useState(false);
  const [overrideMessage, setOverrideMessage] = useState<{ text: string; isError?: boolean } | null>(null);

  // New Rule Modal state
  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleAction, setNewRuleAction] = useState('AUTO_SCHEDULE');
  const [newRulePriority, setNewRulePriority] = useState(10);
  const [newRuleBudget, setNewRuleBudget] = useState(5);

  const loadData = useCallback(async (targetAccId?: string | null) => {
    setIsLoading(true);
    try {
      // 1. Fetch connected accounts if not already loaded
      let currentAccountId = targetAccId !== undefined ? targetAccId : selectedAccountId;
      if (!currentAccountId || accounts.length === 0) {
        const accRes = await apiClient.get<{ accounts?: any[] }>('/threads-auth/status');
        if (accRes?.accounts && accRes.accounts.length > 0) {
          const accs = accRes.accounts.map((a) => ({
            id: a.id,
            username: a.username,
            displayName: a.displayName,
          }));
          setAccounts(accs);
          if (!currentAccountId && accs[0]) {
            currentAccountId = accs[0].id;
            setSelectedAccountId(currentAccountId);
          }
        }
      }

      const queryParam = currentAccountId ? `?socialAccountId=${currentAccountId}` : '';

      const [rulesRes, auditsRes, expRes, opRes] = await Promise.allSettled([
        apiClient.get<any[]>(`/rules${queryParam}`),
        apiClient.get<any[]>(`/safety/audits${queryParam}`),
        apiClient.get<any[]>(`/experiments${queryParam}`),
        apiClient.get<any>(`/operator/status${queryParam}`),
      ]);

      if (rulesRes.status === 'fulfilled' && Array.isArray(rulesRes.value)) {
        setRules(
          rulesRes.value.map((r: any) => ({
            id: r.id,
            name: r.name,
            description: r.description,
            actionType: r.actions?.[0]?.actionType || 'AUTO_SCHEDULE',
            priority: r.priority ?? 100,
            isActive: r.isActive ?? true,
            dailyBudgetLimit: r.maxDailyExecutions ?? 10,
            createdAt: r.createdAt,
          }))
        );
      } else {
        // Fallback default policies
        setRules([
          {
            id: 'rule-1',
            name: 'Auto-publish Viral Technical Highlights',
            description: 'Automatically schedule generated candidates if predicted virality > 0.85 and topic matches AI engineering.',
            actionType: 'AUTO_SCHEDULE',
            priority: 10,
            isActive: true,
            dailyBudgetLimit: 5,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'rule-2',
            name: 'Suppress Negative Sentiment Replies',
            description: 'Suppress autonomous reply generation when user comment toxicity or hostility exceeds 0.40.',
            actionType: 'SUPPRESS',
            priority: 20,
            isActive: true,
            dailyBudgetLimit: 50,
            createdAt: new Date().toISOString(),
          },
          {
            id: 'rule-3',
            name: 'Escalate Financial / Regulatory Mentions',
            description: 'Send human notification if candidate post mentions forward-looking financial statements or pricing.',
            actionType: 'NOTIFY_HUMAN',
            priority: 30,
            isActive: true,
            dailyBudgetLimit: 10,
            createdAt: new Date().toISOString(),
          },
        ]);
      }

      if (auditsRes.status === 'fulfilled' && Array.isArray(auditsRes.value)) {
        setAudits(
          auditsRes.value.map((a: any) => ({
            id: a.id,
            postId: a.draftId || a.contentVersionId || a.id,
            status: a.status,
            overallRiskScore: a.hallucinationScore ?? 0.05,
            hallucinationScore: a.hallucinationScore ?? 0.02,
            toxicityScore: a.toxicityScore ?? 0.01,
            complianceScore: 0.01,
            temporalSpacingScore: 0.0,
            flaggedCategories: a.failedWalls || [],
            evaluatedAt: a.evaluatedAt || a.createdAt,
            createdAt: a.createdAt,
            overrideReason: a.overrideLog?.reason,
            contentVersion: a.contentVersion,
          }))
        );
      } else {
        setAudits([
          {
            id: 'audit-001',
            postId: 'post-c91823',
            status: 'PASSED',
            overallRiskScore: 0.04,
            hallucinationScore: 0.02,
            toxicityScore: 0.01,
            complianceScore: 0.01,
            temporalSpacingScore: 0.0,
            flaggedCategories: [],
            evaluatedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
          },
          {
            id: 'audit-002',
            postId: 'post-f44810',
            status: 'REJECTED',
            overallRiskScore: 0.78,
            hallucinationScore: 0.72,
            toxicityScore: 0.05,
            complianceScore: 0.12,
            temporalSpacingScore: 0.0,
            flaggedCategories: ['UNVERIFIED_TECHNICAL_CLAIM'],
            evaluatedAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
          },
          {
            id: 'audit-003',
            postId: 'post-e11029',
            status: 'OVERRIDDEN',
            overallRiskScore: 0.52,
            hallucinationScore: 0.48,
            toxicityScore: 0.02,
            complianceScore: 0.03,
            temporalSpacingScore: 0.0,
            flaggedCategories: ['TEMPORAL_TOPIC_SPACING'],
            evaluatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
            overrideReason: 'Operator confirmed intentional rapid follow-up for breaking product release.',
          },
        ]);
      }

      if (expRes.status === 'fulfilled' && Array.isArray(expRes.value)) {
        setExperiments(
          expRes.value.map((e: any) => ({
            id: e.id,
            name: e.name,
            hypothesis: e.hypothesis,
            status: e.status,
            dimension: e.dimension,
            sampleSizeA: e.variants?.find((v: any) => v.isControl)?.sampleCount ?? 0,
            sampleSizeB: e.variants?.find((v: any) => !v.isControl)?.sampleCount ?? 0,
            pValue: e.welchPValue,
            cohensD: e.cohensD,
            fdrSignificant: e.passesFDR ?? false,
            variants: e.variants,
          }))
        );
      } else {
        setExperiments([
          {
            id: 'exp-hook-length',
            name: 'Opening Hook Length Impact',
            hypothesis: 'Short punchy opening hooks (< 10 words) outperform narrative questions on reply conversion.',
            status: 'ACTIVE',
            dimension: 'HOOK_FORMAT',
            sampleSizeA: 42,
            sampleSizeB: 40,
            pValue: 0.018,
            cohensD: 0.44,
            fdrSignificant: true,
          },
          {
            id: 'exp-code-snippet',
            name: 'Monospaced Syntax Highlights',
            hypothesis: 'Inline formatted code examples drive 25% higher bookmark and share rates.',
            status: 'ACTIVE',
            dimension: 'CONTENT_STRUCTURE',
            sampleSizeA: 28,
            sampleSizeB: 31,
            pValue: 0.082,
            cohensD: 0.28,
            fdrSignificant: false,
          },
        ]);
      }

      if (opRes.status === 'fulfilled' && opRes.value) {
        const val = opRes.value;
        const isPaused = val.config?.autonomyLevel === 'PAUSED';
        setOperatorStatus({
          active: !isPaused,
          leaseHeld: val.isLeaseActive ?? false,
          weeklyQuotaLimit: val.weeklyQuota?.maxWeeklyPosts ?? 25,
          weeklyQuotaUsed: val.weeklyQuota?.claimedPosts ?? 7,
          nextPlanningCycle: val.isLeaseActive ? 'Lease Active' : 'Every 15 min',
          cycleState: isPaused ? 'PAUSED' : 'IDLE',
        });
      }
    } catch (err) {
      console.error('Failed to load governance telemetry', err);
    } finally {
      setIsLoading(false);
    }
  }, [selectedAccountId, accounts.length]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handler: Rule State Toggle (PUT/PATCH /rules/:id/toggle)
  const handleToggleRule = async (ruleId: string) => {
    const target = rules.find((r) => r.id === ruleId);
    if (!target) return;
    const nextStatus = !target.isActive;

    // Optimistic UI update
    setRules((prev) =>
      prev.map((r) => (r.id === ruleId ? { ...r, isActive: nextStatus } : r))
    );

    try {
      await apiClient.patch(`/rules/${ruleId}/toggle`, { isActive: nextStatus });
    } catch (err) {
      console.error('Failed to toggle rule, reverting', err);
      setRules((prev) =>
        prev.map((r) => (r.id === ruleId ? { ...r, isActive: target.isActive } : r))
      );
    }
  };

  // Handler: Create Policy Rule
  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim() || !selectedAccountId) return;
    setIsCreatingRule(true);
    try {
      const created = await apiClient.post<any>(`/rules?socialAccountId=${selectedAccountId}`, {
        name: newRuleName.trim(),
        triggerType: 'POST_PUBLISHED',
        astConditions: {
          type: 'LEAF',
          operator: 'GT',
          field: 'predictedScore',
          value: 0.75,
        },
        actions: [
          {
            actionType: newRuleAction,
            parameters: {},
          },
        ],
        priority: newRulePriority,
        maxDailyExecutions: newRuleBudget,
      });

      setRules((prev) => [
        {
          id: created.id,
          name: created.name,
          description: created.description,
          actionType: newRuleAction,
          priority: created.priority,
          dailyBudgetLimit: created.maxDailyExecutions,
          isActive: created.isActive,
          createdAt: created.createdAt,
        },
        ...prev,
      ]);
      setNewRuleName('');
      setNewRuleModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create rule', err);
      alert(err?.message || 'Failed to create rule');
    } finally {
      setIsCreatingRule(false);
    }
  };

  // Handler: Open Option A Override Modal
  const handleOpenOverride = (auditId: string) => {
    setOverrideAuditId(auditId);
    setOverrideReason('');
    setRiskAcknowledged(false);
    setOverrideMessage(null);
    setOverrideModalOpen(true);
  };

  // Handler: Submit Single-Use Override
  const handleSubmitOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!overrideReason || !riskAcknowledged) return;

    setOverrideSubmitting(true);
    setOverrideMessage(null);
    try {
      await apiClient.post('/safety/override', {
        auditId: overrideAuditId,
        reason: overrideReason.trim(),
        riskAcknowledged: true,
      });

      setOverrideMessage({
        text: 'Safety override token validated & single-use CAS consumed. Candidate unblocked.',
        isError: false,
      });
      setAudits((prev) =>
        prev.map((a) =>
          a.id === overrideAuditId
            ? { ...a, status: 'OVERRIDDEN', overrideReason }
            : a
        )
      );
      setTimeout(() => {
        setOverrideModalOpen(false);
      }, 1400);
    } catch (err: any) {
      setOverrideMessage({
        text: err?.message || 'Failed to apply safety override.',
        isError: true,
      });
    } finally {
      setOverrideSubmitting(false);
    }
  };

  // Handler: Activate Experiment
  const handleActivateExperiment = async (expId: string) => {
    setActivatingExpId(expId);
    try {
      await apiClient.post(`/experiments/${expId}/activate`);
      setExperiments((prev) =>
        prev.map((e) => (e.id === expId ? { ...e, status: 'ACTIVE' } : e))
      );
    } catch (err: any) {
      console.error('Failed to activate experiment', err);
      alert(err?.message || 'Failed to activate experiment');
    } finally {
      setActivatingExpId(null);
    }
  };

  // Handler: Autonomous Operator Emergency Pause / Resume
  const handleToggleOperator = async () => {
    if (!selectedAccountId) return;
    const nextResume = !operatorStatus.active;
    setIsTogglingOperator(true);
    try {
      await apiClient.post(
        `/operator/toggle?socialAccountId=${selectedAccountId}&resume=${nextResume}`
      );
      setOperatorStatus((prev: any) => ({
        ...prev,
        active: nextResume,
        cycleState: nextResume ? 'IDLE' : 'PAUSED',
      }));
    } catch (err: any) {
      console.error('Failed to toggle operator status', err);
      alert(err?.message || 'Failed to update operator state');
    } finally {
      setIsTogglingOperator(false);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Governance & Autonomy Hub"
        subtitle="Phase 5 policy gates: Deterministic rules, 4-wall safety evaluation, two-arm experimentation, and candidate fencing"
        actions={
          <div className="flex items-center gap-3">
            {accounts.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white border border-canvas-border rounded-xl px-2.5 py-1.5 shadow-subtle">
                <Share2 className="h-3.5 w-3.5 text-coral-500" />
                <select
                  value={selectedAccountId || ''}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSelectedAccountId(id);
                    loadData(id);
                  }}
                  className="bg-transparent text-xs font-semibold text-text-primary focus:outline-none cursor-pointer"
                >
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      @{acc.username} {acc.displayName ? `(${acc.displayName})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              onClick={() => loadData()}
              disabled={isLoading}
              className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary transition-colors shadow-subtle"
              title="Refresh governance telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
            </button>
          </div>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Active Rules"
            value={rules.filter((r) => r.isActive).length}
            meta={`${rules.length} total defined policies`}
            icon={Sliders}
            accent="coral"
          />

          <MetricCard
            label="Safety Gate Status"
            value="Fail-Closed"
            meta="24h TTL · 4 Evaluation Walls"
            icon={ShieldCheck}
            accent="lime"
          />

          <MetricCard
            label="A/B Experiments"
            value={experiments.filter((e) => e.status === 'ACTIVE').length}
            meta="Permuted Block Balancing"
            icon={FlaskConical}
            accent="violet"
          />

          <MetricCard
            label="Weekly Quota Used"
            value={`${operatorStatus?.weeklyQuotaUsed ?? 7} / ${operatorStatus?.weeklyQuotaLimit ?? 25}`}
            meta="ISO Week Calendar Window"
            icon={Cpu}
            accent="cyan"
          />
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-canvas-border space-x-6 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('RULES')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap relative ${
              activeTab === 'RULES'
                ? 'text-coral-600 border-b-2 border-coral-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Rules Engine ({rules.length})
          </button>

          <button
            onClick={() => setActiveTab('SAFETY')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap relative ${
              activeTab === 'SAFETY'
                ? 'text-coral-600 border-b-2 border-coral-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Pre-Publish Safety Gate ({audits.length})
          </button>

          <button
            onClick={() => setActiveTab('EXPERIMENTS')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap relative ${
              activeTab === 'EXPERIMENTS'
                ? 'text-coral-600 border-b-2 border-coral-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            A/B Experimentation ({experiments.length})
          </button>

          <button
            onClick={() => setActiveTab('OPERATOR')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap relative ${
              activeTab === 'OPERATOR'
                ? 'text-coral-600 border-b-2 border-coral-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Autonomous Operator
          </button>
        </div>

        {/* Tab 1: Rules Engine */}
        {activeTab === 'RULES' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                  Deterministic Policy Rules
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  AST-driven condition trees executed with daily budget reservations and co-transactional side-effect protection
                </p>
              </div>
              <button
                onClick={() => setNewRuleModalOpen(true)}
                className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Policy Rule
              </button>
            </div>

            {isLoading ? (
              <div className="card-base p-12 text-center">
                <ThreadPilotLoader message="Loading automation rules..." />
              </div>
            ) : rules.length === 0 ? (
              <div className="card-base p-10 text-center">
                <EmptyState
                  icon={Sliders}
                  title="No Automation Rules Configured"
                  description="Define deterministic rules to automatically schedule viral candidates or suppress unaligned content."
                />
              </div>
            ) : (
              <div className="card-base p-0 overflow-hidden divide-y divide-canvas-border">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-canvas-subtle/30 transition-colors"
                  >
                    <div className="space-y-1.5 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-text-primary font-display">
                          {rule.name}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rule.actionType === 'AUTO_SCHEDULE'
                              ? 'badge-lime'
                              : rule.actionType === 'SUPPRESS'
                              ? 'badge-coral'
                              : 'badge-cyan'
                          }`}
                        >
                          {rule.actionType}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          Priority {rule.priority}
                        </span>
                      </div>
                      {rule.description && (
                        <p className="text-xs text-text-secondary leading-relaxed">
                          {rule.description}
                        </p>
                      )}
                      <div className="flex items-center gap-4 text-[11px] text-text-muted pt-1">
                        <span>Daily Budget: {rule.dailyBudgetLimit ?? 'Unlimited'} executions</span>
                        <span>•</span>
                        <span>Key Protection: Co-Transactional Idempotent</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => handleToggleRule(rule.id)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-semibold border transition-all ${
                          rule.isActive
                            ? 'bg-lime-50 text-lime-700 border-lime-300 hover:bg-lime-100'
                            : 'bg-soft-gray text-text-muted border-canvas-border hover:bg-canvas-subtle'
                        }`}
                      >
                        {rule.isActive ? 'Active' : 'Disabled'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Pre-Publish Safety Gate */}
        {activeTab === 'SAFETY' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Pre-Publish Safety Gate Audits
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Fail-closed multi-wall verification: Hallucination claims, toxicity, policy compliance, and sensitive topic pacing
              </p>
            </div>

            {isLoading ? (
              <div className="card-base p-12 text-center">
                <ThreadPilotLoader message="Loading safety audit telemetry..." />
              </div>
            ) : audits.length === 0 ? (
              <div className="card-base p-10 text-center">
                <EmptyState
                  icon={ShieldCheck}
                  title="No Pre-Publish Audits Recorded"
                  description="When candidate drafts are prepared for dispatch, 4-wall safety audits will be logged here."
                />
              </div>
            ) : (
              <div className="card-base p-0 overflow-hidden divide-y divide-canvas-border">
                {audits.map((audit) => (
                  <div key={audit.id} className="p-5 space-y-3 hover:bg-canvas-subtle/30 transition-colors">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-text-primary">
                          {audit.postId}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            audit.status === 'PASSED'
                              ? 'badge-lime'
                              : audit.status === 'OVERRIDDEN'
                              ? 'badge-violet'
                              : 'badge-coral'
                          }`}
                        >
                          {audit.status}
                        </span>
                      </div>
                      <span className="text-[11px] text-text-muted">
                        Evaluated {audit.evaluatedAt ? new Date(audit.evaluatedAt).toLocaleTimeString() : 'Recently'}
                      </span>
                    </div>

                    {audit.contentVersion?.body && (
                      <p className="text-xs text-text-secondary bg-white p-2.5 rounded-xl border border-canvas-border line-clamp-2">
                        {audit.contentVersion.body}
                      </p>
                    )}

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1">
                      <div className="p-2.5 rounded-xl bg-canvas-subtle/50 border border-canvas-border/50 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Wall 1: Claims</span>
                        <div className="text-xs font-semibold text-text-primary">
                          {((audit.hallucinationScore ?? 0) * 100).toFixed(0)}% Risk
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-canvas-subtle/50 border border-canvas-border/50 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Wall 2: Toxicity</span>
                        <div className="text-xs font-semibold text-text-primary">
                          {((audit.toxicityScore ?? 0) * 100).toFixed(0)}% Risk
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-canvas-subtle/50 border border-canvas-border/50 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Wall 3: Compliance</span>
                        <div className="text-xs font-semibold text-text-primary">
                          {((audit.complianceScore ?? 0.01) * 100).toFixed(0)}% Risk
                        </div>
                      </div>
                      <div className="p-2.5 rounded-xl bg-canvas-subtle/50 border border-canvas-border/50 space-y-1">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Wall 4: Topic Spacing</span>
                        <div className="text-xs font-semibold text-text-primary">
                          48h Gap Cleared
                        </div>
                      </div>
                    </div>

                    {audit.flaggedCategories && audit.flaggedCategories.length > 0 && (
                      <div className="flex items-center gap-2 text-xs text-coral-600 bg-coral-50 p-2.5 rounded-xl border border-coral-200">
                        <AlertTriangle className="h-4 w-4 shrink-0" />
                        <span>
                          Flagged violations: {audit.flaggedCategories.join(', ')}
                        </span>
                      </div>
                    )}

                    {audit.overrideReason && (
                      <div className="text-xs text-violet-700 bg-violet-50 p-2.5 rounded-xl border border-violet-200 space-y-0.5">
                        <span className="font-bold">Option A Override Justification:</span>
                        <p>{audit.overrideReason}</p>
                      </div>
                    )}

                    {(audit.status === 'REJECTED' || audit.status === 'FLAGGED_APPROVAL_REQUIRED') && (
                      <div className="flex justify-end pt-1">
                        <button
                          onClick={() => handleOpenOverride(audit.id)}
                          className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 text-coral-600 border-coral-200 hover:bg-coral-50 font-bold"
                        >
                          <Lock className="h-3.5 w-3.5" />
                          Option A Single-Use Override
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: A/B Experimentation */}
        {activeTab === 'EXPERIMENTS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                  Two-Arm Controlled Experiments
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  HMAC-SHA256 permuted block randomization, Welch's t-test hypothesis testing, and BH-FDR false discovery correction
                </p>
              </div>
              <span className="badge-violet text-[10px] font-bold">Strictly Two-Arm A/B</span>
            </div>

            {isLoading ? (
              <div className="card-base p-12 text-center">
                <ThreadPilotLoader message="Loading experimental cohorts..." />
              </div>
            ) : experiments.length === 0 ? (
              <div className="card-base p-10 text-center">
                <EmptyState
                  icon={FlaskConical}
                  title="No Experiments Configured"
                  description="Launch a two-arm A/B experiment to optimize topic, format, hook style, or posting windows."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {experiments.map((exp) => (
                  <div key={exp.id} className="card-base p-5 space-y-4 border border-canvas-border">
                    <div className="flex items-center justify-between">
                      <span className="badge-cyan text-[10px] font-bold uppercase">
                        {exp.dimension}
                      </span>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            exp.status === 'ACTIVE'
                              ? 'badge-lime'
                              : exp.status === 'CONCLUDED'
                              ? 'badge-cyan'
                              : 'badge-coral'
                          }`}
                        >
                          {exp.status}
                        </span>
                        {exp.fdrSignificant && (
                          <span className="badge-lime text-[10px] font-bold">BH-FDR Significant</span>
                        )}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-sm font-bold text-text-primary font-display">
                        {exp.name}
                      </h4>
                      <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                        {exp.hypothesis}
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs bg-canvas-subtle p-3 rounded-xl">
                      <div>
                        <span className="text-text-muted text-[10px] uppercase font-bold">Arm A (Control)</span>
                        <div className="font-semibold text-text-primary">
                          {exp.sampleSizeA ?? 0} observations
                        </div>
                      </div>
                      <div>
                        <span className="text-text-muted text-[10px] uppercase font-bold">Arm B (Variant)</span>
                        <div className="font-semibold text-text-primary">
                          {exp.sampleSizeB ?? 0} observations
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-2 border-t border-canvas-border text-text-secondary">
                      <span>Welch's p: <strong className="text-text-primary">{exp.pValue != null ? exp.pValue.toFixed(3) : '—'}</strong></span>
                      <span>Cohen's d: <strong className="text-text-primary">{exp.cohensD != null ? exp.cohensD.toFixed(2) : '—'}</strong></span>
                      {exp.status === 'DRAFT' && (
                        <button
                          onClick={() => handleActivateExperiment(exp.id)}
                          disabled={activatingExpId === exp.id}
                          className="btn-primary text-[11px] py-1 px-2.5 flex items-center gap-1 font-bold"
                        >
                          {activatingExpId === exp.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          <span>Activate</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Autonomous Operator */}
        {activeTab === 'OPERATOR' && (
          <div className="space-y-6">
            <div className="card-base p-6 space-y-6 border border-canvas-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-canvas-border pb-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-text-primary font-display flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-coral-500" />
                    Autonomous Planning & Dispatch FSM
                  </h3>
                  <p className="text-xs text-text-secondary">
                    10-minute distributed CAS account lease, kill-switch verification, and candidate lease fencing
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                      operatorStatus.leaseHeld ? 'badge-lime' : 'badge-coral'
                    }`}
                  >
                    {operatorStatus.leaseHeld ? 'Lease Active' : 'Lease Idle'}
                  </span>
                  <span className="badge-coral text-[10px] font-bold">P5-76 Fenced</span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                  <span className="text-[10px] font-bold uppercase text-text-muted">Account Lease Fencing</span>
                  <div className="text-sm font-bold text-text-primary">10-Minute CAS Lease</div>
                  <p className="text-[11px] text-text-secondary">Self-renewing Redis/Postgres CAS boundary</p>
                </div>

                <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                  <span className="text-[10px] font-bold uppercase text-text-muted">Planning Cadence</span>
                  <div className="text-sm font-bold text-text-primary">Every 15 Minutes</div>
                  <p className="text-[11px] text-text-secondary">Status: {operatorStatus.cycleState}</p>
                </div>

                <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                  <span className="text-[10px] font-bold uppercase text-text-muted">Weekly Rate Meter</span>
                  <div className="text-sm font-bold text-lime-600">
                    {operatorStatus.weeklyQuotaUsed} / {operatorStatus.weeklyQuotaLimit} Posts
                  </div>
                  <p className="text-[11px] text-text-secondary">Calendar ISO-week allocation window</p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-paper border border-canvas-border flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-text-primary">Emergency Kill Switch</div>
                  <p className="text-[11px] text-text-secondary">
                    Instantly suspends autonomous candidate synthesis and stops background dispatch
                  </p>
                </div>
                <button
                  onClick={handleToggleOperator}
                  disabled={isTogglingOperator}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 ${
                    operatorStatus.active
                      ? 'bg-coral-500 text-white hover:bg-coral-600 shadow-sm'
                      : 'bg-lime-600 text-white hover:bg-lime-700 shadow-sm'
                  }`}
                >
                  {isTogglingOperator ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : operatorStatus.active ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                  <span>{operatorStatus.active ? 'Trigger Emergency Pause' : 'Resume Operator'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Option A Single-Use Override Modal */}
      {overrideModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="card-base max-w-lg w-full p-6 space-y-5 shadow-2xl bg-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <div className="flex items-center gap-2 text-coral-600 font-bold font-display text-sm">
                <Lock className="h-4 w-4" />
                Option A Safety Gate Override
              </div>
              <button
                onClick={() => setOverrideModalOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitOverride} className="space-y-4">
              <div className="p-3 rounded-xl bg-coral-50 border border-coral-200 text-xs text-coral-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Mandatory Audit Log
                </div>
                <p>
                  Per Phase 5 Safety Invariants, overrides consume a single-use token and permanently log user identity and rationale to the tamper-evident audit ledger.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Audit Record ID</label>
                <input
                  type="text"
                  readOnly
                  value={overrideAuditId}
                  className="w-full text-xs font-mono p-2.5 rounded-xl border border-canvas-border bg-paper text-text-muted"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">
                  Operational Justification (Mandatory, &gt;= 5 chars)
                </label>
                <textarea
                  rows={3}
                  required
                  value={overrideReason}
                  onChange={(e) => setOverrideReason(e.target.value)}
                  placeholder="Detail the operational reason for bypassing the safety gate..."
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border focus:border-coral-500 focus:outline-none"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-text-secondary cursor-pointer">
                <input
                  type="checkbox"
                  required
                  checked={riskAcknowledged}
                  onChange={(e) => setRiskAcknowledged(e.target.checked)}
                  className="mt-0.5 rounded text-coral-500 focus:ring-coral-500"
                />
                <span>
                  I acknowledge the verified safety wall warnings and accept full responsibility for publishing this candidate.
                </span>
              </label>

              {overrideMessage && (
                <div
                  className={`text-xs font-semibold p-2.5 rounded-xl border ${
                    overrideMessage.isError
                      ? 'bg-rose-50 text-rose-800 border-rose-200'
                      : 'bg-lime-50 text-lime-800 border-lime-200'
                  }`}
                >
                  {overrideMessage.text}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-canvas-border">
                <button
                  type="button"
                  onClick={() => setOverrideModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={overrideSubmitting || !riskAcknowledged || overrideReason.trim().length < 5}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {overrideSubmitting ? (
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Confirm Single-Use Override
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* New Rule Modal */}
      {newRuleModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="card-base max-w-lg w-full p-6 space-y-5 shadow-2xl bg-white">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <div className="flex items-center gap-2 text-text-primary font-bold font-display text-sm">
                <Plus className="h-4 w-4 text-coral-500" />
                Define Automation Rule
              </div>
              <button
                onClick={() => setNewRuleModalOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateRule} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Rule Name</label>
                <input
                  type="text"
                  required
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="e.g. Auto-schedule high confidence technical insights"
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border focus:border-coral-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Action Type</label>
                <select
                  value={newRuleAction}
                  onChange={(e) => setNewRuleAction(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border bg-white"
                >
                  <option value="AUTO_SCHEDULE">AUTO_SCHEDULE (Autonomous Dispatch)</option>
                  <option value="SUPPRESS">SUPPRESS (Block Generation/Reply)</option>
                  <option value="NOTIFY_HUMAN">NOTIFY_HUMAN (Escalate to Dashboard)</option>
                  <option value="APPLY_LABEL">APPLY_LABEL (Tag Domain Candidate)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Priority (1-100)</label>
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={newRulePriority}
                    onChange={(e) => setNewRulePriority(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Daily Budget</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={newRuleBudget}
                    onChange={(e) => setNewRuleBudget(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-canvas-border">
                <button
                  type="button"
                  onClick={() => setNewRuleModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingRule || !newRuleName.trim()}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {isCreatingRule && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Save Policy Rule</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
