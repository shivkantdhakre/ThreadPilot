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
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-white tracking-tight">Version Timeline</h3>
        </div>
        <span className="text-xs text-white/40">{versions.length} revisions</span>
      </div>

      <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
        {versions.map((ver) => {
          const isSelected = ver.id === currentVersionId;
          const isAI = ver.editedBy.toLowerCase().includes('ai') || ver.editedBy.toLowerCase().includes('graph');

          return (
            <button
              key={ver.id}
              onClick={() => onSelectVersion(ver)}
              className={`flex w-full items-start justify-between rounded-xl border p-3 text-left transition-all ${
                isSelected
                  ? 'border-brand-500/40 bg-brand-500/10 text-white shadow-sm'
                  : 'border-white/5 bg-white/[0.02] text-white/70 hover:border-white/10 hover:bg-white/[0.05]'
              }`}
            >
              <div className="space-y-1 truncate pr-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      isAI
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        : 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    }`}
                  >
                    {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    v{ver.version} • {isAI ? 'AI' : 'Manual'}
                  </span>
                  <span className="text-[10px] text-white/40 flex items-center gap-1">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-white/90 line-clamp-1 font-medium">
                  {ver.diffSummary || ver.hook || ver.body.slice(0, 40)}
                </p>
              </div>

              {isSelected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-500/20 text-brand-400">
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
