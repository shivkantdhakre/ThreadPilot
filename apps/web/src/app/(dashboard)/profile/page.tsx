'use client';

import React, { useState, useEffect } from 'react';
import { Sparkles, Save, Loader2, User, Sliders } from 'lucide-react';
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

      // Determine pre-flight conditions for voice training
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
    <div className="min-h-screen bg-ink-900">
      <TopBar title="Voice & Profile" />

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
        <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-8 backdrop-blur-xl shadow-card-elevated">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/[0.08] pb-5 mb-6 gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-400">
                <User className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight font-display">
                  Identity & Personal Positioning
                </h3>
                <p className="text-xs text-white/50">
                  Manual creator identity controls — never overwritten by automated learning
                </p>
              </div>
            </div>

            <button
              onClick={handleSaveProfile}
              disabled={isSaving}
              className="btn-primary flex items-center gap-2 text-xs py-2 px-5 shadow-glow"
            >
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              <span>Save Profile</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                Profession / Title
              </label>
              <input
                type="text"
                value={profession}
                onChange={(e) => setProfession(e.target.value)}
                placeholder="e.g. AI Founder & Systems Architect"
                className="input-base text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                Expertise & Niche Areas (comma separated)
              </label>
              <input
                type="text"
                value={expertiseInput}
                onChange={(e) => setExpertiseInput(e.target.value)}
                placeholder="e.g. Agentic Workflows, Distributed Systems, SaaS"
                className="input-base text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
                Personal Bio & Story
              </label>
              <textarea
                rows={3}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Brief background about yourself, your company, and what you build..."
                className="input-base text-xs resize-none"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-white/70 mb-1.5">
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

        {/* Content Topics & Filters */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-8 backdrop-blur-xl shadow-card-elevated">
          <div className="flex items-center gap-3 border-b border-white/[0.08] pb-5 mb-6">
            <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold text-white tracking-tight font-display">
                Topics & Negative Constraints
              </h3>
              <p className="text-xs text-white/50">Guide what the AI explores and what it must avoid</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-lime-400 mb-1.5">
                Preferred Topics (comma separated)
              </label>
              <input
                type="text"
                value={preferredTopicsInput}
                onChange={(e) => setPreferredTopicsInput(e.target.value)}
                placeholder="e.g. AI Agents, TypeScript, System Architecture, Startups"
                className="input-base text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-rose-400 mb-1.5">
                Excluded Topics & Forbidden Themes
              </label>
              <input
                type="text"
                value={excludedTopicsInput}
                onChange={(e) => setExcludedTopicsInput(e.target.value)}
                placeholder="e.g. Politics, Memecoins, Unverified Hype"
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
