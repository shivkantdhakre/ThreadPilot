'use client';

import React, { useState } from 'react';
import { X, Sparkles, Loader2, Wand2 } from 'lucide-react';

interface RegenerateDraftModalProps {
  isOpen: boolean;
  onClose: () => void;
  interactionId: string;
  onRegenerate: (interactionId: string, preference: string) => Promise<void>;
}

export function RegenerateDraftModal({
  isOpen,
  onClose,
  interactionId,
  onRegenerate,
}: RegenerateDraftModalProps) {
  const [preference, setPreference] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const presets = [
    { label: 'Direct & Concise', text: 'Be direct, clear, and under 250 characters.' },
    { label: 'Engage with Question', text: 'Validate their point and ask a thoughtful follow-up question to invite further discussion.' },
    { label: 'Technical Depth', text: 'Provide architectural precision and reference specific technical trade-offs.' },
    { label: 'Warm & Encouraging', text: 'Express sincere appreciation and support their perspective.' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      await onRegenerate(interactionId, preference.trim());
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to trigger draft regeneration');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-canvas-border bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        <div className="flex items-center justify-between border-b border-canvas-border px-5 py-4 bg-paper/60">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-violet-100 text-violet-700">
              <Wand2 className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-text-primary">Regenerate Draft</h3>
              <p className="text-[11px] text-text-muted">
                Synthesize a new immutable draft version with AI
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs">
              {error}
            </div>
          )}

          {/* Quick presets */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Quick Tone Presets
            </span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => setPreference(p.text)}
                  className="rounded-lg border border-canvas-border bg-soft-gray/60 px-2.5 py-1 text-[11px] text-text-secondary hover:border-canvas-border-muted hover:bg-paper transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Guidance Input */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-bold text-text-primary">
              Custom Prompt Guidance (Optional)
            </label>
            <textarea
              rows={3}
              value={preference}
              onChange={(e) => setPreference(e.target.value)}
              placeholder="e.g. Focus on our upcoming v2 launch, maintain a humble builder voice..."
              className="input-base text-xs resize-none"
            />
          </div>

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
              className="btn-primary bg-violet-600 hover:bg-violet-700 text-xs py-2 px-4 shadow-subtle flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Generate New Version</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
