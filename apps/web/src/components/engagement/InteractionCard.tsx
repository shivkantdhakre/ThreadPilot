'use client';

import React from 'react';
import {
  HelpCircle,
  ThumbsUp,
  ThumbsDown,
  Heart,
  MessageSquare,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Sparkles,
  Zap,
} from 'lucide-react';
import { InteractionItem, InteractionIntent } from './types';

interface InteractionCardProps {
  interaction: InteractionItem;
  isSelected: boolean;
  onSelect: () => void;
}

export function InteractionCard({
  interaction,
  isSelected,
  onSelect,
}: InteractionCardProps) {
  const currentClassification = interaction.classifications?.[0];
  const intent = currentClassification?.intent || 'UNCLEAR';
  const priority = interaction.priorityScore ?? currentClassification?.priorityScore ?? 5;

  const currentPolicy = interaction.policyDecisions?.[0];
  const needsReviewReason = currentPolicy?.reasonCodes?.[0];

  const getIntentBadge = (intentType: InteractionIntent) => {
    switch (intentType) {
      case 'QUESTION':
        return (
          <span className="badge-violet text-[10px] py-0.5">
            <HelpCircle className="h-3 w-3" /> Question
          </span>
        );
      case 'AGREEMENT':
      case 'COMPLIMENT':
        return (
          <span className="badge-lime text-[10px] py-0.5">
            <ThumbsUp className="h-3 w-3" /> Agreement
          </span>
        );
      case 'DISAGREEMENT':
        return (
          <span className="badge-coral text-[10px] py-0.5">
            <ThumbsDown className="h-3 w-3" /> Disagreement
          </span>
        );
      case 'REQUEST':
        return (
          <span className="badge-cyan text-[10px] py-0.5">
            <MessageSquare className="h-3 w-3" /> Request
          </span>
        );
      case 'TROLLING':
      case 'SPAM':
        return (
          <span className="badge-coral text-[10px] py-0.5 bg-rose-50 text-rose-700 border-rose-200">
            <AlertTriangle className="h-3 w-3 text-rose-600" /> Toxic / Spam
          </span>
        );
      default:
        return (
          <span className="badge-neutral text-[10px] py-0.5">
            Engagement
          </span>
        );
    }
  };

  const getTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  };

  return (
    <button
      onClick={onSelect}
      className={`w-full p-4 text-left rounded-2xl transition-all duration-150 space-y-2.5 border ${
        isSelected
          ? 'bg-paper border-coral-500/50 shadow-card ring-1 ring-coral-500/20'
          : 'bg-white border-canvas-border hover:border-canvas-border-muted hover:bg-paper/50'
      }`}
    >
      {/* Header: Author + Priority + Timestamp */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 truncate">
          <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-[11px] font-bold text-white shrink-0 shadow-sm">
            {(interaction.authorDisplayNameSnapshot || interaction.authorUsernameSnapshot || '?')
              .slice(0, 1)
              .toUpperCase()}
          </div>
          <div className="truncate">
            <div className="text-xs font-bold text-text-primary truncate">
              {interaction.authorDisplayNameSnapshot || interaction.authorUsernameSnapshot}
            </div>
            <div className="text-[10px] text-text-muted truncate">
              @{interaction.authorUsernameSnapshot}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span
            className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
              priority >= 8
                ? 'bg-coral-100 text-coral-800'
                : priority >= 5
                ? 'bg-amber-100 text-amber-800'
                : 'bg-soft-gray text-text-muted'
            }`}
            title={`Priority Score: ${priority}/10`}
          >
            P{priority}
          </span>
          <span className="text-[10px] text-text-muted font-mono">
            {getTimeAgo(interaction.createdAt)}
          </span>
        </div>
      </div>

      {/* Comment Body Snippet */}
      <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed font-normal">
        "{interaction.content}"
      </p>

      {/* Footer Badges & Status */}
      <div className="flex items-center justify-between pt-1 gap-2">
        <div className="flex items-center gap-1.5 truncate">
          {getIntentBadge(intent)}

          {needsReviewReason && interaction.status === 'REVIEW_REQUIRED' && (
            <span className="text-[9px] font-medium text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded truncate max-w-[130px]">
              {needsReviewReason.replace(/_/g, ' ')}
            </span>
          )}
        </div>

        <div className="shrink-0 text-[11px]">
          {interaction.status === 'REPLIED' ? (
            <span className="text-lime-700 font-semibold flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Replied
            </span>
          ) : interaction.status === 'DISMISSED' ? (
            <span className="text-text-muted font-medium">Dismissed</span>
          ) : interaction.status === 'PUBLISHING' || interaction.status === 'APPROVED' ? (
            <span className="text-cyan-700 font-semibold flex items-center gap-1 animate-pulse">
              <Zap className="h-3.5 w-3.5" /> Publishing
            </span>
          ) : interaction.status === 'DRAFTING' ? (
            <span className="text-violet-700 font-medium flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5 animate-spin" /> Drafting
            </span>
          ) : (
            <span className="text-coral-600 font-medium flex items-center gap-1">
              <Clock className="h-3 w-3" /> Needs Review
            </span>
          )}
        </div>
      </div>
    </button>
  );
}
