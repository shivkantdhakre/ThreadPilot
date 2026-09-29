'use client';

import React, { useState } from 'react';
import {
  X,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  Loader2,
  ExternalLink,
} from 'lucide-react';
import { ReplyExecutionData } from './types';

interface OperatorResolveModalProps {
  isOpen: boolean;
  onClose: () => void;
  execution: ReplyExecutionData | null;
  interactionId: string | null;
  onResolve: (
    executionId: string,
    resolution: 'CONFIRMED_PUBLISHED' | 'CONFIRMED_NOT_PUBLISHED',
    externalPostId?: string,
    notes?: string
  ) => Promise<void>;
}

export function OperatorResolveModal({
  isOpen,
  onClose,
  execution,
  interactionId,
  onResolve,
}: OperatorResolveModalProps) {
  const [resolution, setResolution] = useState<'CONFIRMED_PUBLISHED' | 'CONFIRMED_NOT_PUBLISHED'>('CONFIRMED_PUBLISHED');
  const [externalPostId, setExternalPostId] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen || !execution) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onResolve(
        execution.id,
        resolution,
        externalPostId.trim() || undefined,
        notes.trim() || undefined
      );
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to submit operator resolution.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-canvas-border bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4 bg-paper/60">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">
                Resolve External Ambiguity
              </h3>
              <p className="text-[11px] text-text-muted">
                Durable CAS operator recovery protocol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs">
              {error}
            </div>
          )}

          {/* Diagnostic Context */}
          <div className="space-y-1.5 bg-soft-gray/60 p-3.5 rounded-xl border border-canvas-border text-[11px]">
            <div className="flex justify-between text-text-muted font-mono">
              <span>Execution ID:</span>
              <span className="text-text-primary truncate max-w-[200px]">{execution.id}</span>
            </div>
            <div className="flex justify-between text-text-muted font-mono">
              <span>Container ID:</span>
              <span className="text-text-primary">{execution.containerId || 'None'}</span>
            </div>
            <div className="flex justify-between text-text-muted font-mono">
              <span>Publish Attempts:</span>
              <span className="text-text-primary">{execution.publishAttemptCount}</span>
            </div>
            {execution.lastError && (
              <div className="pt-1 text-rose-700 font-mono text-[10px] break-words">
                Last Error: {execution.lastError}
              </div>
            )}
          </div>

          {/* Resolution Options */}
          <div className="space-y-2.5">
            <label className="font-bold text-text-primary block">
              Did the reply land on the external Threads profile?
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                resolution === 'CONFIRMED_PUBLISHED'
                  ? 'border-lime-500 bg-lime-50/50 shadow-sm'
                  : 'border-canvas-border hover:bg-paper'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                value="CONFIRMED_PUBLISHED"
                checked={resolution === 'CONFIRMED_PUBLISHED'}
                onChange={() => setResolution('CONFIRMED_PUBLISHED')}
                className="mt-0.5 text-lime-600 focus:ring-lime-500"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-lime-900 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-lime-600" />
                  Confirmed Published Externally
                </span>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  The reply is verified visible on Threads. Execution will advance to PUBLISHED and the
                  interaction will be marked REPLIED.
                </p>
              </div>
            </label>

            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                resolution === 'CONFIRMED_NOT_PUBLISHED'
                  ? 'border-amber-500 bg-amber-50/50 shadow-sm'
                  : 'border-canvas-border hover:bg-paper'
              }`}
            >
              <input
                type="radio"
                name="resolution"
                value="CONFIRMED_NOT_PUBLISHED"
                checked={resolution === 'CONFIRMED_NOT_PUBLISHED'}
                onChange={() => setResolution('CONFIRMED_NOT_PUBLISHED')}
                className="mt-0.5 text-amber-600 focus:ring-amber-500"
              />
              <div className="space-y-0.5">
                <span className="font-bold text-amber-900 flex items-center gap-1.5">
                  <XCircle className="h-4 w-4 text-amber-600" />
                  Confirmed NOT Published
                </span>
                <p className="text-[11px] text-text-muted leading-relaxed">
                  Verified that no reply appeared. If container exists, it safely schedules a re-dispatch
                  without creating duplicate containers.
                </p>
              </div>
            </label>
          </div>

          {/* Conditional External Post ID Input */}
          {resolution === 'CONFIRMED_PUBLISHED' && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-primary">
                External Threads Post ID (Optional)
              </label>
              <input
                type="text"
                value={externalPostId}
                onChange={(e) => setExternalPostId(e.target.value)}
                placeholder="e.g. 180294819401"
                className="input-base text-xs font-mono"
              />
            </div>
          )}

          {/* Operator Audit Notes */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-text-primary">
              Operator Audit Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Checked Threads profile via mobile app; confirmed post was visible."
              className="input-base text-xs resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-canvas-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary text-xs py-2 px-4 shadow-subtle flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Committing Resolution...</span>
                </>
              ) : (
                <span>Confirm & Advance</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
