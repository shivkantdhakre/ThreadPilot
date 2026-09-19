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
      color: 'bg-brand-500',
    },
    {
      label: 'Avg Sentence Length',
      value: features ? `${Math.round(features.avgSentenceLengthWords)} words` : '—',
      percentage: features ? Math.min(100, Math.round((features.avgSentenceLengthWords / 25) * 100)) : 0,
      color: 'bg-cyan-500',
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
      color: 'bg-pink-500',
    },
    {
      label: 'First-Person Voice',
      value: features ? `${Math.round(features.firstPersonFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.firstPersonFrequency * 100) : 0,
      color: 'bg-indigo-500',
    },
    {
      label: 'Technical Vocab Score',
      value: features ? `${Math.round(features.technicalVocabScore * 100)}%` : '—',
      percentage: features ? Math.round(features.technicalVocabScore * 100) : 0,
      color: 'bg-emerald-500',
    },
    {
      label: 'Contrary Hook Frequency',
      value: features ? `${Math.round(features.contraryHookFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.contraryHookFrequency * 100) : 0,
      color: 'bg-purple-500',
    },
    {
      label: 'List/Bullet Usage',
      value: features ? `${Math.round(features.listUsageFrequency * 100)}%` : '—',
      percentage: features ? Math.round(features.listUsageFrequency * 100) : 0,
      color: 'bg-rose-500',
    },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-brand-400" />
            <h2 className="text-base font-bold text-white tracking-tight">
              Personal Voice & Style Fingerprint
            </h2>
            <span className="rounded-md bg-brand-500/10 px-2 py-0.5 text-xs font-semibold text-brand-300 border border-brand-500/20">
              v{profileVersion}
            </span>
          </div>
          <p className="text-xs text-white/50 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            Last extracted: {lastTrainedAt ? new Date(lastTrainedAt).toLocaleDateString() : 'Never'}
          </p>
        </div>

        <button
          onClick={handleRetrainClick}
          disabled={isTriggering || isRunning}
          className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
          {isRunning ? 'Analyzing Posts...' : 'Re-train Voice Profile'}
        </button>
      </div>

      {/* Progress alert when running */}
      {isRunning && (
        <div className="mb-6 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 animate-fade-in">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="font-semibold text-brand-200">
              {progressMessage || 'Analyzing style...'}
            </span>
            <span className="font-mono text-brand-300">{progress}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/80">
            <div
              className="h-full bg-gradient-to-r from-brand-500 to-cyan-400 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {isComplete && (
        <div className="mb-6 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span>Voice profile successfully re-trained and updated!</span>
        </div>
      )}

      {/* Show job failure */}
      {isFailed && !isRunning && (
        <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-rose-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-rose-300 mb-1">Style extraction failed</p>
              <p className="text-xs text-rose-400/80">
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
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-300 mb-1">Could not start re-training</p>
              <p className="text-xs text-amber-400/80">
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
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-300/80">
          <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
          <span>Connect your Threads account first to enable voice profile training.</span>
        </div>
      )}
      {hasSocialAccount && !hasIngestedPosts && !isRunning && !isFailed && !triggerError && (
        <div className="mb-6 flex items-start gap-2 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-xs text-indigo-300/80">
          <Info className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
          <span>No posts imported yet. Run <strong>Post Ingestion</strong> from the Accounts page to import your Threads history before training your voice profile.</span>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-white/10 hover:bg-white/[0.04]"
          >
            <div className="flex items-center justify-between text-xs mb-1.5">
              <span className="text-white/60 font-medium">{m.label}</span>
              <span className="text-white font-bold font-mono">{m.value}</span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
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
