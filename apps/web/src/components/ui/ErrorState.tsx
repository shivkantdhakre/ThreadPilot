'use client';

import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  actionLabel?: string;
  className?: string;
}

export function ErrorState({
  title = 'Something needs attention',
  message,
  onRetry,
  actionLabel = 'Try Again',
  className = '',
}: ErrorStateProps) {
  return (
    <div className={`rounded-2xl border border-rose-200 bg-rose-50/50 p-6 text-center max-w-lg mx-auto ${className}`}>
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-600">
        <AlertCircle className="h-5 w-5" />
      </div>

      <h3 className="text-sm font-bold text-text-primary tracking-tight font-display mb-1">
        {title}
      </h3>
      <p className="text-xs text-text-secondary leading-relaxed mb-4">
        {message}
      </p>

      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-secondary text-xs py-1.5 px-3.5 inline-flex items-center gap-1.5"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>{actionLabel}</span>
        </button>
      )}
    </div>
  );
}

export default ErrorState;
