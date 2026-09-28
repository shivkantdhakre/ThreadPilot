'use client';

import React from 'react';
import Link from 'next/link';
import { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  actionIcon?: LucideIcon;
  accent?: 'coral' | 'violet' | 'cyan' | 'lime' | 'neutral';
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
  };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  actionIcon: ActionIcon,
  accent = 'coral',
  secondaryAction,
}: EmptyStateProps) {
  const iconAccentStyles = {
    coral: 'border-coral-200 bg-coral-50 text-coral-600',
    violet: 'border-violet-200 bg-violet-50 text-violet-600',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    lime: 'border-lime-200 bg-lime-50 text-lime-700',
    neutral: 'border-canvas-border bg-soft-gray text-text-muted',
  }[accent];

  return (
    <div className="rounded-2xl border border-dashed border-canvas-border bg-white p-8 sm:p-12 text-center transition-all">
      {/* Editorial Trajectory Symbol Container */}
      <div className="relative mx-auto mb-4 flex h-12 w-12 items-center justify-center">
        {/* Subtle decorative thread path behind icon */}
        <svg
          className="absolute inset-0 -top-2 -left-2 h-16 w-16 text-canvas-border"
          viewBox="0 0 64 64"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M8 48C18 48 24 16 40 16C52 16 56 36 60 44"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="3 3"
          />
        </svg>

        <div className={`relative z-10 flex h-11 w-11 items-center justify-center rounded-xl border shadow-subtle ${iconAccentStyles}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>

      <h3 className="text-sm sm:text-base font-bold text-text-primary tracking-tight font-display mb-1.5">
        {title}
      </h3>
      <p className="text-xs sm:text-sm text-text-secondary max-w-md mx-auto leading-relaxed mb-6 font-normal">
        {description}
      </p>

      {(actionLabel || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actionLabel && actionHref && (
            <Link
              href={actionHref as any}
              className="btn-primary text-xs py-2 px-4 shadow-subtle"
            >
              {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
              <span>{actionLabel}</span>
            </Link>
          )}

          {actionLabel && onAction && !actionHref && (
            <button
              onClick={onAction}
              className="btn-primary text-xs py-2 px-4 shadow-subtle"
            >
              {ActionIcon && <ActionIcon className="h-3.5 w-3.5" />}
              <span>{actionLabel}</span>
            </button>
          )}

          {secondaryAction && secondaryAction.href && (
            <Link
              href={secondaryAction.href as any}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              {secondaryAction.label}
            </Link>
          )}

          {secondaryAction && secondaryAction.onClick && !secondaryAction.href && (
            <button
              onClick={secondaryAction.onClick}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              {secondaryAction.label}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default EmptyState;
