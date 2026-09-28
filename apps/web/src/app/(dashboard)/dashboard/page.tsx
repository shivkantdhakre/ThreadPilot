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
  AlertCircle,
  Plus,
  Zap,
  Activity,
  ChevronRight,
  ShieldCheck,
  BrainCircuit,
  Radio,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { UserProfileDto } from '@threadpilot/types';
import { renderStatusBadge, formatRelativeTime } from '../../../components/schedules/ScheduleCard';
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

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
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [queueTab, setQueueTab] = useState<'UPCOMING' | 'PUBLISHED'>('UPCOMING');
  const [ingestionStatus, setIngestionStatus] = useState<any>(null);
  const [account, setAccount] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Time-aware greeting
  const [greeting, setGreeting] = useState('Your Threads system is ready');

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting('Good morning. Your Threads system is ready.');
    else if (hour < 18) setGreeting('Good afternoon. Your Threads system is ready.');
    else setGreeting('Good evening. Your Threads system is ready.');
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setIsRefreshing(true);
    try {
      const [profRes, draftsRes, ingestRes, accountsRes, notifRes] = await Promise.allSettled([
        apiClient.get<UserProfileDto>('/profile'),
        apiClient.get<{ data: any[] }>('/content/drafts?limit=5'),
        apiClient.get<any>('/ingestion/status'),
        apiClient.get<{ accounts: any[] }>('/threads-auth/status'),
        apiClient.get<{ notifications: any[] }>('/notifications?limit=4'),
      ]);

      if (profRes.status === 'fulfilled') setProfile(profRes.value);
      if (draftsRes.status === 'fulfilled') setDrafts(draftsRes.value.data ?? []);
      if (ingestRes.status === 'fulfilled') setIngestionStatus(ingestRes.value);
      if (accountsRes.status === 'fulfilled') setAccount(accountsRes.value.accounts?.[0] ?? null);
      if (notifRes.status === 'fulfilled') setRecentActivity(notifRes.value.notifications ?? []);

      let upcoming: any[] = [];
      let published: any[] = [];

      try {
        const directRes = await apiClient.get<{ data: any[] }>('/content/schedules?status=UPCOMING&limit=10&order=asc');
        const directData = directRes.data || [];
        upcoming = directData.filter((s) => UPCOMING_STATUSES.includes(s.status));
      } catch {}

      try {
        const recentRes = await apiClient.get<{ data: any[] }>('/content/schedules?limit=50&order=desc');
        const recentData = recentRes.data || [];

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

    const handleFocus = () => loadData(true);
    window.addEventListener('focus', handleFocus);

    const timer = setInterval(() => {
      loadData(true);
    }, 15000);

    return () => {
      window.removeEventListener('focus', handleFocus);
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Overview"
        subtitle="Autonomous Threads orchestration and creator workspace"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => loadData(false)}
              disabled={isRefreshing}
              className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary hover:border-canvas-border-muted transition-colors"
              title="Refresh workspace telemetry"
              aria-label="Refresh workspace telemetry"
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin text-coral-500' : ''}`} />
            </button>
            <Link
              href="/create"
              className="btn-primary text-xs py-2 px-3.5 hidden sm:inline-flex items-center gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Draft</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Editorial Top Hero Banner */}
        <div className="rounded-2xl border border-canvas-border bg-white p-7 sm:p-9 shadow-subtle relative overflow-hidden">
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-coral-200 bg-coral-50 px-3 py-1 text-xs font-semibold text-coral-700">
                <span className="h-1.5 w-1.5 rounded-full bg-coral-500 animate-pulse" />
                <span>Publishing Pipeline Active</span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-text-primary tracking-tight font-display">
                {greeting}
              </h2>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed font-normal">
                ThreadPilot continuously reproduces your natural cadence, evaluates strict 500-character platform bounds,
                and orchestrates scheduled distribution across connected Threads accounts.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              <Link
                href="/create"
                className="btn-primary text-xs py-2.5 px-4 inline-flex items-center gap-2 shadow-subtle"
              >
                <PenSquare className="h-3.5 w-3.5" />
                <span>Open Content Studio</span>
              </Link>
              <Link
                href="/profile"
                className="btn-secondary text-xs py-2.5 px-4 inline-flex items-center gap-2"
              >
                <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                <span>Voice Fingerprint</span>
              </Link>
            </div>
          </div>

          {/* Calm Status Strip */}
          <div className="mt-6 pt-5 border-t border-canvas-border flex flex-wrap items-center justify-between gap-4 text-xs text-text-muted">
            <div className="flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">Connection:</span>
                {account ? (
                  <span className="text-lime-700 font-medium flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
                    @{account.username}
                  </span>
                ) : (
                  <Link href="/connect" className="text-coral-600 font-semibold hover:underline">
                    Connect Threads &rarr;
                  </Link>
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">Voice Model:</span>
                <span className="font-mono text-text-secondary">
                  v{profile?.profileVersion ?? 1} • {profile?.styleFeatures ? 'Calibrated' : 'Untrained'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <span className="font-semibold text-text-primary">Queue:</span>
                <span className="text-text-secondary">
                  {upcomingSchedules.length} pending dispatch
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-[11px] font-mono text-text-muted">
              <ShieldCheck className="h-3.5 w-3.5 text-lime-600" />
              <span>AES-256 Encrypted Token Vault</span>
            </div>
          </div>
        </div>

        {/* Real KPI Metrics Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Ingested Historical Memory"
            value={ingestionStatus?.totalIngested ?? 0}
            meta="Posts indexed for few-shot context"
            icon={TrendingUp}
            accent="cyan"
          />

          <MetricCard
            label="Upcoming in Queue"
            value={upcomingSchedules.length}
            meta="Automated scheduled dispatches"
            icon={Clock}
            accent="coral"
          />

          <MetricCard
            label="Published to Threads"
            value={recentPublished.length}
            meta="Successfully confirmed on Threads"
            icon={CheckCircle2}
            accent="lime"
          />

          <MetricCard
            label="Voice Profile Status"
            value={profile?.styleFeatures ? `v${profile.profileVersion}` : 'Draft'}
            meta={
              profile?.styleFeatures
                ? `Avg ${Math.round(profile.styleFeatures.avgPostLengthChars)} chars`
                : 'Extract from past posts'
            }
            icon={Sparkles}
            accent="violet"
          />
        </div>

        {/* Primary Content Grid: Center Workflow & Side Intelligence */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Column (8 cols): Publishing Queue & Drafts */}
          <div className="lg:col-span-8 space-y-8">
            {/* Publishing Queue */}
            <div className="card-base p-6 sm:p-7 space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                      Publishing Queue
                    </h3>
                    <div className="flex rounded-lg border border-canvas-border bg-soft-gray p-0.5 text-xs">
                      <button
                        onClick={() => setQueueTab('UPCOMING')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          queueTab === 'UPCOMING'
                            ? 'bg-white text-text-primary shadow-subtle'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Upcoming ({upcomingSchedules.length})
                      </button>
                      <button
                        onClick={() => setQueueTab('PUBLISHED')}
                        className={`px-2.5 py-1 rounded-md font-semibold transition-all ${
                          queueTab === 'PUBLISHED'
                            ? 'bg-white text-text-primary shadow-subtle'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        Published ({recentPublished.length})
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-text-secondary mt-1">
                    {queueTab === 'UPCOMING'
                      ? 'Automated schedules awaiting platform dispatch'
                      : 'Successfully published posts across connected Threads profiles'}
                  </p>
                </div>

                <Link
                  href="/schedules"
                  className="text-xs font-semibold text-coral-600 hover:text-coral-700 inline-flex items-center gap-1 transition-colors"
                >
                  <span>Open Calendar</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {/* Queue Items */}
              {queueTab === 'UPCOMING' ? (
                upcomingSchedules.length === 0 ? (
                  <EmptyState
                    icon={Calendar}
                    title="Your publishing queue is clear"
                    description="Schedule content from Content Studio to enable autonomous platform dispatch."
                    actionLabel="Draft & Schedule"
                    actionHref="/create"
                    actionIcon={Plus}
                    accent="cyan"
                  />
                ) : (
                  <div className="space-y-3">
                    {upcomingSchedules.map((s) => (
                      <div
                        key={s.id}
                        className="rounded-xl border border-canvas-border bg-paper/60 p-4 hover:border-canvas-border-muted hover:bg-paper transition-all space-y-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {renderStatusBadge(s.status)}
                            <span className="text-xs font-semibold text-text-secondary">
                              @{s.socialAccount?.username || 'account'}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-text-muted">
                            {formatRelativeTime(s.scheduledAt)}
                          </span>
                        </div>

                        <p className="text-xs sm:text-sm text-text-primary line-clamp-2 leading-relaxed font-normal">
                          {s.contentSnapshot?.body || 'Post content'}
                        </p>

                        <div className="flex items-center justify-between pt-2 border-t border-canvas-border text-[11px] text-text-muted">
                          <span>Timezone: {s.timezone || 'UTC'}</span>
                          <Link
                            href="/schedules"
                            className="font-semibold text-coral-600 hover:text-coral-700 transition-colors"
                          >
                            Manage in Calendar &rarr;
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : recentPublished.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="No published posts yet"
                  description="Posts will appear here as soon as they are successfully published to Meta Threads."
                  actionLabel="Create First Post"
                  actionHref="/create"
                  actionIcon={Plus}
                  accent="lime"
                />
              ) : (
                <div className="space-y-3">
                  {recentPublished.map((s) => (
                    <div
                      key={s.id}
                      className="rounded-xl border border-canvas-border bg-paper/60 p-4 hover:border-canvas-border-muted hover:bg-paper transition-all space-y-2.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {renderStatusBadge(s.status)}
                          <span className="text-xs font-semibold text-text-secondary">
                            @{s.socialAccount?.username || 'account'}
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-text-muted">
                          Published {formatRelativeTime(s.publishedAt || s.scheduledAt)}
                        </span>
                      </div>

                      <p className="text-xs sm:text-sm text-text-primary line-clamp-2 leading-relaxed">
                        {s.contentSnapshot?.body || 'Post content'}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-canvas-border text-[11px] text-text-muted">
                        <span>Status: Verified on platform</span>
                        <Link
                          href={"/posts" as any}
                          className="font-semibold text-coral-600 hover:text-coral-700 transition-colors"
                        >
                          View Posts Library &rarr;
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Recent Drafts */}
            <div className="card-base p-6 sm:p-7 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                    Content Drafts in Progress
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">
                    Personalized AI drafts awaiting revision or scheduling
                  </p>
                </div>
                <Link
                  href="/create"
                  className="text-xs font-semibold text-coral-600 hover:text-coral-700 inline-flex items-center gap-1 transition-colors"
                >
                  <span>Content Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {drafts.length === 0 ? (
                <EmptyState
                  icon={FileText}
                  title="No drafts created yet"
                  description="Start with a blank canvas or generate an authentic draft aligned with your voice."
                  actionLabel="Create Draft"
                  actionHref="/create"
                  actionIcon={Plus}
                  accent="coral"
                />
              ) : (
                <div className="divide-y divide-canvas-border">
                  {drafts.map((d) => (
                    <div
                      key={d.id}
                      className="py-3.5 flex items-center justify-between gap-4 hover:bg-paper/40 px-2 rounded-xl transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs sm:text-sm font-semibold text-text-primary truncate">
                          {d.currentVersion?.hook || d.currentVersion?.body || d.topic || 'Untitled Draft'}
                        </p>
                        <div className="flex items-center gap-2 text-[11px] text-text-muted mt-1 font-mono">
                          <span>Revision v{d.currentVersion?.version ?? 1}</span>
                          <span>•</span>
                          <span>{new Date(d.updatedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="text-coral-600 font-semibold">{d.generatedBy ?? 'AI'}</span>
                        </div>
                      </div>

                      <Link
                        href={`/create?draftId=${d.id}`}
                        className="btn-secondary text-xs py-1.5 px-3 shrink-0"
                      >
                        Edit
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Side Column (4 cols): Contextual Intelligence & Activity */}
          <div className="lg:col-span-4 space-y-6">
            {/* AI Recommendations Panel */}
            <div className="card-paper p-6 space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    AI Recommendations
                  </h4>
                  <p className="text-[11px] text-text-muted">Derived from your writing signals</p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-xl border border-canvas-border bg-white p-3.5 space-y-1.5 shadow-subtle">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="badge-violet text-[10px]">Cadence Signal</span>
                    <span className="text-text-muted font-mono">Insight</span>
                  </div>
                  <p className="text-xs font-semibold text-text-primary">
                    Short opening hook sentences drive higher read-through on Threads.
                  </p>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Target under 14 words on line 1 before diving into deeper nuances.
                  </p>
                </div>

                <div className="rounded-xl border border-canvas-border bg-white p-3.5 space-y-1.5 shadow-subtle">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="badge-coral text-[10px]">Publishing Window</span>
                    <span className="text-text-muted font-mono">Suggested</span>
                  </div>
                  <p className="text-xs font-semibold text-text-primary">
                    High engagement corridor: 8:00 AM – 10:30 AM
                  </p>
                  <p className="text-[11px] text-text-secondary leading-relaxed">
                    Queue drafts to deploy during morning reading habits.
                  </p>
                </div>
              </div>

              <Link
                href={"/learning" as any}
                className="w-full btn-secondary text-xs py-2 inline-flex items-center justify-center gap-1.5 text-text-secondary hover:text-text-primary"
              >
                <span>View Full Learning Insights</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>

            {/* Personal Voice Snapshot */}
            <div className="card-base p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                    Voice Vector
                  </h4>
                </div>
                <span className="text-[11px] font-mono text-text-muted">
                  v{profile?.profileVersion ?? 1}
                </span>
              </div>

              {profile?.styleFeatures ? (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary">Average Length</span>
                      <span className="font-mono font-semibold text-text-primary">
                        {Math.round(profile.styleFeatures.avgPostLengthChars)} chars
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-soft-gray overflow-hidden">
                      <div
                        className="h-full bg-coral-500 rounded-full"
                        style={{
                          width: `${Math.min(100, Math.round((profile.styleFeatures.avgPostLengthChars / 500) * 100))}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary">First-Person Voice</span>
                      <span className="font-mono font-semibold text-text-primary">
                        {Math.round(profile.styleFeatures.firstPersonFrequency * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-soft-gray overflow-hidden">
                      <div
                        className="h-full bg-violet-600 rounded-full"
                        style={{
                          width: `${Math.round(profile.styleFeatures.firstPersonFrequency * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-text-secondary">Technical Vocabulary</span>
                      <span className="font-mono font-semibold text-text-primary">
                        {Math.round(profile.styleFeatures.technicalVocabScore * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-soft-gray overflow-hidden">
                      <div
                        className="h-full bg-cyan-600 rounded-full"
                        style={{
                          width: `${Math.round(profile.styleFeatures.technicalVocabScore * 100)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <Link
                    href="/profile"
                    className="block text-center text-xs font-semibold text-violet-700 hover:text-violet-800 pt-2 transition-colors"
                  >
                    Adjust Voice Archetype &rarr;
                  </Link>
                </div>
              ) : (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs text-text-secondary">
                    Voice model untyped. Train your writing model using your historical Threads posts.
                  </p>
                  <Link
                    href="/profile"
                    className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1"
                  >
                    <span>Train Style Profile</span>
                  </Link>
                </div>
              )}
            </div>

            {/* Recent System Activity */}
            <div className="card-base p-6 space-y-3">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                  Recent Telemetry
                </h4>
                <Radio className="h-3.5 w-3.5 text-lime-600 animate-pulse" />
              </div>

              {recentActivity.length === 0 ? (
                <p className="text-xs text-text-muted py-2 text-center">
                  All systems nominal. No recent critical events.
                </p>
              ) : (
                <div className="divide-y divide-canvas-border">
                  {recentActivity.map((act) => (
                    <div key={act.id} className="py-2.5 space-y-0.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-text-primary truncate">
                          {act.title}
                        </span>
                        <span className="text-text-muted font-mono shrink-0 ml-2">
                          {formatRelativeTime(act.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-text-secondary line-clamp-1">
                        {act.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
