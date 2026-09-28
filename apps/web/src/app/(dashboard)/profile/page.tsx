'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Loader2, User, Sliders, CheckCircle2 } from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { VoiceStyleCard } from '../../../components/profile/VoiceStyleCard';
import { StyleExamplesList } from '../../../components/profile/StyleExamplesList';
import { apiClient } from '../../../lib/api-client';
import {
  UserProfileDto,
  UserPreferencesDto,
  StyleExampleDto,
  UpdateProfileDto,
} from '@threadpilot/types';

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [preferences, setPreferences] = useState<UserPreferencesDto | null>(null);
  const [examples, setExamples] = useState<StyleExampleDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [hasSocialAccount, setHasSocialAccount] = useState(false);
  const [hasIngestedPosts, setHasIngestedPosts] = useState(false);

  // Editable identity fields
  const [bio, setBio] = useState('');
  const [profession, setProfession] = useState('');
  const [positioning, setPositioning] = useState('');
  const [expertiseInput, setExpertiseInput] = useState('');

  // Editable preference topics
  const [preferredTopicsInput, setPreferredTopicsInput] = useState('');
  const [excludedTopicsInput, setExcludedTopicsInput] = useState('');

  const loadData = async () => {
    try {
      const [profRes, prefsRes, exRes, accountsRes, ingestRes] = await Promise.all([
        apiClient.get<UserProfileDto>('/profile'),
        apiClient.get<UserPreferencesDto>('/profile/preferences'),
        apiClient.get<StyleExampleDto[]>('/profile/style/examples'),
        apiClient.get<{ id: string; isConnected: boolean }[]>('/social-accounts').catch(() => []),
        apiClient.get<{ data?: unknown[]; meta?: { total?: number } } | unknown[]>('/ingestion/posts?limit=1').catch(() => null),
      ]);

      setProfile(profRes);
      setPreferences(prefsRes);
      setExamples(exRes);

      const accounts = Array.isArray(accountsRes) ? accountsRes : [];
      setHasSocialAccount(accounts.some((a) => a.isConnected));

      if (ingestRes) {
        const total = Array.isArray(ingestRes)
          ? ingestRes.length
          : (ingestRes as { meta?: { total?: number } }).meta?.total ?? 0;
        setHasIngestedPosts(total > 0);
      } else {
        setHasIngestedPosts(false);
      }

      setBio(profRes.bio ?? '');
      setProfession(profRes.profession ?? '');
      setPositioning(profRes.positioning ?? '');
      setExpertiseInput((profRes.expertise ?? []).join(', '));

      setPreferredTopicsInput((prefsRes.preferredTopics ?? []).join(', '));
      setExcludedTopicsInput((prefsRes.excludedTopics ?? []).join(', '));
    } catch (err) {
      console.error('Failed to load profile data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const expertise = expertiseInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const preferredTopics = preferredTopicsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const excludedTopics = excludedTopicsInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await Promise.all([
        apiClient.patch<UserProfileDto>('/profile', {
          bio,
          profession,
          positioning,
          expertise,
        }),
        apiClient.patch('/profile/preferences', {
          preferredTopics,
          excludedTopics,
        }),
      ]);

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      loadData();
    } catch (err) {
      console.error('Failed to save profile', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleRetrain = async (): Promise<string> => {
    const res = await apiClient.post<{ requestId: string }>('/profile/extract-style', {});
    if (!res.requestId) {
      throw new Error('Failed to start style extraction — no requestId returned');
    }
    return res.requestId;
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Voice & Profile"
        subtitle="Creator positioning, 8-dimensional writing model, and style anchors"
        actions={
          <button
            onClick={handleSaveProfile}
            disabled={isSaving}
            className="btn-primary flex items-center gap-1.5 text-xs py-2 px-4 shadow-subtle"
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saveSuccess ? 'Saved!' : 'Save Identity'}</span>
          </button>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Style Fingerprint Card */}
        <VoiceStyleCard
          features={profile?.styleFeatures ?? null}
          profileVersion={profile?.profileVersion ?? 1}
          lastTrainedAt={profile?.styleExtractedAt ?? null}
          onRetrain={handleRetrain}
          onRetrainComplete={loadData}
          hasSocialAccount={hasSocialAccount}
          hasIngestedPosts={hasIngestedPosts}
        />

        {/* Identity & Strategic Positioning Section */}
        <div className="card-base p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-canvas-border pb-4 gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-50 border border-coral-200 text-coral-600">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
                  Identity & Personal Positioning
                </h3>
                <p className="text-xs text-text-muted">
                  Creator thesis and background — anchors AI generations and prevents hallucination
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="btn-secondary text-xs py-2 px-4 flex items-center gap-2 self-start sm:self-auto"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>{saveSuccess ? 'Saved' : 'Save Changes'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Profession / Title
              </label>
              <input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="e.g. Systems Engineer & Open Source Creator"
                className="input-base text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Expertise & Niche Areas (comma separated)
              </label>
              <input
                type="text"
                value={expertiseInput}
                onChange={(e) => setExpertiseInput(e.target.value)}
                placeholder="e.g. Distributed Systems, TypeScript, Product Architecture"
                className="input-base text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Personal Bio & Narrative Arc
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief background about yourself, what you build, and why you share on Threads..."
                className="input-base text-xs resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-text-primary mb-1.5">
                Strategic Positioning & Voice Thesis
              </label>
              <textarea
                rows={2}
                value={positioning}
                onChange={(e) => setPositioning(e.target.value)}
                placeholder="e.g. Practical, high-signal engineering advice. No buzzwords, no shallow engagement-bait."
                className="input-base text-xs resize-none"
              />
            </div>
          </div>
        </div>

        {/* Content Topics & Constraints */}
        <div className="card-base p-6 sm:p-8 space-y-6">
          <div className="flex items-center gap-3 border-b border-canvas-border pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-50 border border-violet-200 text-violet-700">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
                Topics & Negative Constraints
              </h3>
              <p className="text-xs text-text-muted">Define what the AI explores and what topics it must strictly avoid</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-lime-800 mb-1.5">
                Preferred Topics (comma separated)
              </label>
              <input
                type="text"
                value={preferredTopicsInput}
                onChange={(e) => setPreferredTopicsInput(e.target.value)}
                placeholder="e.g. AI Systems, TypeScript, Startups, Design Systems"
                className="input-base text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-800 mb-1.5">
                Excluded Topics & Forbidden Themes
              </label>
              <input
                type="text"
                value={excludedTopicsInput}
                onChange={(e) => setExcludedTopicsInput(e.target.value)}
                placeholder="e.g. Politics, Hype, Clickbait, Financial Advice"
                className="input-base text-xs"
              />
            </div>
          </div>
        </div>

        {/* Few-Shot Style Examples List */}
        <StyleExamplesList examples={examples} onRate={() => loadData()} />
      </div>
    </div>
  );
}
