'use client';

import React, { useState } from 'react';
import {
  Sparkles,
  Zap,
  Minimize2,
  UserCheck,
  Scissors,
  Loader2,
  CheckCircle2,
  FileCheck,
  Send,
  Maximize2,
  PenTool,
} from 'lucide-react';
import { useJobProgress } from '../../hooks/useJobProgress';

interface AIImprovementPanelProps {
  onImprove: (instruction: string) => Promise<string>; // returns requestId
  onJobComplete?: () => void;
  disabled?: boolean;
}

const PRESETS = [
  {
    id: 'improve_hook',
    label: 'Improve Hook',
    description: 'Punchier first line that commands attention in feed',
    instruction: 'Strengthen the hook: make the opening sentence irresistible, punchy, and under 14 words.',
    icon: Zap,
    color: 'border-coral-200 bg-coral-50/60 hover:border-coral-400 text-coral-700',
  },
  {
    id: 'make_concise',
    label: 'Make Concise',
    description: 'Cut filler words & sharpen rhythm',
    instruction: 'Make this post concise and eliminate filler words while keeping the core thesis strong.',
    icon: Minimize2,
    color: 'border-cyan-200 bg-cyan-50/60 hover:border-cyan-400 text-cyan-800',
  },
  {
    id: 'personal_voice',
    label: 'Personal Voice',
    description: 'Infuse unique tone & founder cadence',
    instruction: 'Infuse authentic personal voice and founder tone matching my style profile.',
    icon: UserCheck,
    color: 'border-violet-200 bg-violet-50/60 hover:border-violet-400 text-violet-700',
  },
  {
    id: 'de_jargonize',
    label: 'De-Jargonize',
    description: 'Replace buzzwords with plain clarity',
    instruction: 'De-jargonize: strip buzzwords and explain concepts in clear, direct English.',
    icon: Scissors,
    color: 'border-lime-200 bg-lime-50/60 hover:border-lime-400 text-lime-800',
  },
  {
    id: 'add_specificity',
    label: 'Add Specificity',
    description: 'Ground claims in concrete details',
    instruction: 'Add concrete details, practical steps, or vivid specificity to the core argument.',
    icon: PenTool,
    color: 'border-canvas-border bg-soft-gray/80 hover:border-canvas-border-muted text-text-primary',
  },
  {
    id: 'generate_variation',
    label: 'Variation',
    description: 'Alternative creative angle for same idea',
    instruction: 'Generate an alternative variation of this post exploring a different angle or contrast.',
    icon: Maximize2,
    color: 'border-canvas-border bg-soft-gray/80 hover:border-canvas-border-muted text-text-primary',
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
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onJobComplete]);

  return (
    <div className="card-paper p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-600">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary font-display">
              Contextual AI Actions
            </h3>
            <p className="text-[11px] text-text-muted">Apply instant refinements matching your style profile</p>
          </div>
        </div>
        <span className="badge-violet text-[10px]">
          Personal Vector Active
        </span>
      </div>

      {/* Progress Box (when active) */}
      {isRunning && (
        <div className="rounded-xl border border-coral-200 bg-coral-50 p-4 animate-fade-in space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-coral-800 flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-coral-600" />
              {progressMessage || 'Synthesizing voice adjustments...'}
            </span>
            <span className="font-mono text-coral-700 font-bold">{progress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-coral-100">
            <div
              className="h-full bg-coral-500 transition-all duration-300 rounded-full"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="rounded-xl border border-lime-200 bg-lime-50 p-3 text-xs text-lime-800 flex items-center gap-2 font-medium">
          <CheckCircle2 className="h-4 w-4 text-lime-600 shrink-0" />
          <span>Post refined! New version added to revision timeline.</span>
        </div>
      )}

      {isFailed && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          Refinement job failed: {error || 'Unknown error occurred'}
        </div>
      )}

      {/* Quick Action Pills Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {PRESETS.map((p) => {
          const Icon = p.icon;
          return (
            <button
              key={p.id}
              type="button"
              disabled={disabled || isRunning || isSubmitting}
              onClick={() => handleTrigger(p.instruction)}
              className={`rounded-xl border p-2.5 text-left transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ${p.color}`}
            >
              <div className="flex items-center gap-1.5 mb-0.5">
                <Icon className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-bold truncate">{p.label}</span>
              </div>
              <p className="text-[10px] text-text-secondary line-clamp-1">
                {p.description}
              </p>
            </button>
          );
        })}
      </div>

      {/* Targeted Custom Directive */}
      <div className="pt-2 border-t border-canvas-border flex items-center gap-2">
        <input
          type="text"
          disabled={disabled || isRunning || isSubmitting}
          value={customInstruction}
          onChange={(e) => setCustomInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              handleTrigger(customInstruction);
              setCustomInstruction('');
            }
          }}
          placeholder="Or type a custom refinement (e.g. 'Make it more contrarian')..."
          className="input-base text-xs py-2"
        />
        <button
          type="button"
          disabled={disabled || isRunning || !customInstruction.trim()}
          onClick={() => {
            handleTrigger(customInstruction);
            setCustomInstruction('');
          }}
          className="btn-primary text-xs py-2 px-3 shrink-0"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export default AIImprovementPanel;
