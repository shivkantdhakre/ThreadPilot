'use client';

import React, { useState } from 'react';
import { Save, Calendar, Loader2, ArrowLeft, Lightbulb } from 'lucide-react';
import { apiClient } from '../../lib/api-client';
import { ThreadsPreview } from './ThreadsPreview';
import { AIImprovementPanel } from './AIImprovementPanel';
import { VersionHistory, VersionItem } from './VersionHistory';
import { ScheduleModal } from '../schedules/ScheduleModal';

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
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialDraft?.currentVersion?.id ?? initialDraft?.versions[0]?.id ?? '',
  );

  // Auto-detect hook from first sentence if empty
  const detectedHook = hook || body.split(/[.\n?!]/)[0] || '';

  const handleOpenSchedule = async () => {
    if (!draft) {
      if (!body.trim()) return;
      setIsSaving(true);
      try {
        const newDraft = await apiClient.post<DraftDetail>('/content/drafts', {
          body,
          hook: detectedHook,
          cta,
          topic,
        });
        setDraft(newDraft);
        onSaved?.(newDraft);
        setIsScheduleOpen(true);
      } catch (err) {
        console.error('Failed to save draft before scheduling', err);
      } finally {
        setIsSaving(false);
      }
    } else {
      setIsScheduleOpen(true);
    }
  };

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
      {/* Left Column: Editor Workspace & Contextual AI */}
      <div className="lg:col-span-7 space-y-6">
        <div className="card-base p-6 sm:p-7 space-y-4">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-canvas-border pb-4 gap-4">
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {onBack && (
                <button
                  onClick={onBack}
                  className="rounded-xl border border-canvas-border p-2 text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Post topic or thesis summary..."
                  className="w-full bg-transparent text-base sm:text-lg font-bold text-text-primary placeholder:text-text-muted focus:outline-none font-display tracking-tight"
                />
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={handleSaveVersion}
                disabled={isSaving || !body.trim()}
                className="btn-secondary text-xs py-2 px-3.5 flex items-center gap-1.5"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save Revision</span>
              </button>
              <button
                onClick={handleOpenSchedule}
                disabled={isSaving || !body.trim()}
                className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-subtle"
              >
                <Calendar className="h-3.5 w-3.5" />
                <span>Schedule Post</span>
              </button>
            </div>
          </div>

          {/* Text Area */}
          <div className="space-y-3">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Compose your Threads post here (up to 500 characters)..."
              rows={8}
              className="w-full resize-y rounded-xl border border-canvas-border bg-white p-4 sm:p-5 text-sm leading-relaxed text-text-primary placeholder:text-text-muted/60 focus:border-coral-500 focus:outline-none focus:ring-2 focus:ring-coral-500/15 font-sans"
            />

            {/* Detected hook pill */}
            {detectedHook && (
              <div className="flex items-center gap-2 text-xs text-text-secondary bg-soft-gray/70 p-2.5 rounded-xl border border-canvas-border">
                <div className="flex items-center gap-1 text-coral-600 font-bold shrink-0">
                  <Lightbulb className="h-3.5 w-3.5" />
                  <span>Hook:</span>
                </div>
                <span className="truncate italic text-text-primary">"{detectedHook}"</span>
              </div>
            )}
          </div>
        </div>

        {/* AI Contextual Actions */}
        <AIImprovementPanel
          onImprove={handleImproveTrigger}
          onJobComplete={handleJobComplete}
          disabled={!body.trim()}
        />
      </div>

      {/* Right Column: Live Threads Simulation & Revision History */}
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

      {/* Schedule Modal */}
      {isScheduleOpen && draft && (
        <ScheduleModal
          isOpen={true}
          onClose={() => setIsScheduleOpen(false)}
          draftId={draft.id}
          draftTopic={topic || draft.topic}
          draftBody={body}
          draftStatus={draft.status}
          onScheduled={() => {
            setIsScheduleOpen(false);
            onSaved?.({
              ...draft,
              status: 'READY',
            });
          }}
        />
      )}
    </div>
  );
}

export default DraftEditor;
