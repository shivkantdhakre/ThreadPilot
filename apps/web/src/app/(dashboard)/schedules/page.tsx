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
      // If no drafts exist, navigate to create
      window.location.href = '/create';
    }
  };

  return (
    <div>
      <TopBar title="Publishing Calendar & Schedules" />

      <div className="p-8 max-w-7xl mx-auto space-y-6">
        {/* Top Header & View Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Publishing Pipeline</h1>
            <p className="text-xs text-white/50 mt-1">
              Automated multi-account Threads publishing with fail-safe recovery & quota arbitration.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-white/10 bg-slate-900 p-1">
              <button
                onClick={() => setViewMode('CALENDAR')}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'CALENDAR'
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Calendar</span>
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  viewMode === 'LIST'
                    ? 'bg-brand-500 text-white shadow-sm'
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
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-white/10 bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/70'
              }`}
              title={autoRefresh ? 'Live Sync Active: Click to pause polling' : 'Live Sync Paused: Click to resume polling'}
            >
              <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-white/30'}`} />
              <span>{autoRefresh ? 'Live Sync' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchSchedules()}
              disabled={isLoading}
              className="rounded-xl border border-white/10 bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white transition-colors"
              title="Refresh schedules"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            {/* New Schedule Button */}
            <Link
              href="/create"
              className="btn-primary flex items-center gap-2 text-xs py-2 px-3.5 shadow-lg shadow-brand-500/20"
            >
              <Plus className="h-4 w-4" />
              <span>Draft & Schedule</span>
            </Link>
          </div>
        </div>

        {/* Metrics Summary Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-2xl border border-blue-500/20 bg-blue-950/20 p-4 backdrop-blur-xl flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-blue-300/70">
                Upcoming Queue
              </div>
              <div className="text-2xl font-black text-white mt-0.5">{upcomingCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
              <Clock className="h-5 w-5" />
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-4 backdrop-blur-xl flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-300/70">
                Successfully Published
              </div>
              <div className="text-2xl font-black text-white mt-0.5">{publishedCount}</div>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>

          <div
            className={`rounded-2xl border p-4 backdrop-blur-xl flex items-center justify-between transition-all ${
              attentionCount > 0
                ? 'border-purple-500/40 bg-purple-950/30 shadow-lg shadow-purple-950/40'
                : 'border-white/10 bg-slate-900/60'
            }`}
          >
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wider text-purple-300/70">
                Attention Required
              </div>
              <div className="text-2xl font-black text-white mt-0.5">{attentionCount}</div>
            </div>
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                attentionCount > 0
                  ? 'bg-purple-500/30 text-purple-300 animate-pulse'
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
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
              {/* Filter Tabs */}
              <div className="flex flex-wrap gap-2 text-xs font-semibold">
                <button
                  onClick={() => setActiveFilter('ALL')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeFilter === 'ALL'
                      ? 'bg-white/15 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  All ({posts.length})
                </button>
                <button
                  onClick={() => setActiveFilter('UPCOMING')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeFilter === 'UPCOMING'
                      ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Upcoming ({upcomingCount})
                </button>
                <button
                  onClick={() => setActiveFilter('PUBLISHED')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeFilter === 'PUBLISHED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Published ({publishedCount})
                </button>
                <button
                  onClick={() => setActiveFilter('ATTENTION')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeFilter === 'ATTENTION'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Attention Needed ({attentionCount})
                </button>
                <button
                  onClick={() => setActiveFilter('CANCELLED')}
                  className={`rounded-lg px-3 py-1.5 transition-colors ${
                    activeFilter === 'CANCELLED'
                      ? 'bg-white/10 text-white'
                      : 'text-white/50 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  Cancelled
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-white/30" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts or accounts..."
                  className="rounded-xl border border-white/10 bg-slate-900/80 pl-9 pr-3.5 py-1.5 text-xs text-white placeholder:text-white/30 focus:border-brand-500 focus:outline-none w-64"
                />
              </div>
            </div>

            {/* List Cards */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-white/40 space-y-3">
                <Loader2 className="h-6 w-6 animate-spin text-brand-400" />
                <span className="text-xs">Loading publishing queue...</span>
              </div>
            ) : filteredPosts.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-12 text-center space-y-3">
                <CalendarIcon className="h-8 w-8 mx-auto text-white/20" />
                <h3 className="text-sm font-semibold text-white">No schedules found</h3>
                <p className="text-xs text-white/50 max-w-sm mx-auto">
                  {searchQuery
                    ? 'No posts matched your current search filters.'
                    : 'There are no posts currently in this state. Draft and schedule posts in Content Studio.'}
                </p>
                <Link
                  href="/create"
                  className="inline-flex items-center gap-2 btn-primary text-xs py-2 px-3 mt-2"
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
