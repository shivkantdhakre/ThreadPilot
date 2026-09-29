'use client';

import React, { useState, useEffect } from 'react';
import {
  Send,
  Sparkles,
  Edit3,
  RotateCcw,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Moon,
  Sun,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Check,
  Zap,
} from 'lucide-react';
import { InteractionItem, ReplyDraftVersionData } from './types';

interface InteractionDetailDeckProps {
  interaction: InteractionItem;
  onApprove: (interactionId: string, versionId?: string) => Promise<void>;
  onUpdateDraft: (interactionId: string, text: string, versionNumber: number) => Promise<void>;
  onOpenRegenerateModal: () => void;
  onOpenDismissModal: () => void;
  onOpenResolveModal: () => void;
  isApproving: boolean;
}

export function InteractionDetailDeck({
  interaction,
  onApprove,
  onUpdateDraft,
  onOpenRegenerateModal,
  onOpenDismissModal,
  onOpenResolveModal,
  isApproving,
}: InteractionDetailDeckProps) {
  const draft = interaction.replyDraft;
  const versions: ReplyDraftVersionData[] = draft?.versions || (draft?.currentVersion ? [draft.currentVersion] : []);
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    draft?.approvedVersionId || draft?.currentVersionId || versions[0]?.id || ''
  );

  const selectedVersion =
    versions.find((v) => v.id === selectedVersionId) ||
    draft?.currentVersion ||
    versions[0] ||
    null;

  const [isEditing, setIsEditing] = useState(false);
  const [editedText, setEditedText] = useState(selectedVersion?.body || '');
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [showAiInspector, setShowAiInspector] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (selectedVersion) {
      setEditedText(selectedVersion.body);
      setIsEditing(false);
    }
  }, [selectedVersionId, selectedVersion]);

  // Authoritative Meta UTF-16 code units length check
  const charLength = editedText.length;
  const isOverLimit = charLength > 500;
  const isNearLimit = charLength >= 450 && !isOverLimit;
  const isEmpty = editedText.trim().length === 0;

  const handleSaveEdit = async () => {
    if (isOverLimit || isEmpty || !selectedVersion) return;
    setIsSavingDraft(true);
    setStatusMessage(null);
    try {
      await onUpdateDraft(interaction.id, editedText.trim(), selectedVersion.versionNumber);
      setIsEditing(false);
      setStatusMessage({ type: 'success', text: 'New draft version saved successfully.' });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to save draft edit.' });
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleApprove = async () => {
    setStatusMessage(null);
    try {
      await onApprove(interaction.id, selectedVersion?.id);
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to approve reply.' });
    }
  };

  const currentClassification = interaction.classifications?.[0];
  const currentPolicy = interaction.policyDecisions?.[0];
  const activeExecution = interaction.executions?.[0];
  const hasAmbiguity =
    activeExecution?.hasExternalAmbiguity ||
    activeExecution?.status === 'RECOVERY_REQUIRED' ||
    activeExecution?.recoveryResolution === 'OPERATOR_REQUIRED';

  return (
    <div className="card-base p-6 space-y-6">
      {/* Ambiguity Quick Banner if present */}
      {hasAmbiguity && (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 flex items-center justify-between gap-3 text-xs text-amber-900">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              This interaction has an ambiguous publish execution requiring manual resolution.
            </span>
          </div>
          <button
            onClick={onOpenResolveModal}
            className="btn-primary bg-amber-600 hover:bg-amber-700 text-xs py-1 px-3 shadow-subtle shrink-0"
          >
            Resolve Ambiguity
          </button>
        </div>
      )}

      {/* Top Status Alert */}
      {statusMessage && (
        <div
          className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'border-lime-200 bg-lime-50 text-lime-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
        >
          <span>{statusMessage.text}</span>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-[10px] font-bold underline ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Context Banner: Root Post & Thread Hierarchy */}
      <div className="rounded-2xl border border-canvas-border bg-paper/60 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Original Published Thread
          </span>
          {interaction.threadPost?.postedAt && (
            <span className="text-[10px] text-text-muted font-mono">
              Published {new Date(interaction.threadPost.postedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        <p className="text-xs sm:text-sm text-text-primary italic leading-relaxed bg-white/80 p-3.5 rounded-xl border border-canvas-border shadow-subtle">
          "{interaction.threadPost?.text || 'Original thread post'}"
        </p>

        {interaction.parentInteraction && (
          <div className="text-[11px] text-text-secondary pl-3 border-l-2 border-coral-400 space-y-0.5">
            <span className="font-semibold text-text-primary">
              Replying to @{interaction.parentInteraction.authorUsernameSnapshot}:
            </span>
            <p className="italic line-clamp-2">"{interaction.parentInteraction.content}"</p>
          </div>
        )}
      </div>

      {/* 2. Inbound Comment Highlight */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
              {(interaction.authorDisplayNameSnapshot || interaction.authorUsernameSnapshot || '?')
                .slice(0, 1)
                .toUpperCase()}
            </div>
            <div>
              <div className="text-xs font-bold text-text-primary">
                {interaction.authorDisplayNameSnapshot || interaction.authorUsernameSnapshot}{' '}
                <span className="font-normal text-text-muted">
                  @{interaction.authorUsernameSnapshot}
                </span>
              </div>
              <div className="text-[11px] text-text-muted font-mono">
                {new Date(interaction.createdAt).toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="badge-coral text-[10px]">Inbound Comment</span>
            <span className="badge-neutral text-[10px] font-mono">
              Priority {interaction.priorityScore}/10
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-canvas-border bg-white p-4 text-xs sm:text-sm text-text-primary leading-relaxed shadow-subtle font-sans">
          {interaction.content}
        </div>
      </div>

      {/* 3. AI Intelligence & Safety Inspector (Collapsible) */}
      <div className="rounded-xl border border-canvas-border bg-soft-gray/50 overflow-hidden">
        <button
          onClick={() => setShowAiInspector((prev) => !prev)}
          className="w-full px-4 py-2.5 flex items-center justify-between text-left hover:bg-soft-gray transition-colors"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <span className="text-xs font-bold text-text-primary">AI Classification & Policy Diagnostics</span>
            {currentClassification && (
              <span className="badge-violet text-[9px] py-0.2">
                {currentClassification.intent} ({Math.round(currentClassification.intentConfidence * 100)}%)
              </span>
            )}
          </div>
          {showAiInspector ? (
            <ChevronUp className="h-3.5 w-3.5 text-text-muted" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-text-muted" />
          )}
        </button>

        {showAiInspector && (
          <div className="p-4 border-t border-canvas-border bg-white space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <div className="p-2.5 rounded-lg border border-canvas-border bg-soft-gray/40">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Toxicity</span>
                <span className="font-mono font-bold text-text-primary">
                  {currentClassification?.toxicityScore ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-canvas-border bg-soft-gray/40">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Harassment</span>
                <span className="font-mono font-bold text-text-primary">
                  {currentClassification?.harassmentScore ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-canvas-border bg-soft-gray/40">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Controversy</span>
                <span className="font-mono font-bold text-text-primary">
                  {currentClassification?.controversyScore ?? 0}
                </span>
              </div>
              <div className="p-2.5 rounded-lg border border-canvas-border bg-soft-gray/40">
                <span className="text-[10px] text-text-muted uppercase font-bold block">Policy Gating</span>
                <span className="font-bold text-coral-600">
                  {currentPolicy?.decision || 'REVIEW_REQUIRED'}
                </span>
              </div>
            </div>

            {currentClassification?.reasoning && (
              <div className="text-[11px] text-text-secondary leading-relaxed bg-paper/60 p-2.5 rounded-lg border border-canvas-border">
                <strong className="text-text-primary">Classifier Reasoning:</strong> {currentClassification.reasoning}
              </div>
            )}

            {currentPolicy?.reasonCodes && currentPolicy.reasonCodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-text-muted uppercase">Reason Codes:</span>
                {currentPolicy.reasonCodes.map((code) => (
                  <span
                    key={code}
                    className="text-[10px] font-mono bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 rounded"
                  >
                    {code}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Draft Candidate Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-canvas-border pb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-text-primary">
              AI Candidate Reply
            </span>

            {/* Version Switcher Tabs */}
            {versions.length > 1 && (
              <div className="flex items-center gap-1 bg-soft-gray p-0.5 rounded-lg border border-canvas-border">
                {versions.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => setSelectedVersionId(v.id)}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded transition-all ${
                      v.id === selectedVersion?.id
                        ? 'bg-white text-text-primary shadow-xs'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    v{v.versionNumber} {v.id === draft?.approvedVersionId ? '★' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Dark/Light toggle for preview simulation */}
            <button
              onClick={() => setPreviewTheme(previewTheme === 'light' ? 'dark' : 'light')}
              className="p-1 rounded-lg border border-canvas-border text-text-muted hover:text-text-primary transition-colors text-[10px] inline-flex items-center gap-1"
              title="Toggle preview appearance"
            >
              {previewTheme === 'light' ? <Moon className="h-3 w-3" /> : <Sun className="h-3 w-3" />}
              <span className="font-mono text-[10px]">{previewTheme === 'light' ? 'Dark' : 'Light'}</span>
            </button>

            {/* 500-Character Counter Meter */}
            <span
              className={`text-xs font-mono font-bold px-2 py-0.5 rounded-lg border transition-all ${
                isOverLimit
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : isNearLimit
                  ? 'border-amber-200 bg-amber-50 text-amber-800'
                  : 'border-canvas-border bg-soft-gray text-text-secondary'
              }`}
            >
              {charLength} / 500 chars
            </span>
          </div>
        </div>

        {/* Inline Editor OR Live Preview */}
        {isEditing ? (
          <div className="space-y-3">
            <textarea
              rows={4}
              value={editedText}
              onChange={(e) => setEditedText(e.target.value)}
              placeholder="Refine draft text under 500 chars..."
              className="input-base text-xs sm:text-sm resize-none font-sans leading-relaxed"
            />

            <div className="flex items-center justify-between">
              <span className="text-[11px] text-text-muted">
                Saving will create immutable draft version v{((selectedVersion?.versionNumber || 1) + 1)}.
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditing(false);
                    setEditedText(selectedVersion?.body || '');
                  }}
                  className="btn-secondary text-xs py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingDraft || isOverLimit || isEmpty}
                  className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1 shadow-subtle disabled:opacity-50"
                >
                  {isSavingDraft ? (
                    <>
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>Save Version</span>
                  )}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl border p-4 sm:p-5 transition-all shadow-subtle ${
              previewTheme === 'light'
                ? 'bg-white border-canvas-border text-[#151518]'
                : 'bg-[#101010] border-[#222222] text-[#F3F5F7]'
            }`}
          >
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-coral-500 to-amber-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                Me
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold">Your Account</span>
                    <span className="text-[10px] text-text-muted font-mono">
                      Replying to @{interaction.authorUsernameSnapshot}
                    </span>
                  </div>
                  <span className="text-[10px] text-text-muted font-mono">Draft Preview</span>
                </div>

                <p className="text-xs sm:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                  {selectedVersion?.body || 'No draft generated yet.'}
                </p>

                {selectedVersion?.rationale && (
                  <div className="pt-2 text-[10px] text-text-muted italic border-t border-canvas-border/50">
                    Rationale: {selectedVersion.rationale}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 5. Action Dock */}
      <div className="pt-3 border-t border-canvas-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {!isEditing && (
            <button
              onClick={() => setIsEditing(true)}
              className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
            >
              <Edit3 className="h-3.5 w-3.5 text-text-muted" />
              <span>Edit Draft</span>
            </button>
          )}

          <button
            onClick={onOpenRegenerateModal}
            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5 text-violet-600" />
            <span>Regenerate</span>
          </button>

          <button
            onClick={onOpenDismissModal}
            className="btn-secondary text-xs py-2 px-3 flex items-center gap-1.5 text-rose-600 hover:text-rose-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Dismiss</span>
          </button>
        </div>

        {/* Primary CTA */}
        {interaction.status === 'REPLIED' ? (
          <div className="badge-lime text-xs py-2 px-3.5 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-lime-700" />
            <span>Replied & Published</span>
          </div>
        ) : interaction.status === 'PUBLISHING' || interaction.status === 'APPROVED' ? (
          <div className="badge-cyan text-xs py-2 px-3.5 flex items-center gap-1.5">
            <Loader2 className="h-4 w-4 animate-spin text-cyan-700" />
            <span>Publishing to Threads...</span>
          </div>
        ) : (
          <button
            onClick={handleApprove}
            disabled={isApproving || isEditing || isOverLimit || isEmpty}
            className="btn-primary text-xs py-2.5 px-5 shadow-subtle flex items-center gap-2 disabled:opacity-50"
          >
            {isApproving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Approving & Dispatching...</span>
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                <span>Approve & Reply on Threads</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
