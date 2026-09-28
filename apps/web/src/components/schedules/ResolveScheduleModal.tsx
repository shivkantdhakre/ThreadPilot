'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  X,
  Loader2,
  ShieldCheck,
  ExternalLink,
  Info,
  HelpCircle,
  RotateCw,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';

interface ResolveScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  scheduledPost: {
    id: string;
    containerId?: string | null | undefined;
    status: string;
    scheduledAt: string;
    lastErrorMsg?: string | null | undefined;
    lastErrorCode?: string | null | undefined;
    socialAccount?: {
      username: string;
    } | undefined;
    contentSnapshot?: {
      body?: string | undefined;
    } | undefined;
  } | null;
  onResolved?: ((result: any) => void) | undefined;
}

export function ResolveScheduleModal({
  isOpen,
  onClose,
  scheduledPost,
  onResolved,
}: ResolveScheduleModalProps) {
  const [activeTab, setActiveTab] = useState<'NOT_PUBLISHED' | 'PUBLISHED'>('NOT_PUBLISHED');
  const [confirmUnpublished, setConfirmUnpublished] = useState(false);
  const [reason, setReason] = useState('');
  const [threadsPostId, setThreadsPostId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen || !scheduledPost) return null;

  const postText = scheduledPost.contentSnapshot?.body || '';

  const handleSubmitNotPublished = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!confirmUnpublished) {
      setErrorMsg('You must certify that you manually verified the post was not published.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/content/schedules/${scheduledPost.id}/resolve`, {
        action: 'CONFIRM_NOT_PUBLISHED',
        confirmUnpublished: true,
        reason: reason.trim() || 'Manual inspection by operator',
      });
      setSuccessMsg('Successfully confirmed as not published. Post marked CANCELLED.');
      onResolved?.(res);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Resolution failed';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitPublished = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const cleanId = threadsPostId.trim();
    if (!cleanId) {
      setErrorMsg('Please provide the authoritative Meta Threads Post ID.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiClient.post(`/content/schedules/${scheduledPost.id}/resolve`, {
        action: 'CONFIRM_PUBLISHED',
        threadsPostId: cleanId,
      });
      setSuccessMsg('Successfully confirmed as published. Post updated to PUBLISHED.');
      onResolved?.(res);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Resolution failed';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-canvas-border bg-white shadow-dropdown">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4 bg-paper/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 border border-violet-200 text-violet-700">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight font-display">
                Operator Reconciliation
              </h3>
              <p className="text-xs text-text-muted">Resolving publish ambiguity in compliance with Meta guidelines</p>
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
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-lime-200 bg-lime-50 p-3 text-xs text-lime-800 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-600" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Context box */}
          <div className="rounded-xl border border-canvas-border bg-paper/60 p-4 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-secondary">Post Context</span>
              <span className="font-mono text-[11px] text-text-muted">
                Target: @{scheduledPost.socialAccount?.username || 'account'}
              </span>
            </div>
            <p className="text-xs text-text-primary italic line-clamp-2">
              "{postText || 'Empty body'}"
            </p>
            {scheduledPost.lastErrorMsg && (
              <div className="text-[11px] text-rose-700 pt-1 border-t border-canvas-border">
                Last error: {scheduledPost.lastErrorMsg}
              </div>
            )}
          </div>

          {/* Resolution Mode Switcher */}
          <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-soft-gray border border-canvas-border">
            <button
              type="button"
              onClick={() => setActiveTab('NOT_PUBLISHED')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'NOT_PUBLISHED'
                  ? 'bg-white text-text-primary shadow-subtle'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Confirm Not Published
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('PUBLISHED')}
              className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'PUBLISHED'
                  ? 'bg-white text-text-primary shadow-subtle'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Confirm Published
            </button>
          </div>

          {activeTab === 'NOT_PUBLISHED' ? (
            <form onSubmit={handleSubmitNotPublished} className="space-y-4">
              <div className="rounded-xl border border-canvas-border bg-white p-4 space-y-3">
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={confirmUnpublished}
                    onChange={(e) => setConfirmUnpublished(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-canvas-border text-coral-600 focus:ring-coral-500"
                  />
                  <div className="text-xs text-text-secondary leading-relaxed">
                    <span className="font-bold text-text-primary">I certify:</span> I checked the live Threads profile for{' '}
                    <strong className="text-text-primary">@{scheduledPost.socialAccount?.username}</strong> and this post does NOT exist on the platform.
                  </div>
                </label>

                <div>
                  <label className="block text-xs font-semibold text-text-muted mb-1">
                    Audit Note / Reason
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="e.g. Verified profile via app, no post created"
                    className="input-base text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-canvas-border">
                <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-3.5">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !confirmUnpublished}
                  className="btn-primary text-xs py-2 px-4 shadow-subtle disabled:opacity-50"
                >
                  {isSubmitting ? 'Resolving...' : 'Confirm Not Published'}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitPublished} className="space-y-4">
              <div className="rounded-xl border border-canvas-border bg-white p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1">
                    Meta Threads Post ID <span className="text-coral-600">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={threadsPostId}
                    onChange={(e) => setThreadsPostId(e.target.value)}
                    placeholder="e.g. 18012345678901234"
                    className="input-base text-xs font-mono"
                  />
                  <p className="text-[11px] text-text-muted mt-1">
                    Locate this ID from the published post URL or Threads API response.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-canvas-border">
                <button type="button" onClick={onClose} className="btn-secondary text-xs py-2 px-3.5">
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !threadsPostId.trim()}
                  className="btn-violet text-xs py-2 px-4 shadow-subtle disabled:opacity-50"
                >
                  {isSubmitting ? 'Resolving...' : 'Confirm Published'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default ResolveScheduleModal;
