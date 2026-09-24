'use client';

import React, { useState } from 'react';
import { Sparkles, RefreshCw, Layers, CheckCircle, Clock, AlertCircle, Info } from 'lucide-react';
import { StyleFeatures } from '@threadpilot/types';
import { useJobProgress } from '../../hooks/useJobProgress';

interface VoiceStyleCardProps {
  features: StyleFeatures | null;
  profileVersion: number;
  lastTrainedAt: string | null;
  onRetrain: () => Promise<string>; // returns requestId
  onRetrainComplete?: () => void;
  hasIngestedPosts?: boolean;   // Whether the user has ingested Threads posts
  hasSocialAccount?: boolean;   // Whether the user has a connected Threads account
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
      color: 'bg-gradient-to-r from-coral-500 to-electric-orange',
    },
    {
      label: 'Avg Sentence Length',
      value: features ? `${Math.round(features.avgSentenceLengthWords)} words` : '—',
      percentage: features ? Math.min(100, Math.round((features.avgSentenceLengthWords / 25) * 100)) : 0,
      color: 'bg-pacific-cyan',
    },
    {
      label: 'Question Frequency',
      value: features ? `${Math.round(features.questionFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.questionFrequency * 100) : 0,
      color: 'bg-amber-400',
    },
    {
      label: 'Emoji Frequency',
      value: features ? `${Math.round(features.emojiFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.emojiFrequency * 100) : 0,
      color: 'bg-violet-400',
    },
    {
      label: 'First-Person Voice',
      value: features ? `${Math.round(features.firstPersonFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.firstPersonFrequency * 100) : 0,
      color: 'bg-violet-500',
    },
    {
      label: 'Technical Vocab Score',
      value: features ? `${Math.round(features.technicalVocabScore * 100)}%` : '—',
      percentage: features ? Math.round(features.technicalVocabScore * 100) : 0,
      color: 'bg-lime-400',
    },
    {
      label: 'Contrarian Hook Rate',
      value: features ? `${Math.round(features.contraryHookFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.contraryHookFrequency * 100) : 0,
      color: 'bg-coral-400',
    },
    {
      label: 'Whitespace / Lists',
      value: features ? `${Math.round(features.listUsageFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.listUsageFrequency * 100) : 0,
      color: 'bg-cyan-400',
    },
  ];

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-7 backdrop-blur-xl shadow-card-elevated">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2.5 mb-1.5">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight font-display">
              Personal Voice & Stylistic Fingerprint
            </h2>
            <span className="badge-violet text-xs font-mono font-bold">
              v{profileVersion}
            </span>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-1.5 font-mono">
            <Clock className="h-3.5 w-3.5" />
            Last extracted: {lastTrainedAt ? new Date(lastTrainedAt).toLocaleDateString() : 'Never'}
          </p>
        </div>

        <button
          onClick={handleRetrainClick}
          disabled={isTriggering || isRunning}
          className="btn-primary text-xs py-2.5 px-4 shadow-glow disabled:opacity-50 flex items-center gap-2"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Analyzing Posts...' : 'Re-train Voice Profile'}
        </button>
      </div>

      {/* Progress alert when running */}
      {isRunning && (
        <div className="mb-6 rounded-2xl border border-coral-500/30 bg-coral-500/10 p-4 animate-fade-in">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-coral-200">
              {progressMessage || 'Extracting stylistic markers...'}
            </span>
            <span className="font-mono text-coral-300 font-bold">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-ink-950">
            <div
              className="h-full bg-gradient-to-r from-coral-500 via-coral-400 to-cyan-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="mb-6 flex items-center gap-2 rounded-2xl border border-lime-500/30 bg-lime-500/10 p-3.5 text-xs text-lime-300 font-medium">
          <CheckCircle className="h-4 w-4 text-lime-400" />
          <span>Voice profile successfully re-trained and updated!</span>
        </div>
      )}

      {/* Show job failure */}
      {isFailed && !isRunning && (
        <div className="mb-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-rose-300 mb-1">Style extraction failed</p>
              <p className="text-xs text-rose-400/90 leading-relaxed">
                {error?.includes('No posts found') || error?.includes('No ThreadPost')
                  ? 'No Threads posts found to analyze. Please run Post Ingestion first from the Accounts page to import your historical posts.'
                  : error?.includes('RESOURCE_EXHAUSTED') || error?.includes('429') || error?.includes('quota')
                  ? 'AI API quota limit reached. Please wait a few minutes before trying again, or check your Gemini API plan.'
                  : error?.includes('404') || error?.includes('NOT_FOUND')
                  ? 'AI model not available. Please check your GEMINI_MODEL_CONTENT environment variable.'
                  : error
                  ? error.replace(/^\{.*\}$/, 'An unexpected error occurred during style extraction.')
                  : 'An error occurred during style extraction. Please try again.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Show trigger-level error (e.g. no connected account) */}
      {triggerError && (
        <div className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-bold text-amber-300 mb-1">Could not start re-training</p>
              <p className="text-xs text-amber-400/90 leading-relaxed">
                {triggerError.includes('No active connected')
                  ? 'No connected Threads account found. Please connect your Threads account from the Accounts page first.'
                  : triggerError}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Pre-flight warnings */}
      {!hasSocialAccount && !isRunning && !isFailed && !triggerError && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5 text-xs text-amber-300/80">
          <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <span>Connect your Threads account first to enable voice profile training.</span>
        </div>
      )}
      {hasSocialAccount && !hasIngestedPosts && !isRunning && !isFailed && !triggerError && (
        <div className="mb-6 flex items-start gap-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3.5 text-xs text-violet-300/90">
          <Info className="h-4 w-4 text-violet-400 mt-0.5 shrink-0" />
          <span>No posts imported yet. Run <strong>Post Ingestion</strong> from the Accounts page to import your Threads history before training your voice profile.</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-2xl border border-white/[0.06] bg-ink-900/80 p-4 transition-colors hover:border-white/15"
          >
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="text-white/60 font-medium">{m.label}</span>
              <span className="text-white font-bold font-mono text-xs">{m.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-950">
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
