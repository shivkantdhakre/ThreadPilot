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

    try {
      const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
      setTimezone(userTz);
    } catch {
      setTimezone('UTC');
    }

    const now = new Date();
    let baseDate: Date;
    if (initialDate) {
      baseDate = new Date(initialDate);
      const isToday =
        baseDate.getFullYear() === now.getFullYear() &&
        baseDate.getMonth() === now.getMonth() &&
        baseDate.getDate() === now.getDate();
      if (isToday) {
        const futureMs = now.getTime() + 60 * 60 * 1000;
        baseDate = new Date(Math.ceil(futureMs / (15 * 60 * 1000)) * (15 * 60 * 1000));
      } else {
        baseDate.setHours(10, 0, 0, 0);
      }
    } else {
      baseDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      baseDate.setHours(10, 0, 0, 0);
    }
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    const day = String(baseDate.getDate()).padStart(2, '0');
    const hours = String(baseDate.getHours()).padStart(2, '0');
    const minutes = String(baseDate.getMinutes()).padStart(2, '0');
    setScheduledDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);

    async function fetchAccounts() {
      setIsLoadingAccounts(true);
      try {
        const res = await apiClient.get<SocialAccount[]>('/social-accounts');
        const active = (res || []).filter((a: any) => a.isConnected !== false);
        setAccounts(active);
        const first = active[0];
        if (first && !selectedAccountId) {
          setSelectedAccountId(first.id);
        }
      } catch (err) {
        console.error('Failed to load accounts', err);
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
    const d = new Date();
    if (targetHour !== undefined) {
      d.setDate(d.getDate() + Math.floor(minutesFromNow / (24 * 60)));
      d.setHours(targetHour, 0, 0, 0);
    } else {
      d.setTime(d.getTime() + minutesFromNow * 60 * 1000);
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    setScheduledDateTime(`${year}-${month}-${day}T${hours}:${minutes}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!selectedAccountId) {
      setErrorMsg('Please select a target Threads profile.');
      return;
    }

    if (!scheduledDateTime) {
      setErrorMsg('Please select a valid scheduled date and time.');
      return;
    }

    let utcIsoString: string;
    try {
      utcIsoString = localDateTimeToUtc(scheduledDateTime, timezone);
    } catch {
      setErrorMsg(`Invalid timezone '${timezone}'. Please verify format.`);
      return;
    }

    const targetTime = new Date(utcIsoString).getTime();
    const nowTime = Date.now();
    if (targetTime <= nowTime + 60 * 1000) {
      setErrorMsg('Scheduled time must be at least 1 minute into the future.');
      return;
    }

    if (charCount > 500) {
      setErrorMsg(`Post length (${charCount} chars) exceeds Meta 500-char maximum.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const idempotencyKey = `sched_${draftId}_${Date.now()}`;
      const res = await apiClient.post(`/content/drafts/${draftId}/schedule`, {
        socialAccountId: selectedAccountId,
        scheduledAt: utcIsoString,
        timezone,
        idempotencyKey,
      });

      setSuccessMsg('Successfully enqueued for autonomous dispatch!');
      onScheduled?.(res);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      const msg = err.message || err.response?.data?.message || 'Failed to schedule post';
      setErrorMsg(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-text-primary/40 backdrop-blur-sm animate-fade-in">
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-canvas-border bg-white shadow-dropdown">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4 bg-paper/60">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-50 border border-coral-200 text-coral-600">
              <Calendar className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary tracking-tight font-display">
                Schedule for Threads
              </h3>
              <p className="text-xs text-text-muted">Targeted autonomous dispatch to Meta Graph API</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl p-1.5 text-text-muted hover:bg-soft-gray hover:text-text-primary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 font-medium">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 mt-0.5" />
              <div className="flex-1">{errorMsg}</div>
            </div>
          )}

          {successMsg && (
            <div className="flex items-center gap-2.5 rounded-xl border border-lime-200 bg-lime-50 p-3 text-xs text-lime-800 font-medium">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-lime-600" />
              <div>{successMsg}</div>
            </div>
          )}

          {/* Target Profile */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Target Threads Account
            </label>
            {isLoadingAccounts ? (
              <div className="flex items-center gap-2 text-xs text-text-muted py-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-coral-500" />
                <span>Loading accounts...</span>
              </div>
            ) : accounts.length === 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 flex items-center justify-between">
                <span>No connected Threads account found.</span>
                <a href="/connect" className="underline font-bold hover:text-text-primary">
                  Connect now &rarr;
                </a>
              </div>
            ) : (
              <select
                value={selectedAccountId}
                onChange={(e) => setSelectedAccountId(e.target.value)}
                className="input-base text-xs"
              >
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    @{acc.username} {acc.displayName ? `(${acc.displayName})` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Date & Time Picker */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-text-muted mb-1.5">
              Publication Date & Time
            </label>
            <input
              type="datetime-local"
              value={scheduledDateTime}
              onChange={(e) => setScheduledDateTime(e.target.value)}
              className="input-base text-xs font-mono"
            />

            {/* Presets */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              <button
                type="button"
                onClick={() => handleApplyPreset(60)}
                className="rounded-lg border border-canvas-border bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              >
                +1 Hour
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(24 * 60, 9)}
                className="rounded-lg border border-canvas-border bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              >
                Tomorrow 9:00 AM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(24 * 60, 18)}
                className="rounded-lg border border-canvas-border bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              >
                Tomorrow 6:00 PM
              </button>
              <button
                type="button"
                onClick={() => handleApplyPreset(48 * 60, 10)}
                className="rounded-lg border border-canvas-border bg-white px-2.5 py-1 text-xs font-semibold text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              >
                In 2 Days
              </button>
            </div>
          </div>

          {/* Timezone */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-text-muted">
                Timezone
              </label>
              <span className="badge-neutral text-[10px] font-mono">IANA Standard</span>
            </div>
            <input
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. America/New_York or Asia/Kolkata"
              className="input-base text-xs font-mono"
            />
          </div>

          {/* Outbound Text Preview */}
          <div className="rounded-xl border border-canvas-border bg-paper/60 p-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-secondary">Outbound Post Preview</span>
              <span
                className={`font-mono text-[11px] font-bold ${
                  charCount > 500 ? 'text-rose-600' : 'text-text-muted'
                }`}
              >
                {charCount} / 500 chars
              </span>
            </div>
            <p className="text-xs text-text-primary leading-relaxed font-sans line-clamp-3 whitespace-pre-wrap">
              {canonicalBody || '(No post body content)'}
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-canvas-border">
            <button
              type="button"
              onClick={onClose}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || accounts.length === 0 || !canonicalBody}
              className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-subtle disabled:opacity-50"
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

export default ScheduleModal;
