'use client';

import React from 'react';
import {
  RefreshCw,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Zap,
  Sliders,
  ChevronDown,
  AtSign,
} from 'lucide-react';
import { AutonomyMode, EngagementStats } from './types';

interface AccountOption {
  id: string;
  username: string;
  displayName?: string | null;
}

interface EngagementHeaderProps {
  accounts: AccountOption[];
  selectedAccountId: string | null;
  onSelectAccount: (accountId: string) => void;
  autonomyMode: AutonomyMode;
  killSwitchActive: boolean;
  onOpenAutonomySettings: () => void;
  isSyncing: boolean;
  onSync: () => void;
  stats: EngagementStats | null;
}

export function EngagementHeader({
  accounts,
  selectedAccountId,
  onSelectAccount,
  autonomyMode,
  killSwitchActive,
  onOpenAutonomySettings,
  isSyncing,
  onSync,
  stats,
}: EngagementHeaderProps) {
  const currentAccount = accounts.find((a) => a.id === selectedAccountId) || accounts[0];

  const getAutonomyBadge = () => {
    if (killSwitchActive) {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-semibold text-rose-700">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600 animate-pulse" />
          <span>Kill Switch Active</span>
        </span>
      );
    }

    switch (autonomyMode) {
      case 'RULES_BASED':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-lime-200 bg-lime-50 px-2.5 py-1 text-xs font-semibold text-lime-800">
            <Zap className="h-3.5 w-3.5 text-lime-600" />
            <span>Autonomous Rules</span>
          </span>
        );
      case 'SHADOW':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-semibold text-violet-700">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <span>Shadow Mode</span>
          </span>
        );
      case 'REVIEW_ONLY':
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-canvas-border bg-paper px-2.5 py-1 text-xs font-semibold text-text-primary">
            <ShieldCheck className="h-3.5 w-3.5 text-coral-500" />
            <span>Review Only</span>
          </span>
        );
      case 'OFF':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-canvas-border bg-soft-gray px-2.5 py-1 text-xs font-medium text-text-muted">
            <span>Engagement Off</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-canvas-border pb-4">
        {/* Account & Identity Context */}
        <div className="flex items-center gap-3">
          {accounts.length > 1 ? (
            <div className="relative">
              <select
                value={selectedAccountId || ''}
                onChange={(e) => onSelectAccount(e.target.value)}
                className="input-base text-xs font-bold appearance-none pr-8 py-2 bg-white cursor-pointer"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username} {acc.displayName ? `(${acc.displayName})` : ''}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-3.5 w-3.5 text-text-muted absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          ) : currentAccount ? (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-canvas-border bg-white shadow-subtle">
              <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-coral-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                {currentAccount.username.slice(0, 1).toUpperCase()}
              </div>
              <span className="text-xs font-bold text-text-primary">@{currentAccount.username}</span>
              <span className="badge-neutral text-[9px] py-0.5">Meta Graph API</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-dashed border-canvas-border bg-white text-xs text-text-muted">
              <AtSign className="h-3.5 w-3.5" />
              <span>No Threads Account Linked</span>
            </div>
          )}

          {/* Autonomy Badge with quick settings trigger */}
          <button
            onClick={onOpenAutonomySettings}
            className="group inline-flex items-center gap-1.5 transition-transform active:scale-95"
            title="Configure Autonomy & Safety Policy"
          >
            {getAutonomyBadge()}
            <Sliders className="h-3.5 w-3.5 text-text-muted group-hover:text-text-primary transition-colors" />
          </button>
        </div>

        {/* Global Engagement Actions & Sync */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={onSync}
            disabled={isSyncing || !currentAccount}
            className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-subtle disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-coral-600 ${isSyncing ? 'animate-spin' : ''}`} />
            <span>{isSyncing ? 'Syncing Threads...' : 'Sync Inbound'}</span>
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-xl border border-canvas-border bg-white p-3.5 shadow-subtle">
            <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
              Needs Review
            </div>
            <div className="text-xl font-bold text-coral-600 mt-0.5">
              {stats.pendingReview}
            </div>
          </div>

          <div className="rounded-xl border border-canvas-border bg-white p-3.5 shadow-subtle">
            <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
              Replied
            </div>
            <div className="text-xl font-bold text-lime-700 mt-0.5">
              {stats.replied}
            </div>
          </div>

          <div className="rounded-xl border border-canvas-border bg-white p-3.5 shadow-subtle">
            <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
              Autonomous
            </div>
            <div className="text-xl font-bold text-violet-700 mt-0.5">
              {stats.autoReplied}
            </div>
          </div>

          <div className="rounded-xl border border-canvas-border bg-white p-3.5 shadow-subtle">
            <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted">
              Drafting Pipeline
            </div>
            <div className="text-xl font-bold text-cyan-700 mt-0.5">
              {stats.drafting}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
