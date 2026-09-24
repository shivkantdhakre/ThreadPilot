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
  Calendar,
  Layers,
  Activity,
  Plus,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { UserProfileDto } from '@threadpilot/types';
import { renderStatusBadge, formatRelativeTime } from '../../../components/schedules/ScheduleCard';

const UPCOMING_STATUSES = [
  'SCHEDULED',
  'CLAIMED',
  'CREATING_CONTAINER',
  'CONTAINER_CREATED',
  'PUBLISHING',
  'RECOVERY_REQUIRED',
  'QUOTA_BLOCKED',
  'FAILED_RETRYABLE',
  'AUTH_REQUIRED',
];

export default function DashboardPage() {
  const [profile, setProfile] = useState<UserProfileDto | null>(null);
  const [drafts, setDrafts] = useState<any[]>([]);
  const [upcomingSchedules, setUpcomingSchedules] = useState<any[]>([]);
  const [recentPublished, setRecentPublished] = useState<any[]>([]);
  const [queueTab, setQueueTab] = useState<'UPCOMING' | 'PUBLISHED'>('UPCOMING');
  const [ingestionStatus, setIngestionStatus] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const loadData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
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

      // Multi-strategy schedule resolution:
      // Try direct UPCOMING query first, then fetch recent list to populate published tab and provide fallback
      let upcoming: any[] = [];
      let published: any[] = [];

      try {
        const directRes = await apiClient.get<{ data: any[] }>('/content/schedules?status=UPCOMING&limit=10&order=asc');
        const directData = directRes.data || [];
        upcoming = directData.filter((s) => UPCOMING_STATUSES.includes(s.status));
      } catch {
        // Fallback handles this
      }

      try {
        const recentRes = await apiClient.get<{ data: any[] }>('/content/schedules?limit=50&order=desc');
        const recentData = recentRes.data || [];

        // If direct UPCOMING returned 0 (e.g. backend version without status=UPCOMING), extract upcoming from recentData
        if (upcoming.length === 0) {
          upcoming = recentData
            .filter((s) => UPCOMING_STATUSES.includes(s.status))
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
        }

        published = recentData
          .filter((s) => s.status === 'PUBLISHED')
          .sort((a, b) => new Date(b.publishedAt || b.scheduledAt).getTime() - new Date(a.publishedAt || a.scheduledAt).getTime())
          .slice(0, 4);
      } catch (err) {
        console.error('Failed to load recent schedules', err);
      }

      setUpcomingSchedules(upcoming.slice(0, 4));
      setRecentPublished(published);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData(false);

    // Auto-refresh when user returns to this tab
    const handleFocus = () => {
      loadData(true);
    };
    window.addEventListener('focus', handleFocus);

    // Auto-polling interval every 15s to keep publishing queue in sync
    const timer = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-ink-900">
      <TopBar title="Overview Dashboard" />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Welcome Editorial Banner */}
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.09] bg-gradient-to-br from-ink-800 via-[#13131A] to-ink-850 p-8 sm:p-10 shadow-card-elevated backdrop-blur-2xl">
          <div className="absolute top-0 right-0 -mt-10 -mr-10 h-64 w-64 rounded-full bg-coral-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-1/3 -mb-10 h-48 w-48 rounded-full bg-violet-600/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-coral-500/30 bg-coral-500/10 px-3 py-1 text-xs font-semibold text-coral-400 mb-4">
              <Activity className="h-3.5 w-3.5" />
              <span>Workspace Engine Active</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-display mb-3">
              Ready to create authentic Threads content?
            </h2>
            <p className="text-sm sm:text-base text-white/65 leading-relaxed mb-6 font-normal">
              ThreadPilot reproduces your personal writing cadence, hook styles, and formatting
              tendencies while evaluating each post against strict 500-character platform constraints.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/create" className="btn-primary text-xs py-2.5 px-5 flex items-center gap-2">
                <PenSquare className="h-4 w-4" />
                <span>Open Content Studio</span>
              </Link>
              <Link
                href="/profile"
                className="btn-secondary text-xs py-2.5 px-5 flex items-center gap-2"
              >
                <Sparkles className="h-4 w-4 text-violet-400" />
                <span>View Style Profile</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Threads Account Card */}
          <div className="glass-card p-6 rounded-2xl border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                Connected Profile
              </span>
              <div className="p-2 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-400">
                <Share2 className="h-4 w-4" />
              </div>
            </div>
            {account ? (
              <div>
                <div className="text-xl font-extrabold text-white font-display">@{account.username}</div>
                <div className="flex items-center gap-2 text-xs text-lime-400 mt-2 font-medium">
                  <span className="h-2 w-2 rounded-full bg-lime-400 animate-pulse" />
                  Active Token Linked (AES Encrypted)
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-semibold text-white/70">No account linked</div>
                <Link
                  href="/connect"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-coral-400 hover:text-coral-300 transition-colors"
                >
                  Connect Threads <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          {/* Style Profile Card */}
          <div className="glass-card p-6 rounded-2xl border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                Voice Fingerprint
              </span>
              <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20 text-violet-400">
                <Sparkles className="h-4 w-4" />
              </div>
            </div>
            {profile?.styleFeatures ? (
              <div>
                <div className="text-xl font-extrabold text-white font-display">
                  Profile v{profile.profileVersion}
                </div>
                <div className="text-xs text-white/55 mt-2 font-mono">
                  Avg {Math.round(profile.styleFeatures.avgPostLengthChars)} chars •{' '}
                  {Math.round(profile.styleFeatures.firstPersonFrequency * 100)}% 1st-person
                </div>
              </div>
            ) : (
              <div>
                <div className="text-sm font-semibold text-white/70">Voice untyped</div>
                <Link
                  href="/profile"
                  className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-violet-400 hover:text-violet-300 transition-colors"
                >
                  Train style from posts <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            )}
          </div>

          {/* Ingested History */}
          <div className="glass-card p-6 rounded-2xl border border-white/[0.08] relative group">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold uppercase tracking-wider text-white/40">
                Historical Memory
              </span>
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <div>
              <div className="text-xl font-extrabold text-white font-display">
                {ingestionStatus?.totalIngested ?? 0} Posts Ingested
              </div>
              <div className="text-xs text-white/55 mt-2 font-mono">
                Indexed for RAG & few-shot context
              </div>
            </div>
          </div>
        </div>

        {/* Publishing Queue Section */}
        <div className="rounded-3xl border border-white/[0.08] bg-ink-850 p-6 sm:p-7 shadow-card-elevated backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-base font-bold text-white tracking-tight font-display">
                  Publishing Queue
                </h3>
                <div className="flex items-center gap-1 p-1 rounded-xl bg-ink-900 border border-white/[0.08]">
                  <button
                    onClick={() => setQueueTab('UPCOMING')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      queueTab === 'UPCOMING'
                        ? 'bg-coral-500/20 text-coral-400 border border-coral-500/30 shadow-sm'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Upcoming ({upcomingSchedules.length})
                  </button>
                  <button
                    onClick={() => setQueueTab('PUBLISHED')}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      queueTab === 'PUBLISHED'
                        ? 'bg-lime-500/20 text-lime-400 border border-lime-500/30 shadow-sm'
                        : 'text-white/40 hover:text-white/70'
                    }`}
                  >
                    Published ({recentPublished.length})
                  </button>
                </div>
              </div>
              <p className="text-xs text-white/50 mt-1">
                {queueTab === 'UPCOMING'
                  ? 'Active automated schedules awaiting platform dispatch'
                  : 'Successfully published posts across connected Threads profiles'}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => loadData(false)}
                disabled={isRefreshing}
                className="p-2 rounded-xl border border-white/10 bg-white/5 text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                title="Refresh Queue"
                aria-label="Refresh Queue"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin text-coral-400' : ''}`} />
              </button>
              <Link
                href="/schedules"
                className="text-xs font-semibold text-coral-400 hover:text-coral-300 flex items-center gap-1 transition-colors px-3 py-2 rounded-xl border border-coral-500/20 bg-coral-500/10 hover:bg-coral-500/20"
              >
                <span>Open Calendar</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {queueTab === 'UPCOMING' ? (
            upcomingSchedules.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-ink-900/50">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto mb-3">
                  <Calendar className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-white/80">No scheduled posts in the queue</p>
                <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                  Create and schedule content in the studio to enable autonomous dispatch.
                </p>
                <Link href="/create" className="btn-primary mt-4 text-xs py-2 px-4 inline-flex items-center gap-1.5">
                  <Plus className="h-3.5 w-3.5" />
                  Schedule a Post
                </Link>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {upcomingSchedules.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-white/[0.06] bg-ink-900/80 p-5 space-y-3 hover:border-white/15 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      {renderStatusBadge(s.status)}
                      <span className="text-[11px] font-mono font-medium text-white/50">
                        {formatRelativeTime(s.scheduledAt)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/90 line-clamp-2 leading-relaxed">
                      {s.contentSnapshot?.body || 'Post content'}
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] text-white/40">
                      <span className="font-semibold text-white/60">@{s.socialAccount?.username || 'account'}</span>
                      <Link href="/schedules" className="text-coral-400 hover:text-coral-300 font-semibold transition-colors">
                        Manage &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            recentPublished.length === 0 ? (
              <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-ink-900/50">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto mb-3">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold text-white/80">No published posts yet</p>
                <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                  Posts will appear here as soon as they are published to Threads.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {recentPublished.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-2xl border border-white/[0.06] bg-ink-900/80 p-5 space-y-3 hover:border-white/15 transition-all"
                  >
                    <div className="flex items-center justify-between">
                      {renderStatusBadge(s.status)}
                      <span className="text-[11px] font-mono font-medium text-white/50">
                        {formatRelativeTime(s.publishedAt || s.scheduledAt)}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-white/90 line-clamp-2 leading-relaxed">
                      {s.contentSnapshot?.body || 'Post content'}
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] text-white/40">
                      <span className="font-semibold text-white/60">@{s.socialAccount?.username || 'account'}</span>
                      <Link href="/schedules" className="text-coral-400 hover:text-coral-300 font-semibold transition-colors">
                        View in Calendar &rarr;
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Recent Drafts */}
        <div className="rounded-3xl border border-white/[0.08] bg-ink-850 p-6 sm:p-7 shadow-card-elevated backdrop-blur-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h3 className="text-base font-bold text-white tracking-tight font-display">Recent Content Drafts</h3>
              <p className="text-xs text-white/50 mt-0.5">AI-synthesized and edited drafts in progress</p>
            </div>
            <Link
              href="/create"
              className="text-xs font-semibold text-coral-400 hover:text-coral-300 flex items-center gap-1 transition-colors"
            >
              View Studio <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          {drafts.length === 0 ? (
            <div className="text-center py-10 border border-dashed border-white/10 rounded-2xl bg-ink-900/50">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto mb-3">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-semibold text-white/80">No drafts created yet</p>
              <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                Draft your first thread using your personalized voice archetype.
              </p>
              <Link href="/create" className="btn-primary mt-4 text-xs py-2 px-4 inline-flex items-center gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                Create First Draft
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-white/[0.06]">
              {drafts.map((d) => (
                <div key={d.id} className="py-4 flex items-center justify-between hover:bg-white/[0.02] px-2 rounded-xl transition-colors">
                  <div className="pr-4 truncate flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">
                      {d.currentVersion?.hook || d.currentVersion?.body || d.topic || 'Untitled Draft'}
                    </p>
                    <div className="flex items-center gap-3 text-[11px] text-white/40 mt-1 font-mono">
                      <span>v{d.currentVersion?.version ?? 1}</span>
                      <span>•</span>
                      <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
                      <span>•</span>
                      <span className="text-coral-400 font-semibold">{d.generatedBy ?? 'AI'}</span>
                    </div>
                  </div>
                  <Link
                    href={`/create?draftId=${d.id}`}
                    className="btn-secondary text-xs py-1.5 px-3.5 whitespace-nowrap"
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
