'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PenSquare,
  Sparkles,
  Share2,
  TrendingUp,
  Clock,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { UserProfileDto } from '@threadpilot/types';

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [ingestionStatus, setIngestionStatus] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [profRes, draftsRes, ingestRes, accountsRes] = await Promise.allSettled([
          apiClient.get<UserProfileDto>('/profile'),
          apiClient.get<{ data: any[] }>('/content/drafts?limit=5'),
          apiClient.get<any>('/ingestion/status'),
          apiClient.get<{ accounts: any[] }>('/threads-auth/status'),
        ]);

        if (profRes.status === 'fulfilled') setProfile(profRes.value);
        if (draftsRes.status === 'fulfilled') setDrafts(draftsRes.value.data ?? []);
        if (ingestRes.status === 'fulfilled') setIngestionStatus(ingestRes.value);
        if (accountsRes.status === 'fulfilled') setAccount(accountsRes.value.accounts?.[0] ?? null);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

  return (
    <div>
      <TopBar title="Overview Dashboard" />

      <div className="p-8 max-w-7xl mx-auto space-y-8">
        {/* Welcome Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-brand-900/40 via-slate-900/60 to-purple-900/30 p-8 backdrop-blur-xl">
          <div className="relative z-10 max-w-2xl">
            <h2 className="text-2xl font-bold text-white tracking-tight mb-2">
              Ready to create authentic Threads content?
            </h2>
            <p className="text-sm text-white/70 leading-relaxed mb-6">
              ThreadPilot reproduces your personal writing cadence, hook styles, and formatting
              tendencies while evaluating each post against strict 500-character platform constraints.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/create" className="btn-primary flex items-center gap-2 text-xs py-2.5 px-4">
                <PenSquare className="h-4 w-4" />
                <span>Open Content Studio</span>
              </Link>
              <Link
                href="/profile"
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-xs font-medium text-white hover:bg-white/10 flex items-center gap-2 transition-colors"
              >
                <Sparkles className="h-4 w-4 text-brand-300" />
                <span>View Style Profile</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Threads Account Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Connected Profile
              </span>
              <Share2 className="h-4 w-4 text-brand-400" />
            </div>
            {account ? (
              <div>
                <div className="text-lg font-bold text-white">@{account.username}</div>
                <div className="flex items-center gap-2 text-xs text-emerald-400 mt-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500" />
                  Active Token Linked
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-white/70">No account linked</div>
                <Link
                  href="/connect"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300"
                >
                  Connect Threads <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          {/* Style Profile Card */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Voice Fingerprint
              </span>
              <Sparkles className="h-4 w-4 text-purple-400" />
            </div>
            {profile?.styleFeatures ? (
              <div>
                <div className="text-lg font-bold text-white">
                  Version {profile.profileVersion}
                </div>
                <div className="text-xs text-white/50 mt-1">
                  Avg {Math.round(profile.styleFeatures.avgPostLengthChars)} chars •{' '}
                  {Math.round(profile.styleFeatures.firstPersonFrequency * 100)}% 1st-person
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-medium text-white/70">Voice untyped</div>
                <Link
                  href="/profile"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-400 hover:text-brand-300"
                >
                  Train style from posts <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          {/* Ingested History */}
          <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/40">
                Historical Memory
              </span>
              <TrendingUp className="h-4 w-4 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-bold text-white">
                {ingestionStatus?.totalIngested ?? 0} Posts
              </div>
              <div className="text-xs text-white/50 mt-1">
                Ingested for RAG & style few-shot memory
              </div>
            </div>
          </div>
        </div>

        {/* Recent Drafts */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">Recent Content Drafts</h3>
              <p className="text-xs text-white/50">Drafts generated by AI or edited manually</p>
            </div>
            <Link
              href="/create"
              className="text-xs font-semibold text-brand-400 hover:text-brand-300 flex items-center gap-1"
            >
              View Studio <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {drafts.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-xl">
              <FileText className="h-8 w-8 text-white/30 mx-auto mb-2" />
              <p className="text-xs text-white/50">No drafts created yet</p>
              <Link href="/create" className="btn-primary mt-3 text-xs py-1.5 px-3">
                Create First Draft
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {drafts.map((d) => (
                <div key={d.id} className="py-3 flex items-center justify-between">
                  <div className="pr-4 truncate">
                    <p className="text-sm font-medium text-white truncate">
                      {d.currentVersion?.hook || d.currentVersion?.body || d.topic || 'Untitled Draft'}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-white/40 mt-0.5">
                      <span>v{d.currentVersion?.version ?? 1}</span>
                      <span>•</span>
                      <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-brand-300">{d.generatedBy ?? 'AI'}</span>
                    </div>
                  </div>
                  <Link
                    href={`/create?draftId=${d.id}`}
                    className="rounded-lg border border-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/5 hover:text-white transition-colors whitespace-nowrap"
                  >
                    Edit Draft
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
