'use client';

import React from 'react';
import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal } from 'lucide-react';

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
    <div className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-xl">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
          Threads Live Preview
        </span>
        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-mono font-medium ${
              isOverLimit
                ? 'text-rose-400 font-bold'
                : isNearLimit
                ? 'text-amber-400'
                : 'text-white/50'
            }`}
          >
            {charCount}/500 chars
          </span>
        </div>
      </div>

      {/* Threads Post Container */}
      <div className="rounded-xl border border-white/5 bg-black/60 p-4 transition-all">
        {/* Header: User avatar + handles */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 via-purple-500 to-indigo-500 font-bold text-white shadow-md text-sm">
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
          <button className="text-white/30 hover:text-white/60">
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Post Text */}
        <div className="my-4 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
          {body.trim() ? (
            body
          ) : (
            <span className="italic text-white/30">
              Start typing or generate content with AI to preview your Threads post...
            </span>
          )}
        </div>

        {/* Threads Actions Bar */}
        <div className="flex items-center gap-4 text-white/60 border-t border-white/5 pt-3">
          <button className="flex items-center gap-1.5 hover:text-pink-400 transition-colors">
            <Heart className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-indigo-400 transition-colors">
            <MessageCircle className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1.5 hover:text-emerald-400 transition-colors">
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
