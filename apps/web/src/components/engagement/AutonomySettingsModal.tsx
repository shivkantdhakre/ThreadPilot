'use client';

import React, { useState } from 'react';
import {
  X,
  Zap,
  Sparkles,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Check,
} from 'lucide-react';
import { AutonomyMode } from './types';

interface AutonomySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentMode: AutonomyMode;
  killSwitchActive: boolean;
  onSavePreferences: (mode: AutonomyMode, killSwitch: boolean) => Promise<void>;
}

export function AutonomySettingsModal({
  isOpen,
  onClose,
  currentMode,
  killSwitchActive,
  onSavePreferences,
}: AutonomySettingsModalProps) {
  const [selectedMode, setSelectedMode] = useState<AutonomyMode>(currentMode);
  const [killSwitch, setKillSwitch] = useState<boolean>(killSwitchActive);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSavePreferences(selectedMode, killSwitch);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update autonomy settings');
    } finally {
      setIsSaving(false);
    }
  };

  const modes: Array<{
    mode: AutonomyMode;
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    accentColor: string;
  }> = [
    {
      mode: 'RULES_BASED',
      label: 'Autonomous Rules Engine',
      description:
        'High-confidence comments auto-publish upon passing both Stage 1 pre-policy and Stage 2 grounding gates.',
      icon: Zap,
      accentColor: 'text-lime-700 bg-lime-50 border-lime-200',
    },
    {
      mode: 'SHADOW',
      label: 'Shadow Mode (Recommended for testing)',
      description:
        'Executes full AI classification, drafting, and grounding checks without publishing anything to Threads.',
      icon: Sparkles,
      accentColor: 'text-violet-700 bg-violet-50 border-violet-200',
    },
    {
      mode: 'REVIEW_ONLY',
      label: 'Review Queue Only (Default)',
      description:
        'AI prepares candidate reply drafts in the inbox. Every single reply requires human 1-click approval.',
      icon: ShieldCheck,
      accentColor: 'text-coral-700 bg-coral-50 border-coral-200',
    },
    {
      mode: 'OFF',
      label: 'Engagement Off',
      description:
        'Inbound comments are ingested and classified, but no drafts or automatic replies are created.',
      icon: X,
      accentColor: 'text-text-muted bg-soft-gray border-canvas-border',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-canvas-border bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-canvas-border px-6 py-4 bg-paper/60">
          <div>
            <h3 className="text-sm font-bold text-text-primary">
              Autonomy & Policy Controls
            </h3>
            <p className="text-[11px] text-text-muted">
              Configure automated reply gating and safety kill switches
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 text-xs">
          {error && (
            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50 text-rose-800 text-xs">
              {error}
            </div>
          )}

          {/* Autonomy Mode Selector */}
          <div className="space-y-2.5">
            <label className="font-bold text-text-primary block">
              Engagement Operational Mode
            </label>
            <div className="space-y-2">
              {modes.map((item) => {
                const isSelected = selectedMode === item.mode;
                const Icon = item.icon;
                return (
                  <button
                    key={item.mode}
                    type="button"
                    onClick={() => setSelectedMode(item.mode)}
                    className={`w-full p-3.5 rounded-xl border text-left flex items-start gap-3 transition-all ${
                      isSelected
                        ? 'border-coral-500 bg-coral-50/30 shadow-subtle ring-1 ring-coral-500/20'
                        : 'border-canvas-border hover:bg-paper'
                    }`}
                  >
                    <div className={`p-1.5 rounded-lg border shrink-0 mt-0.5 ${item.accentColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-text-primary">{item.label}</span>
                        {isSelected && <Check className="h-4 w-4 text-coral-600" />}
                      </div>
                      <p className="text-[11px] text-text-muted leading-relaxed">
                        {item.description}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Kill Switch Toggle */}
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-900 font-bold">
                <ShieldAlert className="h-4 w-4 text-rose-600" />
                <span>Emergency Replies Kill Switch</span>
              </div>
              <input
                type="checkbox"
                checked={killSwitch}
                onChange={(e) => setKillSwitch(e.target.checked)}
                className="h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
            </div>
            <p className="text-[11px] text-rose-800 leading-relaxed">
              When enabled, all autonomous outbound publishing is halted immediately. In-flight jobs
              transition safely to CANCELLED_BY_POLICY and require manual review.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-canvas-border">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="btn-secondary text-xs py-2 px-3.5"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary text-xs py-2 px-4 shadow-subtle flex items-center gap-1.5"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Configuration</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
