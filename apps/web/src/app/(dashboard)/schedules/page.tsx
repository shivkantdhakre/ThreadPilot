'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  Calendar as CalendarIcon,
  ListFilter,
  Plus,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldAlert,
  Search,
  PenSquare,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { ScheduleCard, ScheduledPostItem } from '../../../components/schedules/ScheduleCard';
import { CalendarGrid } from '../../../components/schedules/CalendarGrid';
import { ResolveScheduleModal } from '../../../components/schedules/ResolveScheduleModal';
import { CancelScheduleModal } from '../../../components/schedules/CancelScheduleModal';
import { ScheduleModal } from '../../../components/schedules/ScheduleModal';
import { computePollInterval, filterSchedules } from '../../../lib/schedule-utils';

export default function SchedulesPage() {
  const [viewMode, setViewMode] = useState<'CALENDAR' | 'LIST'>('CALENDAR');
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'UPCOMING' | 'PUBLISHED' | 'ATTENTION' | 'CANCELLED'>('ALL');
  const [posts, setPosts] = useState<ScheduledPostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date>(new Date());
  const isFetchingRef = useRef(false);

  // Modals state
  const [resolvingPost, setResolvingPost] = useState<ScheduledPostItem | null>(null);
  const [cancellingPost, setCancellingPost] = useState<ScheduledPostItem | null>(null);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedCalendarDate, setSelectedCalendarDate] = useState<Date | undefined>(undefined);
  const [readyDrafts, setReadyDrafts] = useState<any[]>([]);
  const [selectedDraftForSchedule, setSelectedDraftForSchedule] = useState<any | null>(null);

  const fetchSchedules = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!silent) setIsLoading(true);
      const res = await apiClient.get<{ data: ScheduledPostItem[] }>('/content/schedules?limit=50');
      setPosts(res.data || []);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Failed to load schedules', err);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setIsLoading(false);
    }
  };

  const fetchReadyDrafts = async () => {
    try {
      const res = await apiClient.get<{ data: any[] }>('/content/drafts?limit=20');
      setReadyDrafts(res.data || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSchedules();
    fetchReadyDrafts();
  }, []);

  // Adaptive Live Sync Polling
  useEffect(() => {
    if (!autoRefresh) return;

    const pollIntervalMs = computePollInterval(posts);

    const timer = setInterval(() => {
      fetchSchedules(true);
    }, pollIntervalMs);

    return () => clearInterval(timer);
  }, [autoRefresh, posts]);

  // Compute metrics
  const upcomingCount = posts.filter((p) =>
    ['SCHEDULED', 'CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'].includes(p.status),
  ).length;
  const publishedCount = posts.filter((p) => p.status === 'PUBLISHED').length;
  const attentionCount = posts.filter((p) =>
    ['RECOVERY_REQUIRED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(p.status),
  ).length;

  // Filter posts for List view
  const filteredPosts = filterSchedules(posts, activeFilter, searchQuery);

  const handleOpenScheduleForDate = (date: Date) => {
    setSelectedCalendarDate(date);
    if (readyDrafts.length > 0) {
      setSelectedDraftForSchedule(readyDrafts[0]);
      setIsScheduleModalOpen(true);
    } else {
      window.location.href = '/create';
    }
  };

  return (
    <div className="min-h-screen bg-ink-900">
      <TopBar title="Publishing Calendar & Schedules" />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Top Header & View Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white font-display">Publishing Pipeline</h1>
            <p className="text-xs text-white/50 mt-1">
              Automated multi-account Threads publishing with fail-safe recovery & quota arbitration.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-white/10 bg-ink-850 p-1">
              <button
                onClick={() => setViewMode('CALENDAR')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'CALENDAR'
                    ? 'bg-coral-500 text-white shadow-glow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Calendar</span>
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'LIST'
                    ? 'bg-coral-500 text-white shadow-glow'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <ListFilter className="h-3.5 w-3.5" />
                <span>List View</span>
              </button>
            </div>

            {/* Live Sync Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                autoRefresh
                  ? 'border-lime-500/30 bg-lime-500/10 text-lime-300 hover:bg-lime-500/20'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
              }`}
              title={autoRefresh ? 'Live Sync Active: Click to pause polling' : 'Live Sync Paused: Click to resume polling'}
            >
              <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-lime-400 animate-pulse' : 'bg-white/30'}`} />
              <span>{autoRefresh ? 'Live Sync' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchSchedules()}
              disabled={isLoading}
              className="rounded-xl border border-white/10 bg-ink-850 p-2 text-white/60 hover:border-white/20 hover:text-white transition-colors"
              title="Refresh schedules"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* New Schedule Button */}
            <Link
              href="/create"
              className="btn-primary flex items-center gap-2 text-xs py-2 px-4 shadow-glow"
            >
              <Plus className="h-4 w-4" />
              <span>Draft & Schedule</span>
            </Link>
          </div>
        </div>

        {/* Metrics Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass-card p-5 rounded-2xl border border-cyan-500/20 bg-ink-850/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300">
                Upcoming Queue
              </div>
              <div className="text-2xl font-black text-white mt-1 font-display">{upcomingCount}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="glass-card p-5 rounded-2xl border border-lime-500/20 bg-ink-850/80 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-lime-300">
                Successfully Published
              </div>
              <div className="text-2xl font-black text-white mt-1 font-display">{publishedCount}</div>
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-lime-500/10 border border-lime-500/20 text-lime-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div
            className={`glass-card p-5 rounded-2xl border flex items-center justify-between transition-all ${
              attentionCount > 0
                ? 'border-violet-500/40 bg-violet-950/20 shadow-glow-violet'
                : 'border-white/[0.08] bg-ink-850/80'
            }`}
          >
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-violet-300">
                Attention Required
              </div>
              <div className="text-2xl font-black text-white mt-1 font-display">{attentionCount}</div>
            </div>
            <div
              className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                attentionCount > 0
                  ? 'bg-violet-500/20 border border-violet-500/30 text-violet-300 animate-pulse'
                  : 'bg-white/5 text-white/40'
              }`}
            >
              <ShieldAlert className="h-5 w-5" />
            </div>
          </div>
        </div>

        {/* View Content */}
        {viewMode === 'CALENDAR' ? (
          <div className="space-y-4">
            <CalendarGrid
              posts={posts}
              onSelectPost={(post) => {
                if (post.status === 'RECOVERY_REQUIRED') {
                  setResolvingPost(post);
                } else if (['SCHEDULED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE'].includes(post.status)) {
                  setCancellingPost(post);
                }
              }}
              onDayClick={handleOpenScheduleForDate}
            />
          </div>
        ) : (
          <div className="space-y-4">
            {/* List Controls: Tabs & Search */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  onClick={() => setActiveFilter('ALL')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'ALL'
                      ? 'bg-white/15 text-white font-bold'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  All ({posts.length})
                </button>
                <button
                  onClick={() => setActiveFilter('UPCOMING')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'UPCOMING'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Upcoming ({upcomingCount})
                </button>
                <button
                  onClick={() => setActiveFilter('PUBLISHED')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'PUBLISHED'
                      ? 'bg-lime-500/20 text-lime-300 border border-lime-500/30 font-bold'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Published ({publishedCount})
                </button>
                <button
                  onClick={() => setActiveFilter('ATTENTION')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'ATTENTION'
                      ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40 font-bold'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Attention Needed ({attentionCount})
                </button>
                <button
                  onClick={() => setActiveFilter('CANCELLED')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'CANCELLED'
                      ? 'bg-white/10 text-white font-bold'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Cancelled
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts or accounts..."
                  className="input-base pl-9 py-2 text-xs w-64"
                />
              </div>
            </div>

            {/* List Cards */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/40 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-coral-500" />
                <span className="text-xs font-medium">Loading publishing queue...</span>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-3xl border border-white/[0.08] bg-ink-850 p-12 text-center space-y-3 shadow-card-elevated">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto">
                  <CalendarIcon className="h-6 w-6" />
                </div>
                <h3 className="text-sm font-bold text-white">No schedules found</h3>
                <p className="text-xs text-white/50 max-w-sm mx-auto">
                  {searchQuery
                    ? 'No posts matched your current search filters.'
                    : 'There are no posts currently in this state. Draft and schedule posts in Content Studio.'}
                </p>
                <Link
                  href="/create"
                  className="btn-primary text-xs py-2 px-4 mt-2 inline-flex items-center gap-1.5"
                >
                  <PenSquare className="h-3.5 w-3.5" />
                  <span>Go to Content Studio</span>
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredPosts.map((post) => (
                  <ScheduleCard
                    key={post.id}
                    post={post}
                    onResolveClick={(p) => setResolvingPost(p)}
                    onCancelClick={(p) => setCancellingPost(p)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Operator Resolution Modal */}
      {resolvingPost && (
        <ResolveScheduleModal
          isOpen={true}
          onClose={() => setResolvingPost(null)}
          scheduledPost={resolvingPost}
          onResolved={() => {
            fetchSchedules();
            setResolvingPost(null);
          }}
        />
      )}

      {/* Cancellation Confirmation Modal */}
      {cancellingPost && (
        <CancelScheduleModal
          isOpen={true}
          onClose={() => setCancellingPost(null)}
          scheduledPost={cancellingPost}
          onCancelled={() => {
            fetchSchedules();
            setCancellingPost(null);
          }}
        />
      )}

      {/* Schedule Modal from Day Click */}
      {isScheduleModalOpen && selectedDraftForSchedule && (
        <ScheduleModal
          isOpen={true}
          onClose={() => setIsScheduleModalOpen(false)}
          draftId={selectedDraftForSchedule.id}
          draftTopic={selectedDraftForSchedule.topic}
          draftBody={selectedDraftForSchedule.currentVersion?.body || ''}
          draftStatus={selectedDraftForSchedule.status}
          initialDate={selectedCalendarDate}
          onScheduled={() => {
            fetchSchedules();
            setIsScheduleModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
