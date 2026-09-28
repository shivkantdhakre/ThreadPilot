'use client';

import React from 'react';
import { LucideIcon, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: string;
  changeType?: 'positive' | 'negative' | 'neutral';
  meta?: string;
  icon?: LucideIcon;
  accent?: 'coral' | 'violet' | 'cyan' | 'lime' | 'neutral';
}

export function MetricCard({
  label,
  value,
  change,
  changeType = 'positive',
  meta,
  icon: Icon,
  accent = 'neutral',
}: MetricCardProps) {
  const accentIconStyles = {
    coral: 'border-coral-200 bg-coral-50 text-coral-600',
    violet: 'border-violet-200 bg-violet-50 text-violet-600',
    cyan: 'border-cyan-200 bg-cyan-50 text-cyan-700',
    lime: 'border-lime-200 bg-lime-50 text-lime-700',
    neutral: 'border-canvas-border bg-soft-gray text-text-muted',
  }[accent];

  const changeStyles = {
    positive: 'text-lime-700 bg-lime-50 border-lime-200',
    negative: 'text-rose-700 bg-rose-50 border-rose-200',
    neutral: 'text-text-muted bg-soft-gray border-canvas-border',
  }[changeType];

  const ChangeIcon = {
    positive: ArrowUpRight,
    negative: ArrowDownRight,
    neutral: Minus,
  }[changeType];

  return (
    <div className="card-base flex flex-col justify-between p-5 hover:border-canvas-border-muted transition-all">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        {Icon && (
          <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${accentIconStyles}`}>
            <Icon className="h-4 w-4" />
          </div>
        )}
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <div className="text-2xl font-bold tracking-tight text-text-primary font-display">
          {value}
        </div>

        {change && (
          <div className={`inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${changeStyles}`}>
            <ChangeIcon className="h-3 w-3" />
            <span>{change}</span>
          </div>
        )}
      </div>

      {meta && (
        <div className="text-[11px] text-text-muted mt-2 font-mono truncate">
          {meta}
        </div>
      )}
    </div>
  );
}

export default MetricCard;
