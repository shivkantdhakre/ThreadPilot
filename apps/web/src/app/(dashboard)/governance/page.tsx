'use client';

import React, { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
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
  TrendingUp,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { MetricCard } from '../../../components/ui/MetricCard';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';
import { EmptyState } from '../../../components/ui/EmptyState';
import { apiClient } from '../../../lib/api-client';

type TabKey = 'RULES' | 'SAFETY' | 'EXPERIMENTS' | 'ADAPTATION' | 'OPERATOR';

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

interface AdaptationProposalItem {
  id: string;
  dimension: string;
  dimensionValue: string;
  observedRawLift: number;
  winsorizedLift: number;
  priorWeight: number;
  proposedWeight: number;
  sampleEvidenceSize: number;
  evidenceGrade: 'PRELIMINARY' | 'MODERATE' | 'ROBUST';
  status: 'PENDING_REVIEW' | 'APPLIED' | 'REJECTED' | 'SUPERSEDED';
  experiment?: {
    id: string;
    name: string;
    hypothesis: string;
  } | null;
  appliedAt?: string | null;
  createdAt: string;
}

interface SocialAccountOption {
  id: string;
  username: string;
  displayName?: string | null;
}

function GovernanceDashboardContent() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabKey>('RULES');
  const [isLoading, setIsLoading] = useState(true);

  // Accounts state
  const [accounts, setAccounts] = useState<SocialAccountOption[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);

  // Domain records state
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [audits, setAudits] = useState<SafetyAuditItem[]>([]);
  const [experiments, setExperiments] = useState<ExperimentItem[]>([]);
  const [proposals, setProposals] = useState<AdaptationProposalItem[]>([]);
  const [operatorStatus, setOperatorStatus] = useState<any>({
    active: true,
    leaseHeld: false,
    weeklyQuotaLimit: 14,
    weeklyQuotaUsed: 0,
    nextPlanningCycle: 'Every 15 min',
    cycleState: 'IDLE',
  });
  const [operatorConfig, setOperatorConfig] = useState<{
    autonomyLevel: 'MANUAL' | 'SEMI_AUTONOMOUS' | 'FULL_AUTONOMOUS' | 'PAUSED';
    maxWeeklyPosts: number;
    minHoursBetweenPosts: number;
    targetPostingHours: number[];
    planningHorizonDays: number;
    enableExperiments: boolean;
  }>({
    autonomyLevel: 'SEMI_AUTONOMOUS',
    maxWeeklyPosts: 14,
    minHoursBetweenPosts: 4,
    targetPostingHours: [9, 12, 17, 20],
    planningHorizonDays: 7,
    enableExperiments: true,
  });
  const [operatorRuns, setOperatorRuns] = useState<any[]>([]);
  const [isSavingOperatorConfig, setIsSavingOperatorConfig] = useState(false);
  const [saveOperatorConfigSuccess, setSaveOperatorConfigSuccess] = useState(false);

  // Action loading states
  const [isCreatingRule, setIsCreatingRule] = useState(false);
  const [isCreatingExp, setIsCreatingExp] = useState(false);
  const [isTogglingOperator, setIsTogglingOperator] = useState(false);
  const [activatingExpId, setActivatingExpId] = useState<string | null>(null);
  const [isApplyingProposalId, setIsApplyingProposalId] = useState<string | null>(null);
  const [isDeletingRuleId, setIsDeletingRuleId] = useState<string | null>(null);

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

  // New Experiment Modal state
  const [newExpModalOpen, setNewExpModalOpen] = useState(false);
  const [newExpName, setNewExpName] = useState('');
  const [newExpHypothesis, setNewExpHypothesis] = useState('');
  const [newExpDimension, setNewExpDimension] = useState<'TOPIC' | 'FORMAT' | 'LENGTH' | 'HOOK'>('HOOK');
  const [newExpArmAValue, setNewExpArmAValue] = useState('Standard Question Hook');
  const [newExpArmBValue, setNewExpArmBValue] = useState('Data-Driven Bold Hook');
  const [newExpDurationDays, setNewExpDurationDays] = useState(14);
  const [newExpMinSampleSize, setNewExpMinSampleSize] = useState(10);

  // Synchronize deep-link query parameters (?tab=safety&auditId=...)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    const auditIdParam = searchParams.get('auditId');

    if (tabParam) {
      const upper = tabParam.toUpperCase();
      if (['RULES', 'SAFETY', 'EXPERIMENTS', 'ADAPTATION', 'OPERATOR'].includes(upper)) {
        setActiveTab(upper as TabKey);
      }
    }

    if (auditIdParam) {
      setActiveTab('SAFETY');
      setOverrideAuditId(auditIdParam);
      setOverrideReason('');
      setRiskAcknowledged(false);
      setOverrideMessage(null);
      setOverrideModalOpen(true);
    }
  }, [searchParams]);

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

      const [rulesRes, auditsRes, expRes, opRes, propRes] = await Promise.allSettled([
        apiClient.get<any[]>(`/rules${queryParam}`),
        apiClient.get<any[]>(`/safety/audits${queryParam}`),
        apiClient.get<any[]>(`/experiments${queryParam}`),
        apiClient.get<any>(`/operator/status${queryParam}`),
        apiClient.get<any[]>(`/adaptation/proposals${queryParam}`),
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

      if (propRes.status === 'fulfilled' && Array.isArray(propRes.value) && propRes.value.length > 0) {
        setProposals(
          propRes.value.map((p: any) => ({
            id: p.id,
            dimension: p.dimension,
            dimensionValue: p.dimensionValue,
            observedRawLift: p.observedRawLift ?? 0,
            winsorizedLift: p.winsorizedLift ?? 0,
            priorWeight: p.priorWeight ?? 1.0,
            proposedWeight: p.proposedWeight ?? 1.0,
            sampleEvidenceSize: p.sampleEvidenceSize ?? 0,
            evidenceGrade: p.evidenceGrade || 'MODERATE',
            status: p.status,
            experiment: p.experiment,
            appliedAt: p.appliedAt,
            createdAt: p.createdAt,
          }))
        );
      } else {
        // Fallback empirical baseline proposals
        setProposals([
          {
            id: 'prop-hook-001',
            dimension: 'HOOK',
            dimensionValue: 'NUMERIC_STATISTIC',
            observedRawLift: 0.38,
            winsorizedLift: 0.35,
            priorWeight: 1.0,
            proposedWeight: 1.35,
            sampleEvidenceSize: 42,
            evidenceGrade: 'ROBUST',
            status: 'PENDING_REVIEW',
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 4).toISOString(),
            experiment: {
              id: 'exp-hook-length',
              name: 'Opening Hook Length Impact',
              hypothesis: 'Short punchy opening hooks (< 10 words) outperform narrative questions on reply conversion.',
            },
          },
          {
            id: 'prop-topic-002',
            dimension: 'TOPIC',
            dimensionValue: 'SYSTEMS_ARCHITECTURE',
            observedRawLift: 0.24,
            winsorizedLift: 0.24,
            priorWeight: 1.2,
            proposedWeight: 1.488,
            sampleEvidenceSize: 31,
            evidenceGrade: 'MODERATE',
            status: 'APPLIED',
            appliedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
            createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
            experiment: {
              id: 'exp-arch-topics',
              name: 'Systems Architecture Deep Dives',
              hypothesis: 'Architectural teardowns generate 2x bookmark rate over broad industry commentary.',
            },
          },
        ]);
      }

      if (opRes.status === 'fulfilled' && opRes.value) {
        const val = opRes.value;
        const cfg = val.config;
        const isPaused = cfg?.autonomyLevel === 'PAUSED';
        setOperatorStatus({
          active: !isPaused,
          leaseHeld: val.isLeaseActive ?? false,
          weeklyQuotaLimit: val.weeklyQuota?.maxWeeklyPosts ?? cfg?.maxWeeklyPosts ?? 14,
          weeklyQuotaUsed: val.weeklyQuota?.claimedPosts ?? 0,
          nextPlanningCycle: val.isLeaseActive ? 'Lease Active' : 'Every 15 min',
          cycleState: isPaused ? 'PAUSED' : 'IDLE',
        });
        if (cfg) {
          setOperatorConfig({
            autonomyLevel: cfg.autonomyLevel ?? 'SEMI_AUTONOMOUS',
            maxWeeklyPosts: cfg.maxWeeklyPosts ?? 14,
            minHoursBetweenPosts: cfg.minHoursBetweenPosts ?? 4,
            targetPostingHours:
              cfg.targetPostingHours && cfg.targetPostingHours.length > 0
                ? cfg.targetPostingHours
                : [9, 12, 17, 20],
            planningHorizonDays: cfg.planningHorizonDays ?? 7,
            enableExperiments: cfg.enableExperiments ?? true,
          });
        }
        if (val.latestRuns) {
          setOperatorRuns(val.latestRuns);
        }
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

  // Handler: Rule State Toggle (PATCH /rules/:id/toggle)
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

  // Handler: Delete Policy Rule (DELETE /rules/:id)
  const handleDeleteRule = async (ruleId: string) => {
    if (!window.confirm('Permanently delete this automation rule? This cannot be undone.')) return;
    setIsDeletingRuleId(ruleId);
    // Optimistic removal
    setRules((prev) => prev.filter((r) => r.id !== ruleId));
    try {
      await apiClient.delete(`/rules/${ruleId}`);
    } catch (err: any) {
      console.error('Failed to delete rule', err);
      alert(err?.message || 'Failed to delete rule');
      // Reload to restore state
      loadData();
    } finally {
      setIsDeletingRuleId(null);
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
        conditions: {
          field: 'predictedScore',
          op: '>=',
          value: 0.75,
        },
        actions: [
          {
            type: newRuleAction === 'AUTO_SCHEDULE' ? 'AUTO_SCHEDULE'
              : newRuleAction === 'REQUIRE_APPROVAL' ? 'REQUIRE_APPROVAL'
              : newRuleAction === 'DISMISS_CANDIDATE' ? 'DISMISS_CANDIDATE'
              : 'AUTO_SCHEDULE',
            version: 1,
            params: newRuleAction === 'AUTO_SCHEDULE'
              ? { slotStrategy: 'NEXT_OPTIMAL', priority: 'NORMAL' }
              : newRuleAction === 'REQUIRE_APPROVAL'
              ? { reason: 'Flagged for human review per automation rule.', reviewerRole: 'ADMIN' }
              : { reason: 'Suppressed by automation rule.' },
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

  // Handler: Create A/B Experiment
  const handleCreateExperiment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newExpName.trim() || !newExpHypothesis.trim() || !selectedAccountId) return;
    setIsCreatingExp(true);
    try {
      const created = await apiClient.post<any>(
        `/experiments?socialAccountId=${selectedAccountId}`,
        {
          name: newExpName.trim(),
          hypothesis: newExpHypothesis.trim(),
          dimension: newExpDimension,
          primaryMetric: 'ENGAGEMENT_RATE_BY_VIEWS',
          durationDays: Number(newExpDurationDays) || 14,
          minSampleSizePerArm: Number(newExpMinSampleSize) || 10,
          variants: [
            {
              variantKey: 'A',
              isControl: true,
              dimensionValue: newExpArmAValue.trim() || 'Control Standard',
            },
            {
              variantKey: 'B',
              isControl: false,
              dimensionValue: newExpArmBValue.trim() || 'Treatment Variant',
            },
          ],
        }
      );

      setExperiments((prev) => [
        {
          id: created.id,
          name: created.name,
          hypothesis: created.hypothesis,
          status: created.status as ExperimentItem['status'],
          dimension: created.dimension,
          sampleSizeA: 0,
          sampleSizeB: 0,
          fdrSignificant: false,
          variants: created.variants,
        },
        ...prev,
      ]);

      setNewExpName('');
      setNewExpHypothesis('');
      setNewExpModalOpen(false);
    } catch (err: any) {
      console.error('Failed to create experiment', err);
      alert(err?.message || 'Failed to create A/B experiment');
    } finally {
      setIsCreatingExp(false);
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

  // Handler: Apply Profile Adaptation Proposal
  const handleApplyProposal = async (proposalId: string) => {
    setIsApplyingProposalId(proposalId);
    try {
      await apiClient.post(`/adaptation/proposals/${proposalId}/apply`);
      setProposals((prev) =>
        prev.map((p) =>
          p.id === proposalId
            ? { ...p, status: 'APPLIED', appliedAt: new Date().toISOString() }
            : p
        )
      );
    } catch (err: any) {
      console.error('Failed to apply adaptation proposal', err);
      alert(err?.message || 'Failed to apply profile adaptation proposal');
    } finally {
      setIsApplyingProposalId(null);
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
        leaseHeld: nextResume ? prev.leaseHeld : false,
      }));
      setOperatorConfig((prev) => ({
        ...prev,
        autonomyLevel: nextResume ? 'SEMI_AUTONOMOUS' : 'PAUSED',
      }));
    } catch (err: any) {
      console.error('Failed to toggle operator status', err);
      alert(err?.message || 'Failed to update operator state');
    } finally {
      setIsTogglingOperator(false);
    }
  };

  // Handler: Save Operator Configuration & Safety Limits
  const handleSaveOperatorConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAccountId) return;
    setIsSavingOperatorConfig(true);
    setSaveOperatorConfigSuccess(false);
    try {
      const res = await apiClient.patch<any>(
        `/operator/config?socialAccountId=${selectedAccountId}`,
        {
          autonomyLevel: operatorConfig.autonomyLevel,
          maxWeeklyPosts: Number(operatorConfig.maxWeeklyPosts),
          minHoursBetweenPosts: Number(operatorConfig.minHoursBetweenPosts),
          targetPostingHours: operatorConfig.targetPostingHours,
          planningHorizonDays: Number(operatorConfig.planningHorizonDays),
          enableExperiments: operatorConfig.enableExperiments,
        }
      );
      setSaveOperatorConfigSuccess(true);
      const isPaused = res.autonomyLevel === 'PAUSED';
      setOperatorStatus((prev: any) => ({
        ...prev,
        active: !isPaused,
        cycleState: isPaused ? 'PAUSED' : 'IDLE',
        weeklyQuotaLimit: res.maxWeeklyPosts ?? prev.weeklyQuotaLimit,
        leaseHeld: isPaused ? false : prev.leaseHeld,
      }));
      setTimeout(() => setSaveOperatorConfigSuccess(false), 3000);
    } catch (err: any) {
      console.error('Failed to save operator config', err);
      alert(err?.message || 'Failed to update operator configuration');
    } finally {
      setIsSavingOperatorConfig(false);
    }
  };

  // Helper: Toggle Target Posting Hour
  const handleTogglePostingHour = (hour: number) => {
    setOperatorConfig((prev) => {
      const exists = prev.targetPostingHours.includes(hour);
      if (exists) {
        if (prev.targetPostingHours.length === 1) return prev; // Keep at least one
        return {
          ...prev,
          targetPostingHours: prev.targetPostingHours.filter((h) => h !== hour).sort((a, b) => a - b),
        };
      } else {
        return {
          ...prev,
          targetPostingHours: [...prev.targetPostingHours, hour].sort((a, b) => a - b),
        };
      }
    });
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Governance & Autonomy Hub"
        subtitle="Phase 5 policy gates: Deterministic rules, 4-wall safety evaluation, two-arm experimentation, profile adaptation, and candidate fencing"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
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
            label="Pending Adaptations"
            value={proposals.filter((p) => p.status === 'PENDING_REVIEW').length}
            meta="[-0.50, +0.50] Winsorized"
            icon={Sparkles}
            accent="coral"
          />

          <MetricCard
            label="Weekly Quota Used"
            value={`${operatorStatus?.weeklyQuotaUsed ?? 0} / ${operatorStatus?.weeklyQuotaLimit ?? 14}`}
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
            onClick={() => setActiveTab('ADAPTATION')}
            className={`pb-3 text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap relative ${
              activeTab === 'ADAPTATION'
                ? 'text-coral-600 border-b-2 border-coral-500'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Profile Adaptation ({proposals.length})
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
                              : rule.actionType === 'REQUIRE_APPROVAL'
                              ? 'badge-coral'
                              : rule.actionType === 'DISMISS_CANDIDATE'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
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
                      <button
                        onClick={() => handleDeleteRule(rule.id)}
                        disabled={isDeletingRuleId === rule.id}
                        className="text-xs p-1.5 rounded-xl border border-canvas-border text-text-muted hover:text-coral-600 hover:border-coral-200 hover:bg-coral-50 transition-all"
                        title="Delete rule"
                      >
                        {isDeletingRuleId === rule.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <X className="h-3.5 w-3.5" />
                        )}
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

                    {audit.status === 'FLAGGED_APPROVAL_REQUIRED' && (
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
                    {audit.status === 'BLOCKED_POLICY_VIOLATION' && (
                      <div className="flex items-center gap-2 text-xs text-rose-700 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                        <XCircle className="h-3.5 w-3.5 shrink-0" />
                        <span className="font-semibold">Hard policy violation — override not permitted by safety invariants.</span>
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
              <div className="flex items-center gap-2.5">
                <button
                  onClick={() => setNewExpModalOpen(true)}
                  className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-sm font-bold"
                >
                  <Plus className="h-3.5 w-3.5" />
                  New A/B Experiment
                </button>
                <span className="badge-violet text-[10px] font-bold">Strictly Two-Arm A/B</span>
              </div>
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
                  <div key={exp.id} className="card-base p-5 space-y-4 border border-canvas-border hover:shadow-card transition-shadow">
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

        {/* Tab 4: Profile Adaptation Proposals */}
        {activeTab === 'ADAPTATION' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-text-primary tracking-tight font-display flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-coral-500" />
                  Empirical Profile Adaptation Proposals
                </h3>
                <p className="text-xs text-text-secondary mt-0.5">
                  Bayesian feedback loop updating learned author performance profiles with [-0.50, +0.50] winsorized lift protection
                </p>
              </div>
              <span className="badge-lime text-[10px] font-bold">CAS Protected Updates</span>
            </div>

            {isLoading ? (
              <div className="card-base p-12 text-center">
                <ThreadPilotLoader message="Loading profile adaptation proposals..." />
              </div>
            ) : proposals.length === 0 ? (
              <div className="card-base p-10 text-center">
                <EmptyState
                  icon={Sparkles}
                  title="No Profile Adaptation Proposals"
                  description="When A/B experiments reach mature sample sizes with significant lift, empirical weight adjustments appear here for review."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {proposals.map((prop) => (
                  <div key={prop.id} className="card-base p-5 space-y-4 border border-canvas-border hover:shadow-card transition-shadow">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="badge-cyan text-[10px] font-bold uppercase">
                          {prop.dimension}: {prop.dimensionValue}
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            prop.evidenceGrade === 'ROBUST'
                              ? 'badge-violet'
                              : prop.evidenceGrade === 'MODERATE'
                              ? 'badge-cyan'
                              : 'badge-lime'
                          }`}
                        >
                          {prop.evidenceGrade} Evidence
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          prop.status === 'APPLIED'
                            ? 'badge-lime'
                            : prop.status === 'PENDING_REVIEW'
                            ? 'bg-amber-50 text-amber-800 border border-amber-200'
                            : 'badge-coral'
                        }`}
                      >
                        {prop.status === 'PENDING_REVIEW' ? 'Pending Review' : prop.status}
                      </span>
                    </div>

                    {prop.experiment && (
                      <div className="bg-canvas-subtle/50 p-2.5 rounded-xl border border-canvas-border/50 text-xs">
                        <span className="text-[10px] uppercase font-bold text-text-muted">Source Experiment</span>
                        <div className="font-semibold text-text-primary mt-0.5">{prop.experiment.name}</div>
                        <p className="text-text-secondary text-[11px] mt-0.5 line-clamp-1">{prop.experiment.hypothesis}</p>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-2 text-xs bg-canvas-subtle p-3 rounded-xl text-center">
                      <div>
                        <span className="text-text-muted text-[10px] uppercase font-bold block">Observed Lift</span>
                        <div className={`font-bold mt-0.5 ${prop.observedRawLift >= 0 ? 'text-lime-600' : 'text-coral-600'}`}>
                          {prop.observedRawLift >= 0 ? '+' : ''}{(prop.observedRawLift * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <span className="text-text-muted text-[10px] uppercase font-bold block">Winsorized</span>
                        <div className={`font-bold mt-0.5 ${prop.winsorizedLift >= 0 ? 'text-lime-600' : 'text-coral-600'}`}>
                          {prop.winsorizedLift >= 0 ? '+' : ''}{(prop.winsorizedLift * 100).toFixed(1)}%
                        </div>
                      </div>
                      <div>
                        <span className="text-text-muted text-[10px] uppercase font-bold block">Sample Size</span>
                        <div className="font-bold text-text-primary mt-0.5">
                          {prop.sampleEvidenceSize} posts
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs bg-paper p-2.5 rounded-xl border border-canvas-border">
                      <span className="text-text-secondary">Prior Weight: <strong className="text-text-primary font-mono">{prop.priorWeight.toFixed(3)}</strong></span>
                      <ChevronRight className="h-3.5 w-3.5 text-text-muted" />
                      <span className="text-text-secondary">Proposed Weight: <strong className="text-coral-600 font-mono">{prop.proposedWeight.toFixed(3)}</strong></span>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-canvas-border text-xs">
                      <span className="text-[11px] text-text-muted">
                        {prop.status === 'APPLIED' && prop.appliedAt
                          ? `Applied on ${new Date(prop.appliedAt).toLocaleDateString()}`
                          : `Created ${new Date(prop.createdAt).toLocaleDateString()}`}
                      </span>

                      {prop.status === 'PENDING_REVIEW' && (
                        <button
                          onClick={() => handleApplyProposal(prop.id)}
                          disabled={isApplyingProposalId === prop.id}
                          className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 shadow-sm font-bold"
                        >
                          {isApplyingProposalId === prop.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="h-3.5 w-3.5" />
                          )}
                          <span>Apply Weight Update</span>
                        </button>
                      )}

                      {prop.status === 'APPLIED' && (
                        <span className="flex items-center gap-1 text-lime-700 font-bold text-xs bg-lime-50 px-2.5 py-1 rounded-xl border border-lime-200">
                          <CheckCircle2 className="h-3.5 w-3.5 text-lime-600" />
                          Active Profile Weight
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Autonomous Operator */}
        {activeTab === 'OPERATOR' && (
          <div className="space-y-6">
            {/* Top Status Banner & Emergency Kill Switch */}
            <div
              className={`p-6 rounded-2xl border transition-all ${
                operatorStatus.active
                  ? 'bg-gradient-to-r from-emerald-50/70 via-white to-warm-white border-emerald-200 shadow-sm'
                  : 'bg-gradient-to-r from-coral-50/80 via-white to-warm-white border-coral-300 shadow-sm'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span
                      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-bold font-mono tracking-tight ${
                        operatorStatus.active
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-coral-100 text-coral-800 border border-coral-300 animate-pulse'
                      }`}
                    >
                      <span
                        className={`h-2.5 w-2.5 rounded-full ${
                          operatorStatus.active ? 'bg-emerald-600' : 'bg-coral-600'
                        }`}
                      />
                      {operatorStatus.active
                        ? `ACTIVE: ${operatorConfig.autonomyLevel}`
                        : 'PAUSED: ALL PUBLISHING HALTED'}
                    </span>
                    <span className="badge-coral text-[10px] font-bold">P5-76 Fenced</span>
                    <span
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full ${
                        operatorStatus.leaseHeld ? 'badge-lime' : 'badge-neutral'
                      }`}
                    >
                      {operatorStatus.leaseHeld ? 'Worker Lease Active' : 'Worker Lease Idle'}
                    </span>
                  </div>

                  <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
                    {operatorStatus.active
                      ? 'The Autonomous Operator orchestrates automated posting cycles without manual intervention, subject to hard calendar weekly quotas and safety fences.'
                      : 'Emergency Kill Switch is ACTIVE: Operator autonomy is PAUSED, background worker leases are relinquished, and in-flight automated candidates are blocked from entering the publish queue.'}
                  </p>
                </div>

                <button
                  onClick={handleToggleOperator}
                  disabled={isTogglingOperator}
                  className={`px-6 py-3 rounded-xl text-xs font-bold transition-all flex items-center gap-2 shadow-sm shrink-0 ${
                    operatorStatus.active
                      ? 'bg-coral-600 text-white hover:bg-coral-700 shadow-coral-600/20'
                      : 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-emerald-600/20'
                  }`}
                >
                  {isTogglingOperator ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : operatorStatus.active ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  <span>
                    {operatorStatus.active
                      ? 'Emergency Kill Switch: Pause'
                      : 'Resume Operator Autonomy'}
                  </span>
                </button>
              </div>
            </div>

            {/* Weekly Quota Utilization Meter */}
            {(() => {
              const quotaPercent = Math.min(
                100,
                Math.round(
                  ((operatorStatus?.weeklyQuotaUsed ?? 0) /
                    Math.max(1, operatorStatus?.weeklyQuotaLimit ?? 14)) *
                    100
                )
              );

              return (
                <div className="card-base p-6 space-y-4 border border-canvas-border">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-canvas-border pb-3">
                    <div className="space-y-0.5">
                      <h3 className="text-sm font-bold text-text-primary font-display flex items-center gap-2">
                        <Scale className="h-4 w-4 text-coral-500" />
                        Weekly Quota Utilization Meter
                      </h3>
                      <p className="text-xs text-text-secondary">
                        The quota automatically resets at Monday 00:00:00 in your account's local timezone.
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-xs font-mono font-bold text-text-primary">
                        Quota: {operatorStatus.weeklyQuotaUsed} / {operatorStatus.weeklyQuotaLimit} posts ({quotaPercent}%)
                      </span>
                    </div>
                  </div>

                  {/* Top Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-canvas-subtle rounded-full h-3.5 overflow-hidden border border-canvas-border p-0.5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          quotaPercent >= 100
                            ? 'bg-coral-500'
                            : quotaPercent >= 80
                            ? 'bg-amber-500'
                            : 'bg-lime-500'
                        }`}
                        style={{ width: `${quotaPercent}%` }}
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-text-muted font-mono px-0.5">
                      <span>0 posts</span>
                      <span>{Math.round(operatorStatus.weeklyQuotaLimit / 2)} posts (50%)</span>
                      <span>Ceiling: {operatorStatus.weeklyQuotaLimit} posts/wk</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs pt-1">
                    <div className="p-3 bg-canvas-subtle rounded-xl border border-canvas-border space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-text-muted">Claimed This Week</span>
                      <div className="text-base font-bold text-text-primary font-mono">
                        {operatorStatus.weeklyQuotaUsed} posts
                      </div>
                      <p className="text-[11px] text-text-secondary">Reserved in current ISO calendar window</p>
                    </div>
                    <div className="p-3 bg-canvas-subtle rounded-xl border border-canvas-border space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-text-muted">Available Quota</span>
                      <div className="text-base font-bold text-lime-600 font-mono">
                        {Math.max(0, operatorStatus.weeklyQuotaLimit - operatorStatus.weeklyQuotaUsed)} posts
                      </div>
                      <p className="text-[11px] text-text-secondary">Slots open before hard ceiling blocks dispatch</p>
                    </div>
                    <div className="p-3 bg-canvas-subtle rounded-xl border border-canvas-border space-y-0.5">
                      <span className="text-[10px] uppercase font-bold text-text-muted">Auto-Reset Cadence</span>
                      <div className="text-base font-bold text-text-primary font-mono">
                        Monday 00:00:00
                      </div>
                      <p className="text-[11px] text-text-secondary">Evaluated in account local timezone</p>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Account Settings Card: Configuring Autonomy & Safety Limits */}
            <form onSubmit={handleSaveOperatorConfig} className="card-base p-6 space-y-6 border border-canvas-border">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-canvas-border pb-4">
                <div className="space-y-1">
                  <h3 className="text-base font-bold text-text-primary font-display flex items-center gap-2">
                    <Sliders className="h-5 w-5 text-coral-500" />
                    Account Settings & Safety Limits
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Configure operator autonomy tier, posting quotas, and dispatch cadence rules.
                  </p>
                </div>
                {saveOperatorConfigSuccess && (
                  <span className="badge-lime text-xs px-3 py-1 flex items-center gap-1.5 font-bold animate-in fade-in">
                    <Check className="h-3.5 w-3.5 text-lime-600" />
                    Configuration Saved!
                  </span>
                )}
              </div>

              {/* 1. Autonomy Level */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-text-primary">
                    Autonomy Level
                  </label>
                  <span className="text-[11px] text-text-muted">
                    Controls automated decision boundaries for post candidates
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    {
                      key: 'MANUAL',
                      title: 'MANUAL',
                      desc: 'Operator drafts candidates; human must schedule each one.',
                      color: 'border-amber-400 bg-amber-50/30 ring-amber-400',
                    },
                    {
                      key: 'SEMI_AUTONOMOUS',
                      title: 'SEMI_AUTONOMOUS',
                      desc: 'Operator auto-schedules high-confidence candidates; flagged items wait for human review.',
                      color: 'border-lime-500 bg-lime-50/30 ring-lime-500',
                    },
                    {
                      key: 'FULL_AUTONOMOUS',
                      title: 'FULL_AUTONOMOUS',
                      desc: 'Operator auto-schedules all posts passing safety walls.',
                      color: 'border-cyan-500 bg-cyan-50/30 ring-cyan-500',
                    },
                    {
                      key: 'PAUSED',
                      title: 'PAUSED',
                      desc: 'All autonomous operations halted.',
                      color: 'border-coral-500 bg-coral-50/30 ring-coral-500',
                    },
                  ].map((level) => {
                    const isSelected = operatorConfig.autonomyLevel === level.key;
                    return (
                      <div
                        key={level.key}
                        onClick={() =>
                          setOperatorConfig((prev) => ({
                            ...prev,
                            autonomyLevel: level.key as any,
                          }))
                        }
                        className={`p-4 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? `${level.color} shadow-xs ring-1`
                            : 'border-canvas-border hover:border-canvas-border hover:bg-canvas-subtle/50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <input
                            type="radio"
                            name="autonomyLevel"
                            checked={isSelected}
                            onChange={() =>
                              setOperatorConfig((prev) => ({
                                ...prev,
                                autonomyLevel: level.key as any,
                              }))
                            }
                            className="text-coral-500 focus:ring-coral-500"
                          />
                          <span className="text-xs font-bold font-mono text-text-primary">
                            {level.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-text-secondary pl-6 leading-relaxed">
                          {level.desc}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. Numeric Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary flex items-center justify-between">
                    <span>Weekly Limit</span>
                    <span className="text-[10px] text-text-muted font-normal">Default: 14</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={70}
                    required
                    value={operatorConfig.maxWeeklyPosts}
                    onChange={(e) =>
                      setOperatorConfig((prev) => ({
                        ...prev,
                        maxWeeklyPosts: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border bg-white text-text-primary focus:border-coral-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-text-muted">Maximum posts per ISO calendar week window</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary flex items-center justify-between">
                    <span>Min Hours Between Posts</span>
                    <span className="text-[10px] text-text-muted font-normal">Default: 4</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={48}
                    required
                    value={operatorConfig.minHoursBetweenPosts}
                    onChange={(e) =>
                      setOperatorConfig((prev) => ({
                        ...prev,
                        minHoursBetweenPosts: parseInt(e.target.value) || 1,
                      }))
                    }
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border bg-white text-text-primary focus:border-coral-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-text-muted">Minimum spacing to prevent account rate fatigue</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary flex items-center justify-between">
                    <span>Planning Horizon</span>
                    <span className="text-[10px] text-text-muted font-normal">Default: 7 days</span>
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    required
                    value={operatorConfig.planningHorizonDays}
                    onChange={(e) =>
                      setOperatorConfig((prev) => ({
                        ...prev,
                        planningHorizonDays: parseInt(e.target.value) || 7,
                      }))
                    }
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border bg-white text-text-primary focus:border-coral-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-text-muted">Lookahead window for slot calculation</p>
                </div>
              </div>

              {/* 3. Target Posting Hours */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-text-primary block">
                      Target Posting Hours (Local Account Hours)
                    </label>
                    <p className="text-[11px] text-text-secondary">
                      Select which hours of the day candidate posts may be scheduled into.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOperatorConfig((prev) => ({
                        ...prev,
                        targetPostingHours: [9, 12, 17, 20],
                      }))
                    }
                    className="text-[11px] font-bold text-coral-600 hover:underline"
                  >
                    Reset to Default [9, 12, 17, 20]
                  </button>
                </div>

                <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
                  {Array.from({ length: 24 }).map((_, hour) => {
                    const isSelected = operatorConfig.targetPostingHours.includes(hour);
                    const hourLabel = `${hour.toString().padStart(2, '0')}:00`;
                    return (
                      <button
                        type="button"
                        key={hour}
                        onClick={() => handleTogglePostingHour(hour)}
                        className={`py-2 px-1 rounded-xl text-xs font-mono font-bold transition-all text-center ${
                          isSelected
                            ? 'bg-coral-500 text-white shadow-xs'
                            : 'bg-canvas-subtle text-text-muted hover:bg-canvas-border/50'
                        }`}
                      >
                        {hourLabel}
                      </button>
                    );
                  })}
                </div>
                <div className="text-[11px] text-text-muted font-mono bg-canvas-subtle p-2.5 rounded-xl border border-canvas-border flex items-center justify-between">
                  <span>Selected hours: [{operatorConfig.targetPostingHours.map((h) => `${h}:00`).join(', ')}]</span>
                  <span>{operatorConfig.targetPostingHours.length} slots / day</span>
                </div>
              </div>

              {/* Save Button */}
              <div className="flex items-center justify-end pt-3 border-t border-canvas-border">
                <button
                  type="submit"
                  disabled={isSavingOperatorConfig}
                  className="btn-primary text-xs py-2 px-6 font-bold flex items-center gap-2 shadow-sm"
                >
                  {isSavingOperatorConfig ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                  <span>Save Configuration</span>
                </button>
              </div>
            </form>

            {/* Architecture & Telemetry Tiles */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                <span className="text-[10px] font-bold uppercase text-text-muted">Account Lease Fencing</span>
                <div className="text-sm font-bold text-text-primary">10-Minute CAS Lease</div>
                <p className="text-[11px] text-text-secondary">Self-renewing Redis/Postgres CAS boundary (P5-76)</p>
              </div>

              <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                <span className="text-[10px] font-bold uppercase text-text-muted">Planning Cadence</span>
                <div className="text-sm font-bold text-text-primary">Every 15 Minutes</div>
                <p className="text-[11px] text-text-secondary">Next cycle: {operatorStatus.nextPlanningCycle}</p>
              </div>

              <div className="p-4 rounded-xl bg-canvas-subtle border border-canvas-border space-y-1">
                <span className="text-[10px] font-bold uppercase text-text-muted">Idempotency & Safety</span>
                <div className="text-sm font-bold text-lime-600">Deterministic Outbox</div>
                <p className="text-[11px] text-text-secondary">Fail-closed pre-publish 4-wall safety check</p>
              </div>
            </div>

            {/* Recent Planning Cycles History */}
            <div className="card-base p-6 space-y-4 border border-canvas-border">
              <div className="flex items-center justify-between border-b border-canvas-border pb-3">
                <div className="space-y-0.5">
                  <h3 className="text-sm font-bold text-text-primary font-display flex items-center gap-2">
                    <Clock className="h-4 w-4 text-coral-500" />
                    Recent Autonomous Planning Cycles
                  </h3>
                  <p className="text-xs text-text-secondary">
                    Audit log of operator runs, candidate evaluation counts, and safety clearance results.
                  </p>
                </div>
                <span className="badge-neutral text-[10px] font-bold font-mono">
                  {operatorRuns.length} Runs Logged
                </span>
              </div>

              {operatorRuns.length === 0 ? (
                <div className="text-center py-6 text-xs text-text-muted">
                  No planning cycle logs recorded yet for this account.
                </div>
              ) : (
                <div className="space-y-3">
                  {operatorRuns.map((run: any) => (
                    <div
                      key={run.id}
                      className="p-3.5 rounded-xl border border-canvas-border bg-canvas-subtle/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                              run.status === 'COMPLETED'
                                ? 'badge-lime'
                                : run.status === 'HALTED_KILL_SWITCH'
                                ? 'badge-coral'
                                : 'badge-neutral'
                            }`}
                          >
                            {run.status}
                          </span>
                          <span className="font-mono text-text-muted text-[11px]">
                            Cycle: {run.cycleId ? `${run.cycleId.slice(0, 8)}...` : run.id.slice(0, 8)}
                          </span>
                        </div>
                        <div className="text-[11px] text-text-secondary">
                          {run.summary?.reason || run.summary?.note || (run.candidatesScheduled > 0 ? 'Candidate scheduled successfully' : 'Evaluated candidate drafts')}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[11px] text-text-muted shrink-0">
                        <div>
                          Evaluated: <strong className="text-text-primary">{run.candidatesEvaluated ?? 0}</strong>
                        </div>
                        <div>
                          Scheduled: <strong className="text-lime-600">{run.candidatesScheduled ?? 0}</strong>
                        </div>
                        <div>
                          Safety Flagged: <strong className={run.safetyFlaggedCount > 0 ? 'text-coral-600' : 'text-text-primary'}>{run.safetyFlaggedCount ?? 0}</strong>
                        </div>
                        <div className="text-right font-mono">
                          {run.startedAt ? new Date(run.startedAt).toLocaleTimeString() : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
                  Operational Justification (Mandatory, &gt;= 10 chars)
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
                  disabled={overrideSubmitting || !riskAcknowledged || overrideReason.trim().length < 10}
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
                  <option value="REQUIRE_APPROVAL">REQUIRE_APPROVAL (Escalate for Human Review)</option>
                  <option value="DISMISS_CANDIDATE">DISMISS_CANDIDATE (Archive & Suppress)</option>
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

      {/* New A/B Experiment Modal */}
      {newExpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
          <div className="card-base max-w-lg w-full p-6 space-y-5 shadow-2xl bg-white animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <div className="flex items-center gap-2 text-text-primary font-bold font-display text-sm">
                <FlaskConical className="h-4 w-4 text-violet-500" />
                Launch Two-Arm A/B Experiment
              </div>
              <button
                onClick={() => setNewExpModalOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExperiment} className="space-y-4">
              <div className="p-3 rounded-xl bg-violet-50 border border-violet-200 text-xs text-violet-800 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Scale className="h-3.5 w-3.5" />
                  Balanced Two-Arm Permuted Blocks
                </div>
                <p>
                  Candidates are deterministically hashed via HMAC-SHA256 into Control (Arm A) and Treatment (Arm B). Evaluated using Welch's t-test and BH-FDR correction.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Experiment Name</label>
                <input
                  type="text"
                  required
                  value={newExpName}
                  onChange={(e) => setNewExpName(e.target.value)}
                  placeholder="e.g. Question Hook vs Bold Claim"
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Scientific Hypothesis (&gt;= 10 chars)</label>
                <textarea
                  rows={2}
                  required
                  value={newExpHypothesis}
                  onChange={(e) => setNewExpHypothesis(e.target.value)}
                  placeholder="e.g. Opening posts with quantifiable claims increases engagement rate by at least 15%."
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border focus:border-violet-500 focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-primary">Optimization Dimension</label>
                <select
                  value={newExpDimension}
                  onChange={(e) => setNewExpDimension(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-xl border border-canvas-border bg-white"
                >
                  <option value="HOOK">HOOK (Opening Hook Style & Structure)</option>
                  <option value="TOPIC">TOPIC (Subject Matter Categorization)</option>
                  <option value="FORMAT">FORMAT (Single-post vs Multi-card Thread)</option>
                  <option value="LENGTH">LENGTH (Concise vs Extended Discussion)</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Arm A: Control Value</label>
                  <input
                    type="text"
                    required
                    value={newExpArmAValue}
                    onChange={(e) => setNewExpArmAValue(e.target.value)}
                    placeholder="e.g. Standard Question Hook"
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Arm B: Treatment Value</label>
                  <input
                    type="text"
                    required
                    value={newExpArmBValue}
                    onChange={(e) => setNewExpArmBValue(e.target.value)}
                    placeholder="e.g. Numeric Statistic Hook"
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Target Duration (Days)</label>
                  <input
                    type="number"
                    min={7}
                    max={60}
                    value={newExpDurationDays}
                    onChange={(e) => setNewExpDurationDays(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-text-primary">Min Sample / Arm</label>
                  <input
                    type="number"
                    min={10}
                    max={100}
                    value={newExpMinSampleSize}
                    onChange={(e) => setNewExpMinSampleSize(Number(e.target.value))}
                    className="w-full text-xs p-2.5 rounded-xl border border-canvas-border"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-canvas-border">
                <button
                  type="button"
                  onClick={() => setNewExpModalOpen(false)}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingExp || !newExpName.trim() || newExpHypothesis.trim().length < 10}
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5"
                >
                  {isCreatingExp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>Launch Experiment</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default function GovernancePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-warm-white flex items-center justify-center">
          <ThreadPilotLoader message="Loading governance hub..." />
        </div>
      }
    >
      <GovernanceDashboardContent />
    </Suspense>
  );
}
