'use client';

import React, { useState } from 'react';
import { X, Trash2, Loader2, AlertCircle } from 'lucide-react';

interface DismissModalProps {
  isOpen: boolean;
  onClose: () => void;
  interactionId: string;
  authorUsername: string;
  onDismiss: (interactionId: string, reason: string) => Promise<void>;
}

export function DismissModal({
  isOpen,
  onClose,
  interactionId,
  authorUsername,
  onDismiss,
}: DismissModalProps) {
  const [reason, setReason] = useState('No response needed');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const reasons = [
    'No response needed',
    'Trolling or toxic content',
    'Spam or irrelevant advertisement',
    'Outdated conversation',
    'Other',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const finalReason = reason === 'Other' ? customReason.trim() || 'Dismissed by operator' : reason;
      await onDismiss(interactionId, finalReason);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to dismiss interaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-canvas-border bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-canvas-border px-5 py-4 bg-paper/60">
          <div className="flex items-center gap-2 text-rose-700">
            <Trash2 className="h-4 w-4" />
            <h3 className="text-sm font-bold text-text-primary">Dismiss Inbound Interaction</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs">
              {error}
            </div>
          )}

          <p className="text-text-secondary leading-relaxed">
            Dismissing this interaction by <strong className="text-text-primary">@{authorUsername}</strong> will mark it as DISMISSED and remove it from your active review queue.
          </p>

          <div className="space-y-2">
            <label className="text-[11px] font-bold text-text-primary block">
              Reason for Dismissal
            </label>
            <div className="space-y-1.5">
              {reasons.map((r) => (
                <label
                  key={r}
                  className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all ${
                    reason === r ? 'border-coral-500 bg-coral-50/30 font-semibold' : 'border-canvas-border hover:bg-paper'
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r}
                    checked={reason === r}
                    onChange={() => setReason(r)}
                    className="text-coral-600 focus:ring-coral-500"
                  />
                  <span className="text-text-primary">{r}</span>
                </label>
              ))}
            </div>
          </div>

          {reason === 'Other' && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-text-primary">
                Specific Reason
              </label>
              <input
                type="text"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Brief reason for audit log..."
                className="input-base text-xs"
              />
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-canvas-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="btn-secondary text-xs py-2 px-3"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary bg-rose-600 hover:bg-rose-700 text-xs py-2 px-4 shadow-subtle flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Dismissing...</span>
                </>
              ) : (
                <span>Confirm Dismissal</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
