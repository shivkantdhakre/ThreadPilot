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
      }, 1200);
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
      setSuccessMsg('Successfully verified on Meta! Post marked PUBLISHED.');
      onResolved?.(res);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Resolution failed';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-violet-500/40 bg-[#111116] shadow-card-elevated">
        {/* Header with Beacon Alert */}
        <div className="flex items-center justify-between border-b border-white/[0.08] px-6 py-5 bg-gradient-to-r from-violet-950/40 via-[#111116] to-coral-950/20">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500/20 border border-violet-500/30 text-violet-400">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-white tracking-tight font-display">Operator Resolution</h3>
                <span className="badge-violet text-[10px]">
                  RECOVERY REQUIRED
                </span>
              </div>
              <p className="text-xs text-white/50">
                Network ambiguity detected during publish commit. Safe operator attestation required.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-2 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Diagnostic Context Pill */}
        <div className="px-6 pt-5">
          <div className="rounded-2xl border border-white/[0.07] bg-ink-950 p-4 space-y-2 text-xs">
            <div className="flex items-center justify-between text-white/50">
              <span className="font-semibold text-white/70">Target Account: @{scheduledPost.socialAccount?.username || 'unknown'}</span>
              <span className="font-mono text-[11px]">Container ID: {scheduledPost.containerId || 'None'}</span>
            </div>
            <p className="text-white/80 line-clamp-2 italic font-mono bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.04]">
              "{postText}"
            </p>
            {scheduledPost.lastErrorMsg && (
              <div className="text-[11px] text-rose-300 font-mono truncate">
                Diagnostic: {scheduledPost.lastErrorMsg}
              </div>
            )}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/[0.08] px-6 mt-4 gap-6 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setActiveTab('NOT_PUBLISHED');
              setErrorMsg(null);
            }}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'NOT_PUBLISHED'
                ? 'border-coral-500 text-coral-400'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            Path A: Confirm NOT Published
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('PUBLISHED');
              setErrorMsg(null);
            }}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === 'PUBLISHED'
                ? 'border-violet-500 text-violet-400'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            Path B: Link Published Post ID
          </button>
        </div>

        {/* Form Content */}
        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 font-medium">
              <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="mb-4 flex items-center gap-3 rounded-2xl border border-lime-500/30 bg-lime-500/10 p-3.5 text-xs text-lime-300 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-400" />
              <div>{successMsg}</div>
            </div>
          )}

          {activeTab === 'NOT_PUBLISHED' ? (
            <form onSubmit={handleSubmitNotPublished} className="space-y-4">
              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3.5 text-xs text-amber-300 leading-relaxed font-medium">
                Use this path if you checked{' '}
                <span className="font-bold text-white">
                  @{scheduledPost.socialAccount?.username}
                </span>{' '}
                on Threads and verified that this post did <strong>not</strong> go live. The system
                will run an automated platform check against the container and safely cancel the post.
              </div>

              <label className="flex items-start gap-3 cursor-pointer p-3 rounded-xl border border-white/[0.05] hover:bg-white/[0.02] transition-colors">
                <input
                  type="checkbox"
                  checked={confirmUnpublished}
                  onChange={(e) => setConfirmUnpublished(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-black/40 text-coral-500 focus:ring-coral-500"
                />
                <span className="text-xs text-white/90 leading-normal">
                  I certify under operator audit that I inspected the Threads profile and this post was <strong>not</strong> published to the audience.
                </span>
              </label>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  Audit Notes / Reason (Optional)
                </label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Profile inspected at 14:05 UTC; no post present."
                  className="input-base text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !confirmUnpublished}
                  className="rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 px-4 py-2 text-xs font-semibold text-white hover:from-amber-500 hover:to-rose-500 disabled:opacity-40 transition-all flex items-center gap-2 shadow-lg shadow-rose-900/20"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Verifying & Cancelling...</span>
                    </>
                  ) : (
                    <span>Confirm Post NOT Published</span>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSubmitPublished} className="space-y-4">
              <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3.5 text-xs text-violet-300 leading-relaxed font-medium">
                Use this path if the post <strong>did</strong> successfully publish to Threads. Enter
                the post ID from the Threads URL or Meta dashboard. The backend will verify post
                ownership and timestamp window before linking it as <strong>PUBLISHED</strong>.
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-white/60 mb-1.5">
                  Meta Threads Post ID
                </label>
                <input
                  type="text"
                  value={threadsPostId}
                  onChange={(e) => setThreadsPostId(e.target.value)}
                  placeholder="e.g. 18023456789012345"
                  className="input-base text-sm font-mono"
                />
                <span className="block mt-1 text-[11px] text-white/40">
                  Found in Threads post link: threads.net/@username/post/<strong>[ID]</strong>
                </span>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary text-xs py-2 px-4"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !threadsPostId.trim()}
                  className="btn-violet text-xs py-2 px-4 flex items-center gap-2"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Verifying on Threads...</span>
                    </>
                  ) : (
                    <span>Verify & Link Post</span>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
