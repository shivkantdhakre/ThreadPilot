'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Sparkles,
  Plus,
  Loader2,
  X,
  FileText,
  Clock,
  ArrowRight,
  Calendar,
  Layers,
  ChevronDown,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { DraftEditor, DraftDetail } from '../../../components/editor/DraftEditor';
import { apiClient } from '../../../lib/api-client';
import { useJobProgress } from '../../../hooks/useJobProgress';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

function CreatePageContent() {
  const searchParams = useSearchParams();
  const urlDraftId = searchParams.get('draftId');

  const [activeDraft, setActiveDraft] = useState<DraftDetail | null>(null);
  const [draftsList, setDraftsList] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showGenerateModal, setShowGenerateModal] = useState(false);

  // AI Generation form state
  const [genTopic, setGenTopic] = useState('');
  const [genFormat, setGenFormat] = useState('Insight / Take');
  const [genTone, setGenTone] = useState('Authentic / Founder');
  const [genContext, setGenContext] = useState('');
  const [genRequestId, setGenRequestId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const { progress, progressMessage, isRunning, isComplete, resultEntityId } =
    useJobProgress(genRequestId);

  const loadDrafts = async () => {
    try {
      const res = await apiClient.get<{ data: any[] }>('/content/drafts?limit=20');
      setDraftsList(res.data ?? []);
      if (urlDraftId) {
        const found = await apiClient.get<DraftDetail>(`/content/drafts/${urlDraftId}`);
        setActiveDraft(found);
      } else if (res.data?.[0] && !activeDraft) {
        const first = await apiClient.get<DraftDetail>(`/content/drafts/${res.data[0].id}`);
        setActiveDraft(first);
      }
    } catch (err) {
      console.error('Failed to load drafts', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDrafts();
  }, [urlDraftId]);

  // When AI generation job completes:
  useEffect(() => {
    if (isComplete && resultEntityId) {
      const timer = setTimeout(async () => {
        try {
          const fresh = await apiClient.get<DraftDetail>(`/content/drafts/${resultEntityId}`);
          setActiveDraft(fresh);
          setShowGenerateModal(false);
          setGenRequestId(null);
          loadDrafts();
        } catch (err) {
          console.error(err);
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isComplete, resultEntityId]);

  const handleStartGeneration = async () => {
    if (!genTopic.trim() || isGenerating || isRunning) return;
    try {
      setIsGenerating(true);
      const res = await apiClient.post<{ requestId: string }>('/content/generate', {
        topic: genTopic,
        format: genFormat,
        tone: genTone,
        additionalContext: genContext || undefined,
      });
      setGenRequestId(res.requestId);
    } catch (err) {
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectDraft = async (id: string) => {
    try {
      const draft = await apiClient.get<DraftDetail>(`/content/drafts/${id}`);
      setActiveDraft(draft);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Content Studio"
        subtitle="Compose and refine Threads content under platform bounds"
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Studio Actions Bar */}
        <div className="card-paper p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => {
                setActiveDraft(null);
              }}
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-2"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Blank Canvas</span>
            </button>

            <button
              onClick={() => setShowGenerateModal(true)}
              className="btn-primary text-xs py-2 px-4 flex items-center gap-2 shadow-subtle"
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Synthesize with AI</span>
            </button>

            <Link
              href="/schedules"
              className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-2"
            >
              <Calendar className="h-3.5 w-3.5 text-coral-600" />
              <span>Calendar</span>
            </Link>
          </div>

          {/* Quick Drafts Selector */}
          {draftsList.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <span className="font-semibold text-text-secondary">Saved drafts:</span>
              <select
                value={activeDraft?.id ?? ''}
                onChange={(e) => handleSelectDraft(e.target.value)}
                className="rounded-xl border border-canvas-border bg-white px-3 py-1.5 text-xs text-text-primary focus:outline-none focus:border-coral-500 max-w-[220px] truncate shadow-subtle"
              >
                <option value="" disabled>
                  Select a draft...
                </option>
                {draftsList.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.currentVersion?.hook || d.topic || 'Untitled Draft'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Draft Editor Interface */}
        <DraftEditor
          key={activeDraft?.id ?? 'new'}
          initialDraft={activeDraft}
          onSaved={(saved) => {
            setActiveDraft(saved);
            loadDrafts();
          }}
        />
      </div>

      {/* AI Generation Modal */}
      {showGenerateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-text-primary/40 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-canvas-border bg-white p-6 sm:p-7 shadow-dropdown">
            <div className="flex items-center justify-between border-b border-canvas-border pb-4 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-violet-50 border border-violet-200 text-violet-600">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                    Generate with Personal Voice
                  </h3>
                  <p className="text-xs text-text-muted">Calibrated to your calibrated 8-dimensional writing model</p>
                </div>
              </div>
              <button
                onClick={() => !isRunning && setShowGenerateModal(false)}
                disabled={isRunning}
                className="text-text-muted hover:text-text-primary disabled:opacity-30 p-1.5 rounded-lg hover:bg-soft-gray transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Progress Bar when generating */}
            {isRunning && (
              <div className="mb-5 rounded-xl border border-coral-200 bg-coral-50 p-4 animate-fade-in space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-coral-800 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-coral-600" />
                    {progressMessage || 'Synthesizing draft...'}
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

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1.5">
                  Core Topic or Provocation <span className="text-coral-600">*</span>
                </label>
                <input
                  type="text"
                  required
                  disabled={isRunning}
                  value={genTopic}
                  onChange={(e) => setGenTopic(e.target.value)}
                  placeholder="e.g. Why founders should build in public on Threads..."
                  className="input-base text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1.5">Format</label>
                  <select
                    value={genFormat}
                    disabled={isRunning}
                    onChange={(e) => setGenFormat(e.target.value)}
                    className="input-base text-xs"
                  >
                    <option>Insight / Take</option>
                    <option>Contrarian Perspective</option>
                    <option>Discussion Starter / Question</option>
                    <option>Lessons / Mini-breakdown</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text-primary mb-1.5">Tone</label>
                  <select
                    value={genTone}
                    disabled={isRunning}
                    onChange={(e) => setGenTone(e.target.value)}
                    className="input-base text-xs"
                  >
                    <option>Authentic / Founder</option>
                    <option>Analytical & Concise</option>
                    <option>Casual & Playful</option>
                    <option>Direct & Opinionated</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text-primary mb-1.5">
                  Additional Context (optional)
                </label>
                <textarea
                  rows={3}
                  disabled={isRunning}
                  value={genContext}
                  onChange={(e) => setGenContext(e.target.value)}
                  placeholder="Any specific data point, nuance, or personal anecdote to integrate..."
                  className="input-base text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-canvas-border">
                <button
                  type="button"
                  disabled={isRunning}
                  onClick={() => setShowGenerateModal(false)}
                  className="btn-ghost text-xs py-2 px-4"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!genTopic.trim() || isRunning || isGenerating}
                  onClick={handleStartGeneration}
                  className="btn-primary text-xs py-2.5 px-5 flex items-center gap-2 shadow-subtle"
                >
                  {isRunning || isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>Generate Draft</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CreatePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-warm-white">
          <ThreadPilotLoader message="Opening Content Studio..." />
        </div>
      }
    >
      <CreatePageContent />
    </Suspense>
  );
}
