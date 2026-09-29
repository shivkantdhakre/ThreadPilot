'use client';

import React, { useState, useEffect } from 'react';
import {
  Settings,
  Save,
  Loader2,
  Shield,
  AlertTriangle,
  Clock,
  Sparkles,
  Share2,
  Lock,
  Bell,
  Sliders,
  CheckCircle2,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { UserPreferencesDto, AutomationLevel } from '@threadpilot/types';

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferencesDto | null>(null);
  const [activeCategory, setActiveCategory] = useState<'AUTONOMY' | 'SCHEDULE' | 'CIRCUITS' | 'SECURITY'>('AUTONOMY');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // State fields
  const [autonomyPublishing, setAutonomyPublishing] = useState<AutomationLevel>('MANUAL');
  const [autonomyReplies, setAutonomyReplies] = useState<AutomationLevel>('MANUAL');
  const [autonomyResearch, setAutonomyResearch] = useState<AutomationLevel>('MANUAL');
  const [autonomyContentGen, setAutonomyContentGen] = useState<AutomationLevel>('MANUAL');
  const [postingFrequency, setPostingFrequency] = useState<number>(3);
  const [preferredTimezone, setPreferredTimezone] = useState('UTC');
  const [automationPaused, setAutomationPaused] = useState(false);
  const [publishingPaused, setPublishingPaused] = useState(false);
  const [repliesPaused, setRepliesPaused] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await apiClient.get<UserPreferencesDto>('/profile/preferences');
        setPrefs(res);
        setAutonomyPublishing(res.autonomyPublishing);
        setAutonomyReplies(res.autonomyReplies);
        setAutonomyResearch(res.autonomyResearch);
        setAutonomyContentGen(res.autonomyContentGen);
        setPostingFrequency(res.postingFrequency ?? 3);
        setPreferredTimezone(res.preferredTimezone ?? 'UTC');
        setAutomationPaused(res.automationPaused);
        setPublishingPaused(res.publishingPaused);
        setRepliesPaused(Boolean(res.repliesPaused));
      } catch (err) {
        console.error(err);
      }
    }
    load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await apiClient.patch('/profile/preferences', {
        autonomyPublishing,
        autonomyReplies,
        autonomyResearch,
        autonomyContentGen,
        postingFrequency,
        preferredTimezone,
        automationPaused,
        publishingPaused,
        repliesPaused,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const autonomyOptions: { value: AutomationLevel; label: string; desc: string }[] = [
    { value: 'MANUAL', label: 'Manual Only', desc: 'AI generates only on explicit user click' },
    { value: 'APPROVAL', label: 'Approval Required', desc: 'AI creates candidates; human approves every draft' },
    { value: 'RULES_BASED', label: 'Rules Based', desc: 'Auto-publish high-confidence items that match style rules' },
    { value: 'AUTONOMOUS', label: 'Fully Autonomous', desc: 'Agent posts and engages autonomously within rate limits' },
  ];

  const replyAutonomyOptions = [
    {
      value: 'REVIEW_ONLY',
      label: 'Review Only',
      desc: 'All candidate replies require human review before dispatching to Threads',
    },
    {
      value: 'SHADOW',
      label: 'Shadow Mode',
      desc: 'Simulates autonomous pipeline & logs live decisions with 0 external posting',
    },
    {
      value: 'RULES_BASED',
      label: 'Rules Based',
      desc: 'Auto-replies to grounded, verified comments; routes edge cases to review',
    },
  ];

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Settings & Guardrails"
        subtitle="System boundaries, publishing autonomy levels, and global circuit breakers"
        actions={
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-subtle"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saveSuccess ? 'Saved!' : 'Save Settings'}</span>
          </button>
        }
      />

      <div className="p-6 sm:p-8 max-w-6xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Left Column: Category Navigation (4 cols) */}
          <div className="md:col-span-4 card-base p-3 space-y-1">
            <button
              onClick={() => setActiveCategory('AUTONOMY')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                activeCategory === 'AUTONOMY'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle'
                  : 'text-text-secondary hover:bg-soft-gray hover:text-text-primary'
              }`}
            >
              <Shield className="h-4 w-4 text-violet-600" />
              <span>Autonomy & Boundaries</span>
            </button>

            <button
              onClick={() => setActiveCategory('SCHEDULE')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                activeCategory === 'SCHEDULE'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle'
                  : 'text-text-secondary hover:bg-soft-gray hover:text-text-primary'
              }`}
            >
              <Clock className="h-4 w-4 text-coral-600" />
              <span>Cadence & Timezone</span>
            </button>

            <button
              onClick={() => setActiveCategory('CIRCUITS')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                activeCategory === 'CIRCUITS'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle'
                  : 'text-text-secondary hover:bg-soft-gray hover:text-text-primary'
              }`}
            >
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              <span>Circuit Breakers</span>
            </button>

            <button
              onClick={() => setActiveCategory('SECURITY')}
              className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold text-left transition-all ${
                activeCategory === 'SECURITY'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle'
                  : 'text-text-secondary hover:bg-soft-gray hover:text-text-primary'
              }`}
            >
              <Lock className="h-4 w-4 text-lime-600" />
              <span>Security & Token Vault</span>
            </button>
          </div>

          {/* Right Column: Settings Content (8 cols) */}
          <div className="md:col-span-8 card-base p-6 sm:p-8 space-y-6">
            {activeCategory === 'AUTONOMY' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display mb-1">
                    Publishing Autonomy Level
                  </h3>
                  <p className="text-xs text-text-muted">
                    Determines how much human supervision is enforced prior to Meta Threads API dispatch
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {autonomyOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setAutonomyPublishing(opt.value)}
                      className={`rounded-xl border p-4 text-left transition-all duration-150 ${
                        autonomyPublishing === opt.value
                          ? 'border-coral-400 bg-coral-50/70 shadow-subtle text-text-primary'
                          : 'border-canvas-border bg-white text-text-secondary hover:border-canvas-border-muted hover:bg-paper'
                      }`}
                    >
                      <div className="text-xs font-bold text-text-primary mb-1 font-display">
                        {opt.label}
                      </div>
                      <div className="text-[11px] text-text-secondary leading-relaxed">
                        {opt.desc}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Reply & Comment Autonomy */}
                <div className="pt-6 border-t border-canvas-border space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-text-primary tracking-tight font-display mb-1">
                      Comment Reply Autonomy Level
                    </h3>
                    <p className="text-xs text-text-muted">
                      Controls autonomous sentiment classification, AI drafting, and auto-reply boundaries on Threads comments
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {replyAutonomyOptions.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => setAutonomyReplies(opt.value as any)}
                        className={`rounded-xl border p-4 text-left transition-all duration-150 ${
                          autonomyReplies === opt.value
                            ? 'border-coral-400 bg-coral-50/70 shadow-subtle text-text-primary'
                            : 'border-canvas-border bg-white text-text-secondary hover:border-canvas-border-muted hover:bg-paper'
                        }`}
                      >
                        <div className="text-xs font-bold text-text-primary mb-1 font-display">
                          {opt.label}
                        </div>
                        <div className="text-[11px] text-text-secondary leading-relaxed">
                          {opt.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'SCHEDULE' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display mb-1">
                    Publishing Cadence & Timezone
                  </h3>
                  <p className="text-xs text-text-muted">
                    Configure daily throughput limits and operational timezone for scheduled runs
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1.5">
                      Target Posts Per Day
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={25}
                      value={postingFrequency}
                      onChange={(e) => setPostingFrequency(parseInt(e.target.value, 10) || 1)}
                      className="input-base text-xs font-mono"
                    />
                    <p className="text-[11px] text-text-muted mt-1">Recommended: 2–4 posts per day</p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-text-primary mb-1.5">
                      Operational Timezone
                    </label>
                    <select
                      value={preferredTimezone}
                      onChange={(e) => setPreferredTimezone(e.target.value)}
                      className="input-base text-xs"
                    >
                      <option value="UTC">UTC</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (PST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Europe/Paris">Europe/Paris (CET)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeCategory === 'CIRCUITS' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display mb-1">
                    Emergency Circuit Breakers
                  </h3>
                  <p className="text-xs text-text-muted">
                    Instant emergency switches that override worker queues and halt operations
                  </p>
                </div>

                <div className="space-y-3">
                  <label className="flex items-center justify-between rounded-xl border border-canvas-border bg-paper/60 p-4 cursor-pointer hover:border-canvas-border-muted transition-all">
                    <div className="pr-4">
                      <div className="text-xs font-bold text-text-primary">Pause All Automation</div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        Freezes all background ingestion, research, and generation workers
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={automationPaused}
                      onChange={(e) => setAutomationPaused(e.target.checked)}
                      className="h-4 w-4 rounded border-canvas-border text-coral-600 focus:ring-coral-500 shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-xl border border-canvas-border bg-paper/60 p-4 cursor-pointer hover:border-canvas-border-muted transition-all">
                    <div className="pr-4">
                      <div className="text-xs font-bold text-text-primary">Pause Live Publishing</div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        Allows drafting and learning, but halts live dispatch to Threads
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={publishingPaused}
                      onChange={(e) => setPublishingPaused(e.target.checked)}
                      className="h-4 w-4 rounded border-canvas-border text-coral-600 focus:ring-coral-500 shrink-0"
                    />
                  </label>

                  <label className="flex items-center justify-between rounded-xl border border-canvas-border bg-paper/60 p-4 cursor-pointer hover:border-canvas-border-muted transition-all">
                    <div className="pr-4">
                      <div className="text-xs font-bold text-text-primary">Pause All Reply Publishing</div>
                      <div className="text-[11px] text-text-muted mt-0.5">
                        Emergency kill switch: Halts all automated outbound comment replies across Threads
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={repliesPaused}
                      onChange={(e) => setRepliesPaused(e.target.checked)}
                      className="h-4 w-4 rounded border-canvas-border text-coral-600 focus:ring-coral-500 shrink-0"
                    />
                  </label>
                </div>
              </div>
            )}

            {activeCategory === 'SECURITY' && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display mb-1">
                    Security & Token Encryption
                  </h3>
                  <p className="text-xs text-text-muted">
                    Cryptographic integrity safeguards protecting user access tokens
                  </p>
                </div>

                <div className="rounded-xl border border-canvas-border bg-paper/60 p-4 space-y-2 text-xs text-text-secondary leading-relaxed">
                  <p>
                    All Meta Threads API long-lived user tokens are encrypted via AES-256-GCM before storage in Postgres.
                    Decryption keys are isolated in process memory with versioned key indexing.
                  </p>
                  <p className="text-[11px] text-text-muted font-mono">
                    Encryption scheme: AES-256-GCM + IV authentication tag validation.
                  </p>
                </div>
              </div>
            )}

            {/* Bottom Save Bar */}
            <div className="pt-4 border-t border-canvas-border flex items-center justify-between text-xs">
              <span className="text-text-muted">
                {saveSuccess ? (
                  <span className="text-lime-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Preferences saved successfully
                  </span>
                ) : (
                  'Changes take effect on subsequent job cycles'
                )}
              </span>

              <button
                onClick={handleSave}
                disabled={isSaving}
                className="btn-primary text-xs py-2 px-4 shadow-subtle"
              >
                {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                <span>Save Preferences</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
