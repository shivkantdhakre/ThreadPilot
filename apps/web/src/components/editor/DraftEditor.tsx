'use client';

import React, { useState } from 'react';
import { Save, Sparkles, Loader2, Plus, ArrowLeft } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { ThreadsPreview } from './ThreadsPreview';
import { AIImprovementPanel } from './AIImprovementPanel';
import { VersionHistory, VersionItem } from './VersionHistory';

export interface DraftDetail {
  id: string;
  topic?: string | null;
  format?: string | null;
  status: string;
  versions: VersionItem[];
  currentVersion?: VersionItem | null;
}

interface DraftEditorProps {
  initialDraft?: DraftDetail | null;
  onSaved?: (draft: DraftDetail) => void;
  onBack?: () => void;
}

export function DraftEditor({ initialDraft, onSaved, onBack }: DraftEditorProps) {
  const [draft, setDraft] = useState<DraftDetail | null>(initialDraft ?? null);
  const [body, setBody] = useState(initialDraft?.currentVersion?.body ?? '');
  const [hook, setHook] = useState(initialDraft?.currentVersion?.hook ?? '');
  const [cta, setCta] = useState(initialDraft?.currentVersion?.cta ?? '');
  const [topic, setTopic] = useState(initialDraft?.topic ?? '');
  const [isSaving, setIsSaving] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialDraft?.currentVersion?.id ?? initialDraft?.versions[0]?.id ?? '',
  );

  // Auto-detect hook from first sentence if empty
  const detectedHook = hook || body.split(/[.\n?!]/)[0] || '';

  const handleSaveVersion = async () => {
    if (!body.trim()) return;
    setIsSaving(true);
    try {
      if (!draft) {
        // Create new draft
        const newDraft = await apiClient.post<DraftDetail>('/content/drafts', {
          body,
          hook: detectedHook,
          cta,
          topic,
        });
        setDraft(newDraft);
        onSaved?.(newDraft);
      } else {
        // Save new version to existing draft
        const newVer = await apiClient.post<VersionItem>(
          `/content/drafts/${draft.id}/versions`,
          {
            body,
            hook: detectedHook,
            cta,
          },
        );
        const updatedVersions = [newVer, ...draft.versions];
        const updatedDraft = {
          ...draft,
          versions: updatedVersions,
          currentVersion: newVer,
        };
        setDraft(updatedDraft);
        setSelectedVersionId(newVer.id);
        onSaved?.(updatedDraft);
      }
    } catch (err) {
      console.error('Failed to save draft version', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleImproveTrigger = async (instruction: string): Promise<string> => {
    if (!draft) {
      // First save draft if not yet persisted
      const newDraft = await apiClient.post<DraftDetail>('/content/drafts', {
        body,
        hook: detectedHook,
        cta,
        topic,
      });
      setDraft(newDraft);
      const res = await apiClient.post<{ requestId: string }>('/content/improve', {
        draftId: newDraft.id,
        versionId: newDraft.versions[0]?.id,
        instruction,
      });
      return res.requestId;
    }

    const res = await apiClient.post<{ requestId: string }>('/content/improve', {
      draftId: draft.id,
      versionId: selectedVersionId || draft.versions[0]?.id,
      instruction,
    });
    return res.requestId;
  };

  const handleJobComplete = async () => {
    if (!draft) return;
    try {
      const refreshed = await apiClient.get<DraftDetail>(`/content/drafts/${draft.id}`);
      setDraft(refreshed);
      const latest = refreshed.versions[0];
      if (latest) {
        setSelectedVersionId(latest.id);
        setBody(latest.body);
        setHook(latest.hook ?? '');
        setCta(latest.cta ?? '');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSelectVersion = (version: VersionItem) => {
    setSelectedVersionId(version.id);
    setBody(version.body);
    setHook(version.hook ?? '');
    setCta(version.cta ?? '');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left Column: Editor & Controls */}
      <div className="lg:col-span-7 space-y-6">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-4">
            <div className="flex items-center gap-3">
              {onBack && (
                <button
                  onClick={onBack}
                  className="rounded-lg border border-white/10 p-1.5 text-white/50 hover:bg-white/5 hover:text-white"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Post topic or hook summary..."
                  className="bg-transparent text-base font-bold text-white placeholder:text-white/30 focus:outline-none"
                />
              </div>
            </div>

            <button
              onClick={handleSaveVersion}
              disabled={isSaving || !body.trim()}
              className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save Revision
            </button>
          </div>

          {/* Text Area */}
          <div className="relative">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Compose your Threads post here (up to 500 characters)..."
              rows={8}
              className="w-full resize-y rounded-xl border border-white/10 bg-black/40 p-4 text-sm leading-relaxed text-white placeholder:text-white/30 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/20 font-sans"
            />

            {/* Quick hook tag */}
            {detectedHook && (
              <div className="mt-2 flex items-center gap-2 text-xs text-white/50">
                <span className="font-semibold text-brand-300">Detected Hook:</span>
                <span className="truncate italic text-white/70">"{detectedHook}"</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Improvement Panel */}
        <AIImprovementPanel
          onImprove={handleImproveTrigger}
          onJobComplete={handleJobComplete}
          disabled={!body.trim()}
        />
      </div>

      {/* Right Column: Live Threads Preview & Version History */}
      <div className="lg:col-span-5 space-y-6">
        <ThreadsPreview body={body} />

        {draft && draft.versions && (
          <VersionHistory
            versions={draft.versions}
            currentVersionId={selectedVersionId}
            onSelectVersion={handleSelectVersion}
          />
        )}
      </div>
    </div>
  );
}
