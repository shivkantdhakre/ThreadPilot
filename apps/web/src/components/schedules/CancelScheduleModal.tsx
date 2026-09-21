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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-500/20 text-rose-400">
              <Ban className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Cancel Schedule</h3>
              <p className="text-xs text-white/50">Stop automated publishing for this post</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          <p className="text-xs text-white/70 leading-relaxed">
            Are you sure you want to cancel this scheduled post for{' '}
            <strong className="text-white">
              @{scheduledPost.socialAccount?.username || 'account'}
            </strong>
            ? This will remove all pending delayed worker jobs from the queue.
          </p>

          <div className="rounded-xl border border-white/10 bg-black/40 p-3 text-xs italic text-white/80 line-clamp-3">
            "{scheduledPost.contentSnapshot?.body || 'No post content'}"
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
            >
              Keep Scheduled
            </button>
            <button
              type="button"
              onClick={handleConfirmCancel}
              disabled={isSubmitting}
              className="rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500 disabled:opacity-50 transition-colors flex items-center gap-2"
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
