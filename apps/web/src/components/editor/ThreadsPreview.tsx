'use client';

import React, { useState } from 'react';
import { Heart, MessageCircle, Repeat2, Send, MoreHorizontal, AlertTriangle, Moon, Sun } from 'lucide-react';

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
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const charCount = body.length;
  const isOverLimit = charCount > 500;
  const isNearLimit = charCount >= 450 && !isOverLimit;

  return (
    <div className="card-base p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
            Threads Live Simulation
          </span>
          <span className="badge-neutral text-[9px] py-0.5">Meta API Sandbox</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPreviewTheme(previewTheme === 'light' ? 'dark' : 'light')}
            className="p-1 rounded-lg border border-canvas-border text-text-muted hover:text-text-primary transition-colors text-[10px] inline-flex items-center gap-1"
            title="Toggle preview theme"
          >
            {previewTheme === 'light' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
            <span className="hidden sm:inline font-mono">{previewTheme === 'light' ? 'Dark' : 'Light'}</span>
          </button>

          <span
            className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border transition-all ${
              isOverLimit
                ? 'border-rose-200 bg-rose-50 text-rose-700'
                : isNearLimit
                ? 'border-amber-200 bg-amber-50 text-amber-800'
                : 'border-canvas-border bg-soft-gray text-text-secondary'
            }`}
          >
            {charCount} / 500
          </span>
        </div>
      </div>

      {/* Threads Native Post Simulation Container */}
      <div
        className={`rounded-2xl border p-5 transition-all shadow-subtle ${
          previewTheme === 'light'
            ? 'border-canvas-border bg-white text-[#101010]'
            : 'border-neutral-800 bg-[#101010] text-white'
        }`}
      >
        {/* Author Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-coral-500 via-lava-orange to-electric-orange font-bold text-white shadow-sm text-sm shrink-0">
              {displayName.slice(0, 1).toUpperCase()}
            </div>
            <div className="truncate">
              <div className="flex items-center gap-1.5">
                <span className="text-sm font-bold tracking-tight truncate">{username}</span>
                <span className={`text-[11px] font-normal ${previewTheme === 'light' ? 'text-text-muted' : 'text-neutral-500'}`}>
                  • now
                </span>
              </div>
              <div className={`text-xs truncate ${previewTheme === 'light' ? 'text-text-muted' : 'text-neutral-400'}`}>
                {displayName}
              </div>
            </div>
          </div>
          <button className={`p-1 transition-colors ${previewTheme === 'light' ? 'text-text-muted hover:text-text-primary' : 'text-neutral-500 hover:text-white'}`}>
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>

        {/* Post Text */}
        <div className="my-3.5 whitespace-pre-wrap text-sm leading-relaxed font-sans">
          {body.trim() ? (
            body
          ) : (
            <span className={`italic font-normal ${previewTheme === 'light' ? 'text-text-muted/60' : 'text-neutral-500'}`}>
              Type your thoughts or generate a draft to preview authentic Threads formatting...
            </span>
          )}
        </div>

        {/* Warning if over limit */}
        {isOverLimit && (
          <div className="mb-3.5 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-700 font-medium">
            <AlertTriangle className="h-4 w-4 text-rose-600 shrink-0" />
            <span>Exceeds Meta 500-char limit by {charCount - 500} characters.</span>
          </div>
        )}

        {/* Threads Actions Bar */}
        <div className={`flex items-center gap-5 border-t pt-3 text-xs ${previewTheme === 'light' ? 'border-canvas-border text-text-muted' : 'border-neutral-800 text-neutral-400'}`}>
          <button className="flex items-center gap-1 hover:text-coral-500 transition-colors">
            <Heart className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1 hover:text-violet-600 transition-colors">
            <MessageCircle className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1 hover:text-lime-600 transition-colors">
            <Repeat2 className="h-4 w-4" />
          </button>
          <button className="flex items-center gap-1 hover:text-cyan-600 transition-colors">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="text-[11px] text-text-muted flex items-center justify-between">
        <span>Constraint: Meta Threads Graph API v21.0</span>
        <span className="font-mono">Max 500 unicode glyphs</span>
      </div>
    </div>
  );
}

export default ThreadsPreview;
