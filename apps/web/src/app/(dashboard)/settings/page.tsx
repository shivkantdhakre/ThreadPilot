'use client';

import React, { useState, useEffect } from 'react';
import { Settings, Save, Loader2, Shield, AlertTriangle } from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { UserPreferencesDto, AutomationLevel } from '@threadpilot/types';

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPreferencesDto | null>(null);
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
    { value: 'MANUAL', label: 'Manual Only', desc: 'AI only generates on explicit command' },
    { value: 'APPROVAL', label: 'Approval Required', desc: 'AI creates candidates; human approves every draft' },
    { value: 'RULES_BASED', label: 'Rules Based', desc: 'Auto-publish high-confidence items that match style rules' },
    { value: 'AUTONOMOUS', label: 'Fully Autonomous', desc: 'Agent posts and engages autonomously within rate limits' },
  ];

  return (
    <div>
      <TopBar title="Automation & Governance Settings" />

      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-brand-400" />
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Autonomy & Guardrails
                </h3>
                <p className="text-xs text-white/50">
                  Granular control over AI decision boundaries and publishing limits
                </p>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={isSaving}
              className="btn-primary flex items-center gap-2 text-xs py-2 px-4"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              {saveSuccess ? 'Saved!' : 'Save Settings'}
            </button>
          </div>

          <div className="space-y-6">
            {/* Publishing Autonomy */}
            <div>
              <label className="block text-xs font-semibold text-white/90 mb-2">
                Publishing Autonomy Level
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {autonomyOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setAutonomyPublishing(opt.value)}
                    className={`rounded-xl border p-3.5 text-left transition-all ${
                      autonomyPublishing === opt.value
                        ? 'border-brand-500/40 bg-brand-500/10 text-white shadow-sm'
                        : 'border-white/5 bg-white/[0.02] text-white/60 hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{opt.label}</div>
                    <div className="text-[11px] text-white/50 mt-1">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Target Posting Frequency & Timezone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Target Posts Per Day
                </label>
                <input
                  type="number"
                  min={1}
                  max={25}
                  value={postingFrequency}
                  onChange={(e) => setPostingFrequency(parseInt(e.target.value, 10) || 1)}
                  className="input-base text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-white/70 mb-1.5">
                  Preferred Timezone
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
                </select>
              </div>
            </div>

            {/* Emergency Kill Switches */}
            <div className="border-t border-white/10 pt-6">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-300">
                  Global Circuit Breakers
                </h4>
              </div>

              <div className="space-y-3">
                <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 cursor-pointer hover:bg-white/[0.04]">
                  <div>
                    <div className="text-xs font-semibold text-white">Pause All Automation</div>
                    <div className="text-[11px] text-white/40">
                      Instantly freezes all background ingestion, research, and generation jobs
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={automationPaused}
                    onChange={(e) => setAutomationPaused(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand-500 focus:ring-brand-500"
                  />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-white/5 bg-white/[0.02] p-3.5 cursor-pointer hover:bg-white/[0.04]">
                  <div>
                    <div className="text-xs font-semibold text-white">Pause Publishing Only</div>
                    <div className="text-[11px] text-white/40">
                      Continues learning and drafting, but halts all Threads live publication
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={publishingPaused}
                    onChange={(e) => setPublishingPaused(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 bg-white/10 text-brand-500 focus:ring-brand-500"
                  />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
