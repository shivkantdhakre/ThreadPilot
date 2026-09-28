'use client';

import React from 'react';
import { History, Bot, User, Clock, ArrowRight, Check } from 'lucide-react';

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
    <div className="card-base p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-violet-600" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary font-display">
            Revision History
          </h3>
        </div>
        <span className="badge-neutral text-[10px]">{versions.length} revisions</span>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1 divide-y divide-canvas-border">
        {versions.map((ver) => {
          const isSelected = ver.id === currentVersionId;
          const isAI = ver.editedBy.toLowerCase().includes('ai') || ver.editedBy.toLowerCase().includes('graph');

          return (
            <button
              key={ver.id}
              onClick={() => onSelectVersion(ver)}
              className={`w-full pt-2.5 pb-2 px-2 text-left rounded-xl transition-all duration-150 flex items-start justify-between gap-3 ${
                isSelected
                  ? 'bg-paper border border-canvas-border shadow-subtle'
                  : 'hover:bg-soft-gray/50'
              }`}
            >
              <div className="space-y-1 min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      isAI
                        ? 'badge-violet'
                        : 'badge-cyan'
                    }`}
                  >
                    {isAI ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                    v{ver.version} • {isAI ? 'AI' : 'Manual'}
                  </span>
                  <span className="text-[10px] text-text-muted font-mono flex items-center gap-0.5">
                    <Clock className="h-2.5 w-2.5" />
                    {new Date(ver.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                <p className="text-xs text-text-primary font-medium line-clamp-1">
                  {ver.diffSummary || ver.hook || ver.body.slice(0, 50)}
                </p>
              </div>

              {isSelected && (
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-coral-500 text-white shrink-0 mt-1">
                  <Check className="h-3 w-3" />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default VersionHistory;
