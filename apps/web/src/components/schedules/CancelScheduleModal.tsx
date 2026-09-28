'use client';

import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, X, Loader2, Ban } from 'lucide-react';
import { apiClient } from '../../lib/api-client';

interface CancelScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledPost: {
    id: string;
    status: string;
    scheduledAt: string;
    socialAccount?: {
      username: string;
    };
    contentSnapshot?: {
      body?: string;
    };
  } | null;
  onCancelled?: ((scheduledPostId: string) => void) | undefined;
}

export function CancelScheduleModal({
  isOpen,
  onClose,
  scheduledPost,
  onCancelled,
}: CancelScheduleModalProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen || !scheduledPost) return null;

  const handleConfirmCancel = async () => {
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await apiClient.post(`/content/schedules/${scheduledPost.id}/cancel`);
      onCancelled?.(scheduledPost.id);
      onClose();
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Cancellation failed';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-canvas-border bg-white shadow-dropdown">
        <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4 bg-paper/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-50 border border-rose-200 text-rose-600">
              <Ban className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight font-display">Cancel Schedule</h3>
              <p className="text-xs text-text-muted">Stop automated publishing for this post</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-text-muted hover:bg-soft-gray hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          <p className="text-xs text-text-secondary leading-relaxed">
            Are you sure you want to cancel this scheduled post for{' '}
            <strong className="text-text-primary">
              @{scheduledPost.socialAccount?.username || 'account'}
            </strong>
            ? This will remove all pending delayed worker jobs from the queue.
          </p>

          <div className="rounded-xl border border-canvas-border bg-paper/60 p-3.5 text-xs italic text-text-primary line-clamp-3 font-sans">
            "{scheduledPost.contentSnapshot?.body || 'No post content'}"
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-canvas-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              Keep Scheduled
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition-all flex items-center gap-2 shadow-subtle"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Cancelling...</span>
                </>
              ) : (
                <span>Confirm Cancellation</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CancelScheduleModal;
