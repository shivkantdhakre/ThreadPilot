'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Share2,
  X,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { canonicalOutboundText } from '@threadpilot/types';
import { localDateTimeToUtc } from '../../lib/schedule-utils';

interface SocialAccount {
  id: string;
  username: string;
  displayName?: string | null;
  profileUrl?: string | null;
}

interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  draftId: string;
  draftTopic?: string | null | undefined;
  draftBody: string;
  draftStatus?: string | undefined;
  initialDate?: Date | undefined;
  onScheduled?: ((post: any) => void) | undefined;
}

export function ScheduleModal({
  isOpen,
  onClose,
  draftId,
  draftTopic,
  draftBody,
  draftStatus = 'READY',
  initialDate,
  onScheduled,
}: ScheduleModalProps) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [scheduledDateTime, setScheduledDateTime] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('UTC');
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Initialize defaults on open
  useEffect(() => {
    if (!isOpen) {
      setErrorMsg(null);
      setSuccessMsg(null);
      return;
    }

    // Default timezone
    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setTimezone(userTz);
    } catch {
      setTimezone('UTC');
    }

    // Default datetime: If initialDate clicked, avoid 00:00:00 midnight past-time trip
    const now = new Date();
    let baseDate: Date;
    if (initialDate) {
      baseDate = new Date(initialDate);
      const isToday =
        baseDate.getFullYear() === now.getFullYear() &&
        baseDate.getMonth() === now.getMonth() &&
        baseDate.getDate() === now.getDate();
      if (isToday) {
        // Default to 1 hour from now, rounded to the next 15-min mark
        const futureMs = now.getTime() + 60 * 60 * 1000;
        baseDate = new Date(Math.ceil(futureMs / (15 * 60 * 1000)) * (15 * 60 * 1000));
      } else {
        // If clicking a future day on the calendar, default to 10:00 AM
        baseDate.setHours(10, 0, 0, 0);
      }
    } else {
      // Default datetime: Tomorrow at 10:00 AM
      baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      baseDate.setHours(10, 0, 0, 0);
    }
    // Format for datetime-local input: YYYY-MM-DDTHH:mm
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const hours = String(baseDate.getHours()).padStart(2, '0');
    const minutes = String(baseDate.getMinutes()).padStart(2, '0');
    setScheduledDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);

    // Load accounts
    async function fetchAccounts() {
      setIsLoadingAccounts(true);
      try {
        const res = await apiClient.get<{ accounts?: any[] }>('/threads-auth/status');
        const activeAccounts = res.accounts || [];
        setAccounts(activeAccounts);
        if (activeAccounts.length > 0) {
          setSelectedAccountId(activeAccounts[0].id);
        }
      } catch (err: any) {
        console.error('Failed to load social accounts', err);
        setErrorMsg('Could not fetch connected Threads accounts.');
      } finally {
        setIsLoadingAccounts(false);
      }
    }
    fetchAccounts();
  }, [isOpen, initialDate]);

  if (!isOpen) return null;

  const canonicalBody = canonicalOutboundText(draftBody);
  const charCount = canonicalBody.length;

  const handleApplyPreset = (minutesFromNow: number, targetHour?: number) => {
    const target = new Date(Date.now() + minutesFromNow * 60 * 1000);
    if (targetHour !== undefined) {
      target.setHours(targetHour, 0, 0, 0);
    }
    const year = target.getFullYear();
    const month = String(target.getMonth() + 1).padStart(2, '0');
    const day = String(target.getDate()).padStart(2, '0');
    const hours = String(target.getHours()).padStart(2, '0');
    const mins = String(target.getMinutes()).padStart(2, '0');
    setScheduledDateTime(`${year}-${month}-${day}T${hours}:${mins}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedAccountId) {
      setErrorMsg('Please select a connected Threads account.');
      return;
    }
    if (!scheduledDateTime) {
      setErrorMsg('Please select a scheduled date and time.');
      return;
    }

    const scheduledIso = localDateTimeToUtc(scheduledDateTime, timezone);
    const targetDate = new Date(scheduledIso);
    if (isNaN(targetDate.getTime())) {
      setErrorMsg('Invalid date/time selected.');
      return;
    }
    if (targetDate.getTime() <= Date.now() + 60 * 1000) {
      setErrorMsg('Scheduled time must be at least 1 minute in the future.');
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. If draft is currently 'DRAFT', promote it to 'READY' so scheduling passes validation
      if (draftStatus === 'DRAFT') {
        await apiClient.patch(`/content/drafts/${draftId}`, { status: 'READY' });
      }

      // 2. Submit Schedule with explicit ISO UTC timestamp representing the target wall-clock time
      const scheduledPost = await apiClient.post(`/content/drafts/${draftId}/schedule`, {
        scheduledAt: scheduledIso,
        timezone,
        socialAccountId: selectedAccountId,
      });

      setSuccessMsg('Draft scheduled successfully! Background pipeline active.');
      onScheduled?.(scheduledPost);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Failed to schedule draft';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4 bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 shadow-md shadow-brand-500/20">
              <Calendar className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Schedule Post</h3>
              <p className="text-xs text-white/50">
                {draftTopic ? `Topic: ${draftTopic}` : 'Queue post for automated publishing'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-white/40 hover:bg-white/5 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs text-emerald-300">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Social Account Selector */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
              Target Threads Account
            </label>
            {isLoadingAccounts ? (
              <div className="flex items-center gap-2 text-xs text-white/40 py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
                <span>Loading accounts...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-300 flex items-center justify-between">
                <span>No connected Threads account found.</span>
                <a href="/connect" className="underline font-semibold hover:text-white">
                  Connect now &rarr;
                </a>
              </div>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id} className="bg-slate-900 text-white">
                    @{acc.username} {acc.displayName ? `(${acc.displayName})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date & Time Picker */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-white/60 mb-2">
              Publication Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledDateTime}
              onChange={(e) => setScheduledDateTime(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2.5 text-sm text-white focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />

            {/* Presets */}
            <div className="flex flex-wrap gap-2 mt-2.5">
              <button
                type="button"
                onClick={() => handleApplyPreset(60)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                +1 Hour
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(24 * 60, 9)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                Tomorrow 9:00 AM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(24 * 60, 18)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                Tomorrow 6:00 PM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(48 * 60, 10)}
                className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1 text-xs text-white/70 hover:bg-white/[0.08] hover:text-white transition-colors"
              >
                In 2 Days
              </button>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-white/60">
                Timezone
              </label>
              <span className="text-[11px] text-brand-300 font-mono">IANA Standard</span>
            </div>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York or Asia/Kolkata"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white/80 focus:border-brand-500 focus:outline-none"
            />
          </div>

          {/* Canonical Outbound Text Preview */}
          <div className="rounded-xl border border-white/10 bg-black/50 p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white/60">Outbound Post Preview</span>
              <span
                className={`font-mono text-[11px] ${
                  charCount > 500 ? 'text-rose-400 font-bold' : 'text-white/40'
                }`}
              >
                {charCount}/500 chars
              </span>
            </div>
            <p className="text-xs text-white/90 leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">
              {canonicalBody || '(No post body content)'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-medium text-white hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || accounts.length === 0 || !canonicalBody}
              className="btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-lg shadow-brand-500/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Enqueuing...</span>
                </>
              ) : (
                <>
                  <Calendar className="h-3.5 w-3.5" />
                  <span>Confirm Schedule</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
