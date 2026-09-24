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
    color: 'from-coral-500/15 to-coral-500/5 text-coral-400 border-coral-500/30 hover:border-coral-500/60',
  },
  {
    id: 'make_concise',
    label: 'Maximize Punch',
    description: 'Trim excess words & maximize cadence',
    icon: Minimize2,
    color: 'from-cyan-500/15 to-cyan-500/5 text-cyan-300 border-cyan-500/30 hover:border-cyan-500/60',
  },
  {
    id: 'make_personal',
    label: 'Authentic Voice',
    description: 'Add personalized founder narrative inflection',
    icon: UserCheck,
    color: 'from-violet-500/15 to-violet-500/5 text-violet-300 border-violet-500/30 hover:border-violet-500/60',
  },
  {
    id: 'remove_fluff',
    label: 'De-Jargonize',
    description: 'Strip buzzwords and generic corporate filler',
    icon: Scissors,
    color: 'from-lime-500/15 to-lime-500/5 text-lime-400 border-lime-500/30 hover:border-lime-500/60',
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
    <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 shadow-card-elevated backdrop-blur-xl">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-coral-400" />
          <h3 className="text-sm font-bold text-white tracking-tight font-display">
            AI Voice Refiner
          </h3>
        </div>
        <span className="badge-coral text-[10px]">
          Personal Vector Active
        </span>
      </div>

      {/* Progress Box (when active) */}
      {isRunning && (
        <div className="mb-5 rounded-2xl border border-coral-500/30 bg-coral-500/10 p-4 animate-fade-in">
          <div className="flex items-center justify-between mb-2 text-xs">
            <span className="font-semibold text-coral-200 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-coral-400" />
              {progressMessage || 'Refining content according to voice model...'}
            </span>
            <span className="font-mono text-coral-300 font-bold">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950">
            <div
              className="h-full bg-gradient-to-r from-coral-500 to-electric-orange transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="mb-5 flex items-center gap-2 rounded-2xl border border-lime-500/30 bg-lime-500/10 p-3.5 text-xs text-lime-300 font-medium animate-fade-in">
          <CheckCircle2 className="h-4 w-4 text-lime-400 shrink-0" />
          <span>New revision generated and archived in Version History!</span>
        </div>
      )}

      {isFailed && (
        <div className="mb-5 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs text-rose-300 font-medium">
          {error || 'Improvement failed. Please try again.'}
        </div>
      )}

      {/* Quick Presets */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {PRESETS.map((preset) => {
          const Icon = preset.icon;
          return (
            <button
              key={preset.id}
              onClick={() => handleTrigger(preset.id)}
              disabled={disabled || isRunning || isSubmitting}
              className={`flex flex-col items-start rounded-2xl border bg-gradient-to-br p-3.5 text-left transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none ${preset.color}`}
            >
              <div className="flex items-center gap-2 font-bold text-xs mb-1">
                <Icon className="h-3.5 w-3.5" />
                {preset.label}
              </div>
              <span className="text-[11px] text-white/55 leading-tight">
                {preset.description}
              </span>
            </button>
          );
        })}
      </div>

      {/* Custom Instruction Form */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-white/70">Custom Editing Direction</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={customInstruction}
            onChange={(e) => setCustomInstruction(e.target.value)}
            placeholder="e.g. 'Format this as a 3-bullet insight with sharp punchline'..."
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
            className="btn-primary whitespace-nowrap px-4 text-xs font-semibold"
          >
            {isSubmitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Refine'}
          </button>
        </div>
      </div>
    </div>
  );
}
