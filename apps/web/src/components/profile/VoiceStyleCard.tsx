'use client';

import React, { useState } from 'react';
import { Sparkles, RefreshCw, CheckCircle, Clock, AlertCircle, Info } from 'lucide-react';
import { StyleFeatures } from '@threadpilot/types';
import { useJobProgress } from '../../hooks/useJobProgress';

interface VoiceStyleCardProps {
  features: StyleFeatures | null;
  profileVersion: number;
  lastTrainedAt: string | null;
  onRetrain: () => Promise<string>; // returns requestId
  onRetrainComplete?: () => void;
  hasIngestedPosts?: boolean;
  hasSocialAccount?: boolean;
}

export function VoiceStyleCard({
  features,
  profileVersion,
  lastTrainedAt,
  onRetrain,
  onRetrainComplete,
  hasIngestedPosts = true,
  hasSocialAccount = true,
}: VoiceStyleCardProps) {
  const [retrainRequestId, setRetrainRequestId] = useState<string | null>(null);
  const [isTriggering, setIsTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);

  const { progress, progressMessage, isRunning, isComplete, isFailed, error } =
    useJobProgress(retrainRequestId);

  const handleRetrainClick = async () => {
    if (isTriggering || isRunning) return;
    setTriggerError(null);
    try {
      setIsTriggering(true);
      const reqId = await onRetrain();
      setRetrainRequestId(reqId);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setTriggerError(msg);
      console.error('Re-train failed:', err);
    } finally {
      setIsTriggering(false);
    }
  };

  React.useEffect(() => {
    if (isComplete && onRetrainComplete) {
      const timer = setTimeout(() => {
        onRetrainComplete();
        setRetrainRequestId(null);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isComplete, onRetrainComplete]);

  const metrics = [
    {
      label: 'Avg Post Length',
      value: features ? `${Math.round(features.avgPostLengthChars)} chars` : '—',
      percentage: features ? Math.min(100, Math.round((features.avgPostLengthChars / 500) * 100)) : 0,
      color: 'bg-coral-500',
    },
    {
      label: 'Avg Sentence Length',
      value: features ? `${Math.round(features.avgSentenceLengthWords)} words` : '—',
      percentage: features ? Math.min(100, Math.round((features.avgSentenceLengthWords / 25) * 100)) : 0,
      color: 'bg-cyan-600',
    },
    {
      label: 'Question Frequency',
      value: features ? `${Math.round(features.questionFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.questionFrequency * 100) : 0,
      color: 'bg-amber-500',
    },
    {
      label: 'Emoji Frequency',
      value: features ? `${Math.round(features.emojiFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.emojiFrequency * 100) : 0,
      color: 'bg-violet-500',
    },
    {
      label: 'First-Person Voice',
      value: features ? `${Math.round(features.firstPersonFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.firstPersonFrequency * 100) : 0,
      color: 'bg-violet-600',
    },
    {
      label: 'Technical Vocab Score',
      value: features ? `${Math.round(features.technicalVocabScore * 100)}%` : '—',
      percentage: features ? Math.round(features.technicalVocabScore * 100) : 0,
      color: 'bg-lime-600',
    },
    {
      label: 'Contrarian Hook Rate',
      value: features ? `${Math.round(features.contraryHookFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.contraryHookFrequency * 100) : 0,
      color: 'bg-coral-600',
    },
    {
      label: 'Whitespace & Lists',
      value: features ? `${Math.round(features.listUsageFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.listUsageFrequency * 100) : 0,
      color: 'bg-cyan-500',
    },
  ];

  return (
    <div className="card-base p-6 sm:p-7 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-canvas-border pb-5">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-violet-50 border border-violet-200 text-violet-700">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
              Personal Voice & Stylistic Fingerprint
            </h2>
            <span className="badge-violet text-xs font-mono font-bold">
              v{profileVersion}
            </span>
          </div>
          <p className="text-xs text-text-muted flex items-center gap-1.5 font-mono">
            <Clock className="h-3.5 w-3.5" />
            Last extracted: {lastTrainedAt ? new Date(lastTrainedAt).toLocaleDateString() : 'Never'}
          </p>
        </div>

        <button
          onClick={handleRetrainClick}
          disabled={isTriggering || isRunning}
          className="btn-primary text-xs py-2 px-4 shadow-subtle disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Analyzing Posts...' : 'Re-train Voice Profile'}
        </button>
      </div>

      {/* Progress alert when running */}
      {isRunning && (
        <div className="rounded-xl border border-coral-200 bg-coral-50 p-4 animate-fade-in space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-coral-800">
              {progressMessage || 'Extracting stylistic markers...'}
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
        <div className="flex items-center gap-2 rounded-xl border border-lime-200 bg-lime-50 p-3 text-xs text-lime-800 font-medium">
          <CheckCircle className="h-4 w-4 text-lime-600" />
          <span>Voice profile successfully re-trained and updated!</span>
        </div>
      )}

      {/* Failure */}
      {isFailed && !isRunning && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-800 mb-0.5">Style extraction failed</p>
              <p className="text-xs text-rose-700 leading-relaxed">
                {error?.includes('No posts found') || error?.includes('No ThreadPost')
                  ? 'No Threads posts found to analyze. Please run Post Ingestion first from the Accounts page to import your historical posts.'
                  : error || 'An error occurred during style extraction. Please try again.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pre-flight warnings */}
      {!hasSocialAccount && !isRunning && !isFailed && !triggerError && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
          <span>Connect your Threads account first to enable voice profile training.</span>
        </div>
      )}
      {hasSocialAccount && !hasIngestedPosts && !isRunning && !isFailed && !triggerError && (
        <div className="flex items-start gap-2 rounded-xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-800">
          <Info className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
          <span>No posts imported yet. Run <strong>Post Ingestion</strong> from the Accounts page to import your Threads history before training your voice profile.</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-canvas-border bg-paper/60 p-4 transition-colors hover:border-canvas-border-muted"
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-text-secondary font-medium">{m.label}</span>
              <span className="text-text-primary font-bold font-mono text-xs">{m.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-soft-gray">
              <div
                className={`h-full ${m.color} transition-all duration-500 rounded-full`}
                style={{ width: `${m.percentage}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default VoiceStyleCard;
