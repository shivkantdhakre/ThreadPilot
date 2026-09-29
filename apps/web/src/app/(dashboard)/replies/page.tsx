'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  MessageSquare,
  Sparkles,
  CheckCircle2,
  Clock,
  Filter,
  RefreshCw,
  Search,
  AlertTriangle,
  Send,
  Zap,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

// Engagement Modular Components
import {
  InteractionItem,
  AutonomyMode,
  EngagementStats,
  ReplyExecutionData,
  InteractionIntent,
} from '../../../components/engagement/types';
import { EngagementHeader } from '../../../components/engagement/EngagementHeader';
import { AmbiguityAlertBanner } from '../../../components/engagement/AmbiguityAlertBanner';
import { InteractionCard } from '../../../components/engagement/InteractionCard';
import { InteractionDetailDeck } from '../../../components/engagement/InteractionDetailDeck';
import { RegenerateDraftModal } from '../../../components/engagement/RegenerateDraftModal';
import { DismissModal } from '../../../components/engagement/DismissModal';
import { OperatorResolveModal } from '../../../components/engagement/OperatorResolveModal';
import { AutonomySettingsModal } from '../../../components/engagement/AutonomySettingsModal';

type FilterTab = 'REVIEW_REQUIRED' | 'REPLIED' | 'AUTO_REPLIED' | 'DISMISSED' | 'ALL';

export default function RepliesPage() {
  const { workspace } = useAuth();

  // Multi-Account & Autonomy State
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [autonomyMode, setAutonomyMode] = useState<AutonomyMode>('REVIEW_ONLY');
  const [killSwitchActive, setKillSwitchActive] = useState<boolean>(false);
  const [stats, setStats] = useState<EngagementStats | null>(null);

  // Queue & Interactions State
  const [activeTab, setActiveTab] = useState<FilterTab>('REVIEW_REQUIRED');
  const [intentFilter, setIntentFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [interactions, setInteractions] = useState<InteractionItem[]>([]);
  const [selectedInteractionId, setSelectedInteractionId] = useState<string | null>(null);
  const [selectedInteraction, setSelectedInteraction] = useState<InteractionItem | null>(null);

  // Loading & Sync States
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isApproving, setIsApproving] = useState(false);

  // Modals
  const [isAutonomyModalOpen, setIsAutonomyModalOpen] = useState(false);
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [isDismissModalOpen, setIsDismissModalOpen] = useState(false);
  const [isResolveModalOpen, setIsResolveModalOpen] = useState(false);
  const [selectedExecutionForResolve, setSelectedExecutionForResolve] = useState<ReplyExecutionData | null>(null);
  const [selectedInteractionIdForResolve, setSelectedInteractionIdForResolve] = useState<string | null>(null);

  // 1. Load Connected Accounts & Preferences
  const loadInitialContext = useCallback(async () => {
    try {
      const [accRes, prefRes] = await Promise.allSettled([
        apiClient.get<{ accounts?: any[] }>('/threads-auth/status'),
        apiClient.get<any>('/profile/preferences'),
      ]);

      if (accRes.status === 'fulfilled' && accRes.value.accounts) {
        const accs = accRes.value.accounts;
        setAccounts(accs);
        if (accs.length > 0 && !selectedAccountId) {
          setSelectedAccountId(accs[0].id);
        }
      }

      if (prefRes.status === 'fulfilled' && prefRes.value) {
        const pref = prefRes.value;
        const mode = (pref.autonomyReplies || 'REVIEW_ONLY') as AutonomyMode;
        setAutonomyMode(mode);
        setKillSwitchActive(Boolean(pref.repliesPaused));
      }
    } catch (err) {
      console.error('Failed to load initial context:', err);
    }
  }, [selectedAccountId]);

  // 2. Fetch Stats & Interactions for Selected Account & Tab
  const fetchInteractions = useCallback(async () => {
    if (!workspace) return;
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      if (selectedAccountId) {
        queryParams.set('socialAccountId', selectedAccountId);
      }

      if (activeTab === 'REVIEW_REQUIRED') {
        queryParams.set('status', 'REVIEW_REQUIRED');
      } else if (activeTab === 'REPLIED') {
        queryParams.set('status', 'REPLIED');
      } else if (activeTab === 'DISMISSED') {
        queryParams.set('status', 'DISMISSED');
      }

      if (intentFilter !== 'ALL') {
        queryParams.set('intent', intentFilter);
      }

      const [listRes, statsRes] = await Promise.allSettled([
        apiClient.get<{ data: InteractionItem[] }>(`/engagement/interactions?${queryParams.toString()}`),
        apiClient.get<EngagementStats>(
          `/engagement/stats${selectedAccountId ? `?socialAccountId=${selectedAccountId}` : ''}`
        ),
      ]);

      if (listRes.status === 'fulfilled') {
        let items = listRes.value.data || [];
        if (activeTab === 'AUTO_REPLIED') {
          items = items.filter(
            (item) =>
              item.status === 'REPLIED' &&
              item.policyDecisions?.some(
                (p) => p.stage === 'POST_GENERATION_SAFETY' && p.decision === 'AUTO_REPLY'
              )
          );
        }
        setInteractions(items);

        if (items.length > 0 && items[0]) {
          // Preserve selection or default to first
          if (!selectedInteractionId || !items.some((i) => i.id === selectedInteractionId)) {
            setSelectedInteractionId(items[0].id);
          }
        } else {
          setSelectedInteractionId(null);
          setSelectedInteraction(null);
        }
      }

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value);
      }
    } catch (err) {
      console.error('Failed to fetch interactions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [workspace, selectedAccountId, activeTab, intentFilter, selectedInteractionId]);

  // 3. Load Details for Selected Interaction
  useEffect(() => {
    if (!selectedInteractionId) {
      setSelectedInteraction(null);
      return;
    }

    async function loadDetail() {
      try {
        const item = await apiClient.get<InteractionItem>(`/engagement/interactions/${selectedInteractionId}`);
        setSelectedInteraction(item);
      } catch (err) {
        console.error('Failed to load interaction detail:', err);
      }
    }
    loadDetail();
  }, [selectedInteractionId]);

  useEffect(() => {
    loadInitialContext();
  }, [loadInitialContext]);

  useEffect(() => {
    fetchInteractions();
  }, [fetchInteractions]);

  // Handler: Sync Inbound Comments
  const handleSync = async () => {
    if (!selectedAccountId) return;
    setIsSyncing(true);
    try {
      await apiClient.post('/engagement/sync', { socialAccountId: selectedAccountId });
      // Short delay for BullMQ processor to start ingesting
      setTimeout(() => {
        fetchInteractions();
        setIsSyncing(false);
      }, 1500);
    } catch (err: any) {
      console.error('Sync failed:', err);
      setIsSyncing(false);
    }
  };

  // Handler: Approve Draft
  const handleApprove = async (interactionId: string, versionId?: string) => {
    setIsApproving(true);
    try {
      await apiClient.post(`/engagement/interactions/${interactionId}/approve`, { versionId });
      // Optimistic update
      setInteractions((prev) =>
        prev.map((item) =>
          item.id === interactionId ? { ...item, status: 'APPROVED' } : item
        )
      );
      if (selectedInteraction?.id === interactionId) {
        setSelectedInteraction((prev) => (prev ? { ...prev, status: 'APPROVED' } : null));
      }
      setTimeout(() => {
        fetchInteractions();
      }, 1000);
    } catch (err: any) {
      throw err;
    } finally {
      setIsApproving(false);
    }
  };

  // Handler: Update Draft (User Inline Edit)
  const handleUpdateDraft = async (interactionId: string, text: string, versionNumber: number) => {
    const updated = await apiClient.patch<InteractionItem>(
      `/engagement/interactions/${interactionId}/draft`,
      { body: text, versionNumber },
      { headers: { 'If-Match': `"${versionNumber}"` } }
    );
    setSelectedInteraction(updated);
    fetchInteractions();
  };

  // Handler: Trigger Regeneration
  const handleRegenerate = async (interactionId: string, preference: string) => {
    await apiClient.post(`/engagement/interactions/${interactionId}/draft`, {
      userPreference: preference || undefined,
      regenerate: true,
    });
    // Give worker time to complete generation
    setTimeout(() => {
      fetchInteractions();
    }, 2000);
  };

  // Handler: Dismiss Interaction
  const handleDismiss = async (interactionId: string, reason: string) => {
    await apiClient.post(`/engagement/interactions/${interactionId}/dismiss`, { reason });
    setInteractions((prev) => prev.filter((i) => i.id !== interactionId));
    setSelectedInteraction(null);
    fetchInteractions();
  };

  // Handler: Resolve Ambiguity
  const handleResolveAmbiguity = async (
    executionId: string,
    resolution: 'CONFIRMED_PUBLISHED' | 'CONFIRMED_NOT_PUBLISHED',
    externalPostId?: string,
    notes?: string
  ) => {
    await apiClient.post(`/engagement/executions/${executionId}/resolve`, {
      resolution,
      externalPostId,
      notes,
    });
    fetchInteractions();
  };

  // Handler: Save Autonomy Preferences
  const handleSavePreferences = async (mode: AutonomyMode, killSwitch: boolean) => {
    await apiClient.patch('/profile/preferences', {
      autonomyReplies: mode,
      repliesPaused: killSwitch,
    });
    setAutonomyMode(mode);
    setKillSwitchActive(killSwitch);
  };

  // Filter interactions by local search query
  const filteredInteractions = interactions.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.content.toLowerCase().includes(q) ||
      item.authorUsernameSnapshot.toLowerCase().includes(q) ||
      (item.authorDisplayNameSnapshot && item.authorDisplayNameSnapshot.toLowerCase().includes(q))
    );
  });

  // Collect any ambiguous executions across loaded items
  const ambiguousExecutions: Array<{
    execution: ReplyExecutionData;
    interactionId: string;
    authorUsername: string;
    snippet: string;
  }> = [];

  for (const item of interactions) {
    const ambig = item.executions?.find(
      (e) =>
        e.hasExternalAmbiguity ||
        e.status === 'RECOVERY_REQUIRED' ||
        e.recoveryResolution === 'OPERATOR_REQUIRED'
    );
    if (ambig) {
      ambiguousExecutions.push({
        execution: ambig,
        interactionId: item.id,
        authorUsername: item.authorUsernameSnapshot,
        snippet: item.content,
      });
    }
  }

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Social Engagement & Review Queue"
        subtitle="Manage inbound discussions, verify AI candidate replies, and arbitrate publishing"
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Header: Accounts, Autonomy Badge, Metrics & Sync */}
        <EngagementHeader
          accounts={accounts}
          selectedAccountId={selectedAccountId}
          onSelectAccount={(accId) => setSelectedAccountId(accId)}
          autonomyMode={autonomyMode}
          killSwitchActive={killSwitchActive}
          onOpenAutonomySettings={() => setIsAutonomyModalOpen(true)}
          isSyncing={isSyncing}
          onSync={handleSync}
          stats={stats}
        />

        {/* Ambiguity Alert Banner (Visible when external uncertainty occurs) */}
        <AmbiguityAlertBanner
          ambiguousExecutions={ambiguousExecutions}
          onOpenResolveModal={(exec, intId) => {
            setSelectedExecutionForResolve(exec);
            setSelectedInteractionIdForResolve(intId);
            setIsResolveModalOpen(true);
          }}
        />

        {/* Filter Navigation Tabs & Search */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-canvas-border pb-3">
          {/* Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setActiveTab('REVIEW_REQUIRED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'REVIEW_REQUIRED'
                  ? 'bg-coral-500 text-white shadow-sm'
                  : 'bg-white text-text-secondary hover:text-text-primary border border-canvas-border'
              }`}
            >
              <Clock className="h-3.5 w-3.5" />
              <span>Needs Review</span>
              {stats && stats.pendingReview > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    activeTab === 'REVIEW_REQUIRED' ? 'bg-white/30 text-white' : 'bg-coral-100 text-coral-800'
                  }`}
                >
                  {stats.pendingReview}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('REPLIED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'REPLIED'
                  ? 'bg-coral-500 text-white shadow-sm'
                  : 'bg-white text-text-secondary hover:text-text-primary border border-canvas-border'
              }`}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Replied</span>
              {stats && stats.replied > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-soft-gray text-text-muted">
                  {stats.replied}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('AUTO_REPLIED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 whitespace-nowrap ${
                activeTab === 'AUTO_REPLIED'
                  ? 'bg-coral-500 text-white shadow-sm'
                  : 'bg-white text-text-secondary hover:text-text-primary border border-canvas-border'
              }`}
            >
              <Zap className="h-3.5 w-3.5 text-amber-300" />
              <span>Autonomous</span>
              {stats && stats.autoReplied > 0 && (
                <span className="text-[10px] px-1.5 py-0.2 rounded-full font-mono bg-soft-gray text-text-muted">
                  {stats.autoReplied}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('DISMISSED')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'DISMISSED'
                  ? 'bg-coral-500 text-white shadow-sm'
                  : 'bg-white text-text-secondary hover:text-text-primary border border-canvas-border'
              }`}
            >
              <span>Dismissed</span>
            </button>

            <button
              onClick={() => setActiveTab('ALL')}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-coral-500 text-white shadow-sm'
                  : 'bg-white text-text-secondary hover:text-text-primary border border-canvas-border'
              }`}
            >
              <span>All Activity</span>
            </button>
          </div>

          {/* Search & Intent Filter */}
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <Search className="h-3.5 w-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search comments or author..."
                className="input-base text-xs pl-8 pr-3 py-1.5 w-48 sm:w-56"
              />
            </div>

            <select
              value={intentFilter}
              onChange={(e) => setIntentFilter(e.target.value)}
              className="input-base text-xs py-1.5 px-3 bg-white w-32"
            >
              <option value="ALL">All Intents</option>
              <option value="QUESTION">Questions</option>
              <option value="AGREEMENT">Agreements</option>
              <option value="DISAGREEMENT">Disagreements</option>
              <option value="REQUEST">Requests</option>
              <option value="TROLLING">Trolling / Toxic</option>
            </select>
          </div>
        </div>

        {/* 2-Column Deck: Left (List) & Right (Detail & Actions) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: List of Interactions (5 cols) */}
          <div className="lg:col-span-5 space-y-3">
            {isLoading ? (
              <div className="card-base p-12 text-center">
                <ThreadPilotLoader message="Loading engagement inbox..." />
              </div>
            ) : filteredInteractions.length === 0 ? (
              <div className="card-base p-8 text-center space-y-3">
                <EmptyState
                  icon={MessageSquare}
                  title="No interactions found"
                  description={
                    activeTab === 'REVIEW_REQUIRED'
                      ? 'You are all caught up! No candidate replies require review right now.'
                      : 'No interactions match the selected filters.'
                  }
                />
                <button
                  onClick={handleSync}
                  disabled={isSyncing}
                  className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>Check for New Replies</span>
                </button>
              </div>
            ) : (
              <div className="space-y-3 max-h-[720px] overflow-y-auto pr-1">
                {filteredInteractions.map((item) => (
                  <InteractionCard
                    key={item.id}
                    interaction={item}
                    isSelected={item.id === selectedInteractionId}
                    onSelect={() => setSelectedInteractionId(item.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Interaction Full Detail Deck (7 cols) */}
          <div className="lg:col-span-7">
            {selectedInteraction ? (
              <InteractionDetailDeck
                interaction={selectedInteraction}
                onApprove={handleApprove}
                onUpdateDraft={handleUpdateDraft}
                onOpenRegenerateModal={() => setIsRegenerateModalOpen(true)}
                onOpenDismissModal={() => setIsDismissModalOpen(true)}
                onOpenResolveModal={() => {
                  if (selectedInteraction.executions?.[0]) {
                    setSelectedExecutionForResolve(selectedInteraction.executions[0]);
                    setSelectedInteractionIdForResolve(selectedInteraction.id);
                    setIsResolveModalOpen(true);
                  }
                }}
                isApproving={isApproving}
              />
            ) : (
              <div className="card-base p-16 text-center space-y-3">
                <MessageSquare className="h-10 w-10 text-text-muted mx-auto" />
                <h3 className="text-sm font-bold text-text-primary">Select an Inbound Discussion</h3>
                <p className="text-xs text-text-muted max-w-sm mx-auto leading-relaxed">
                  Choose a conversation from the left to inspect thread context, analyze AI intent, and verify the candidate reply draft.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modals */}
      <AutonomySettingsModal
        isOpen={isAutonomyModalOpen}
        onClose={() => setIsAutonomyModalOpen(false)}
        currentMode={autonomyMode}
        killSwitchActive={killSwitchActive}
        onSavePreferences={handleSavePreferences}
      />

      {selectedInteraction && (
        <>
          <RegenerateDraftModal
            isOpen={isRegenerateModalOpen}
            onClose={() => setIsRegenerateModalOpen(false)}
            interactionId={selectedInteraction.id}
            onRegenerate={handleRegenerate}
          />

          <DismissModal
            isOpen={isDismissModalOpen}
            onClose={() => setIsDismissModalOpen(false)}
            interactionId={selectedInteraction.id}
            authorUsername={selectedInteraction.authorUsernameSnapshot}
            onDismiss={handleDismiss}
          />
        </>
      )}

      {selectedExecutionForResolve && (
        <OperatorResolveModal
          isOpen={isResolveModalOpen}
          onClose={() => {
            setIsResolveModalOpen(false);
            setSelectedExecutionForResolve(null);
            setSelectedInteractionIdForResolve(null);
          }}
          execution={selectedExecutionForResolve}
          interactionId={selectedInteractionIdForResolve}
          onResolve={handleResolveAmbiguity}
        />
      )}
    </div>
  );
}
