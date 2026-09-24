'use client';

import React from 'react';
import { History, Bot, User, Clock, ArrowRight } from 'lucide-react';

export interface VersionItem {
  id: string;
  version: number;
  body: string;
  hook: string | null;
  cta: string | null;
  editedBy: string;
  diffSummary: string | null;
  createdAt: string;
}

interface VersionHistoryProps {
  versions: VersionItem[];
  currentVersionId: string;
  onSelectVersion: (version: VersionItem) => void;
}

export function VersionHistory({
  versions,
  currentVersionId,
  onSelectVersion,
}: VersionHistoryProps) {
  if (versions.length === 0) return null;

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 shadow-card-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-violet-400" />
          <h3 className="text-sm font-bold text-white tracking-tight font-display">Version Timeline</h3>
        </div>
        <span className="badge-neutral text-[10px]">{versions.length} revisions</span>
      </div>

      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {versions.map((ver) => {
          const isSelected = ver.id === currentVersionId;
          const isAI = ver.editedBy.toLowerCase().includes('ai') || ver.editedBy.toLowerCase().includes('graph');

          return (
            <button
              key={ver.id}
              onClick={() => onSelectVersion(ver)}
              className={`flex w-full items-start justify-between rounded-2xl border p-3.5 text-left transition-all duration-150 ${
                isSelected
                  ? 'border-coral-500/40 bg-coral-500/10 text-white shadow-sm'
                  : 'border-white/[0.05] bg-ink-900/60 text-white/70 hover:border-white/10 hover:bg-ink-850'
              }`}
            >
              <div className="space-y-1.5 truncate pr-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isAI
                        ? 'badge-violet'
                        : 'badge-cyan'
                    }`}
                  >
                    {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    v{ver.version} • {isAI ? 'AI Synthesis' : 'Manual'}
                  </span>
                  <span className="text-[10px] text-white/40 flex items-center gap-1 font-mono">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-white/90 line-clamp-1 font-medium">
                  {ver.diffSummary || ver.hook || ver.body.slice(0, 50)}
                </p>
              </div>

              {isSelected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-coral-500/20 text-coral-400 shrink-0 mt-1">
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
