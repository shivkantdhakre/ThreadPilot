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
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { DraftEditor, DraftDetail } from '../../../components/editor/DraftEditor';
import { apiClient } from '../../../lib/api-client';
import { useJobProgress } from '../../../hooks/useJobProgress';

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
    <div>
      <TopBar title="Content Studio" />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Studio Actions Bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setActiveDraft(null);
              }}
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Blank Draft</span>
            </button>

            <button
              onClick={() => setShowGenerateModal(true)}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-2"
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
              <span>Generate with Personal AI</span>
            </button>

            <Link
              href="/schedules"
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 hover:text-white flex items-center gap-2 transition-colors"
            >
              <Calendar className="h-3.5 w-3.5 text-brand-400" />
              <span>Publishing Calendar</span>
            </Link>
          </div>

          {/* Quick Drafts Selector */}
          {draftsList.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-white/50">
              <span>Saved drafts:</span>
              <select
                value={activeDraft?.id ?? ''}
                onChange={(e) => handleSelectDraft(e.target.value)}
                className="rounded-lg border border-white/10 bg-slate-900 px-2.5 py-1.5 text-xs text-white focus:outline-none"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-brand-400" />
                <h3 className="text-base font-bold text-white tracking-tight">
                  Generate Post with Authentic Voice
                </h3>
              </div>
              <button
                onClick={() => !isRunning && setShowGenerateModal(false)}
                disabled={isRunning}
                className="text-white/40 hover:text-white disabled:opacity-30"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Live Progress Bar when generating */}
            {isRunning && (
              <div className="mb-5 rounded-xl border border-brand-500/30 bg-brand-500/10 p-4 animate-fade-in">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-semibold text-brand-200 flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-400" />
                    {progressMessage || 'Synthesizing draft...'}
                  </span>
                  <span className="font-mono text-brand-300">{progress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-950/80">
                  <div
                    className="h-full bg-gradient-to-r from-brand-500 to-indigo-400 transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Core Topic or Thought <span className="text-rose-400">*</span>
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
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Format</label>
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
                  <label className="block text-xs font-medium text-white/70 mb-1.5">Tone</label>
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
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Additional Context (optional)
                </label>
                <textarea
                  rows={3}
                  disabled={isRunning}
                  value={genContext}
                  onChange={(e) => setGenContext(e.target.value)}
                  placeholder="Any specific nuance, data point, or story to include..."
                  className="input-base text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
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
                  className="btn-primary text-xs py-2 px-4 flex items-center gap-2"
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
        <div className="flex min-h-screen items-center justify-center bg-slate-950">
          <Loader2 className="h-8 w-8 animate-spin text-brand-400" />
        </div>
      }
    >
      <CreatePageContent />
    </Suspense>
  );
}

