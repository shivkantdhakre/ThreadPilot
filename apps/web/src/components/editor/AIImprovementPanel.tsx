'use client';

import React, { useState } from 'react';
import { Sparkles, Zap, Minimize2, UserCheck, Scissors, Loader2, CheckCircle2 } from 'lucide-react';
import { useJobProgress } from '../../hooks/useJobProgress';

interface AIImprovementPanelProps {
  onImprove: (instruction: string) => Promise<string>; // returns requestId
  onJobComplete?: () => void;
  disabled?: boolean;
}

const PRESETS = [
  {
    id: 'improve_hook',
    label: 'Strengthen Hook',
    description: 'Punchier opening line that stops the feed',
    icon: Zap,
    color: 'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
  },
  {
    id: 'make_concise',
    label: 'Make Concise',
    description: 'Trim excess words & maximize punch',
    icon: Minimize2,
    color: 'from-blue-500/20 to-indigo-500/20 text-blue-300 border-blue-500/30',
  },
  {
    id: 'make_personal',
    label: 'Make More Personal',
    description: 'Add authentic founder narrative voice',
    icon: UserCheck,
    color: 'from-purple-500/20 to-pink-500/20 text-purple-300 border-purple-500/30',
  },
  {
    id: 'remove_fluff',
    label: 'Remove Fluff',
    description: 'Strip corporate jargon and filler words',
    icon: Scissors,
    color: 'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
  },
];

export function AIImprovementPanel({
  onImprove,
  onJobComplete,
  disabled = false,
}: AIImprovementPanelProps) {
  const [activeRequestId, setActiveRequestId] = useState<string | null>(null);
  const [customInstruction, setCustomInstruction] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { progress, progressMessage, isRunning, isComplete, isFailed, error } =
    useJobProgress(activeRequestId);

  const handleTrigger = async (instruction: string) => {
    if (!instruction.trim() || isSubmitting || isRunning) return;

    try {
      setIsSubmitting(true);
      const reqId = await onImprove(instruction);
      setActiveRequestId(reqId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  React.useEffect(() => {
    if (isComplete && onJobComplete) {
      const timer = setTimeout(() => {
        onJobComplete();
        setActiveRequestId(null);
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onJobComplete]);

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-5 backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-brand-400" />
          <h3 className="text-sm font-semibold text-white tracking-tight">
            AI Voice Refiner
          </h3>
        </div>
        <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300 border border-brand-500/20">
          Personalized
        </span>
      </div>

      {/* Progress Box (when active) */}
      {isRunning && (
        <div className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-medium text-brand-300 flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
              {progressMessage || 'Refining content...'}
            </span>
            <span className="font-mono text-brand-200">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/60">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="mb-5 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300 animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>New version saved successfully!</span>
        </div>
      )}

      {isFailed && (
        <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
          {error || 'Improvement failed. Please try again.'}
        </div>
      )}

      {/* Quick Presets */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              onClick={() => handleTrigger(preset.id)}
              disabled={disabled || isRunning || isSubmitting}
              className={`flex flex-col items-start rounded-xl border bg-gradient-to-br p-3 text-left transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none ${preset.color}`}
            >
              <div className="flex items-center gap-1.5 font-semibold text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                {preset.label}
              </div>
              <span className="text-[10px] text-white/50 leading-tight">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Instruction Form */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-white/70">Custom Editing Direction</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="e.g. 'Turn this into an intriguing question hook'..."
            disabled={disabled || isRunning || isSubmitting}
            className="input-base text-xs"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customInstruction.trim()) {
                handleTrigger(customInstruction);
              }
            }}
          />
          <button
            onClick={() => handleTrigger(customInstruction)}
            disabled={disabled || !customInstruction.trim() || isRunning || isSubmitting}
            className="btn-primary whitespace-nowrap px-3 text-xs"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refine'}
          </button>
        </div>
      </div>
    </div>
  );
}
