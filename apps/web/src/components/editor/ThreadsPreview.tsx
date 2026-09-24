'use client';

import React from 'react';
import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal, AlertTriangle } from 'lucide-react';

interface ThreadsPreviewProps {
  body: string;
  username?: string;
  displayName?: string;
}

export function ThreadsPreview({
  body,
  username = 'your_handle',
  displayName = 'Creator Name',
}: ThreadsPreviewProps) {
  const charCount = body.length;
  const isOverLimit = charCount > 500;
  const isNearLimit = charCount >= 450 && !isOverLimit;

  return (
    <div className="flex flex-col rounded-3xl border border-white/[0.08] bg-[#111116] p-6 shadow-card-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/40">
            Threads Live Simulation
          </span>
          <span className="badge-neutral text-[9px] py-0.5">Meta API Sandbox</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border ${
              isOverLimit
                ? 'border-rose-500/40 bg-rose-500/15 text-rose-400'
                : isNearLimit
                ? 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                : 'border-white/10 bg-white/5 text-white/60'
            }`}
          >
            {charCount} / 500
          </span>
        </div>
      </div>

      {/* Threads Native Post Simulation Container */}
      <div className="rounded-2xl border border-white/[0.07] bg-black/70 p-5 transition-all shadow-inner">
        {/* Header: User avatar + handles */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-coral-500 via-violet-600 to-cyan-500 font-extrabold text-white shadow-md text-sm">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold text-white tracking-tight">{username}</span>
                <span className="text-[11px] text-white/40 font-normal">now</span>
              </div>
              <div className="text-xs text-white/50">{displayName}</div>
            </div>
          </div>
          <button className="text-white/30 hover:text-white/70 transition-colors p-1">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Post Text */}
        <div className="my-4 whitespace-pre-wrap text-sm leading-relaxed text-white/95 font-sans">
          {body.trim() ? (
            body
          ) : (
            <span className="italic text-white/30 font-normal">
              Compose or synthesize content to preview your authentic Threads appearance...
            </span>
          )}
        </div>

        {isOverLimit && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300 font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
            <span>Exceeds Meta 500-char hard ceiling by {charCount - 500} characters.</span>
          </div>
        )}

        {/* Threads Actions Bar */}
        <div className="flex items-center gap-5 text-white/50 border-t border-white/[0.06] pt-3 text-xs">
          <button className="flex items-center gap-1.5 hover:text-coral-400 transition-colors">
            <Heart className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-violet-400 transition-colors">
            <MessageCircle className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-lime-400 transition-colors">
            <Repeat2 className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-cyan-400 transition-colors">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
