'use client';

import React from 'react';
import { AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { ReplyExecutionData } from './types';

interface AmbiguityAlertBannerProps {
  ambiguousExecutions: Array<{
    execution: ReplyExecutionData;
    interactionId: string;
    authorUsername: string;
    snippet: string;
  }>;
  onOpenResolveModal: (execution: ReplyExecutionData, interactionId: string) => void;
}

export function AmbiguityAlertBanner({
  ambiguousExecutions,
  onOpenResolveModal,
}: AmbiguityAlertBannerProps) {
  if (!ambiguousExecutions || ambiguousExecutions.length === 0) return null;

  const firstItem = ambiguousExecutions[0];
  if (!firstItem) return null;

  return (
    <div className="rounded-2xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5 shadow-sm text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-bold text-amber-900">
              External Ambiguity Requiring Operator Confirmation ({ambiguousExecutions.length})
            </h4>
            <span className="badge-coral text-[9px] uppercase font-mono tracking-wider">
              OPERATOR_REQUIRED
            </span>
          </div>
          <p className="text-xs text-amber-800/90 mt-1 max-w-3xl leading-relaxed">
            Meta API publish request encountered a network timeout or ambiguous 5xx response. Automated
            reconciliation completed its 45-second verification deadline. Please manually confirm whether the
            reply landed on Threads to prevent duplicate external posting.
          </p>
          <div className="mt-2 text-[11px] font-mono text-amber-900 bg-amber-100/70 px-2.5 py-1 rounded-lg inline-block border border-amber-200">
            Target author: @{firstItem.authorUsername} · Container: {firstItem.execution.containerId || 'None'}
          </div>
        </div>
      </div>

      <button
        onClick={() => onOpenResolveModal(firstItem.execution, firstItem.interactionId)}
        className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs py-2 px-4 shrink-0 shadow-subtle flex items-center gap-1.5"
      >
        <span>Resolve Ambiguity</span>
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
