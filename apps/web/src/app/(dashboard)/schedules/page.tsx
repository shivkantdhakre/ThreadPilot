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
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

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
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Publishing Calendar"
        subtitle="Schedule orchestrator with automated fail-safe recovery"
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/create"
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-subtle"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Draft & Schedule</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex rounded-xl border border-canvas-border bg-white p-1 shadow-subtle">
              <button
                onClick={() => setViewMode('CALENDAR')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'CALENDAR'
                    ? 'bg-paper text-text-primary shadow-subtle'
                    : 'text-text-muted hover:text-text-primary'
                }`}
              >
                <CalendarIcon className="h-3.5 w-3.5" />
                <span>Calendar</span>
              </button>
              <button
                onClick={() => setViewMode('LIST')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                  viewMode === 'LIST'
                    ? 'bg-paper text-text-primary shadow-subtle'
                    : 'text-text-muted hover:text-text-primary'
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
                  ? 'border-lime-200 bg-lime-50 text-lime-800'
                  : 'border-canvas-border bg-white text-text-muted hover:text-text-primary'
              }`}
              title={autoRefresh ? 'Live Sync Active: Click to pause polling' : 'Live Sync Paused: Click to resume polling'}
            >
              <span className={`h-2 w-2 rounded-full ${autoRefresh ? 'bg-lime-500 animate-pulse' : 'bg-text-muted/40'}`} />
              <span>{autoRefresh ? 'Live Sync' : 'Paused'}</span>
            </button>

            {/* Manual Refresh */}
            <button
              onClick={() => fetchSchedules()}
              disabled={isLoading}
              className="rounded-xl border border-canvas-border bg-white p-2 text-text-secondary hover:text-text-primary hover:border-canvas-border-muted transition-colors shadow-subtle"
              title="Refresh schedules"
              aria-label="Refresh schedules"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
            </button>
          </div>
        </div>

        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Upcoming in Queue"
            value={upcomingCount}
            meta="Awaiting scheduled time window"
            icon={Clock}
            accent="cyan"
          />

          <MetricCard
            label="Successfully Published"
            value={publishedCount}
            meta="Dispatched to connected accounts"
            icon={CheckCircle2}
            accent="lime"
          />

          <MetricCard
            label="Attention Required"
            value={attentionCount}
            meta={attentionCount > 0 ? 'Requires operator resolution' : 'All schedules nominal'}
            icon={ShieldAlert}
            accent={attentionCount > 0 ? 'violet' : 'neutral'}
          />
        </div>

        {/* View Mode Content */}
        {viewMode === 'CALENDAR' ? (
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
        ) : (
          <div className="space-y-4">
            {/* List Controls: Tabs & Search */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-canvas-border pb-4">
              <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                <button
                  onClick={() => setActiveFilter('ALL')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'ALL'
                      ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  All ({posts.length})
                </button>
                <button
                  onClick={() => setActiveFilter('UPCOMING')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'UPCOMING'
                      ? 'bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Upcoming ({upcomingCount})
                </button>
                <button
                  onClick={() => setActiveFilter('PUBLISHED')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'PUBLISHED'
                      ? 'bg-lime-50 text-lime-800 border border-lime-200 font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Published ({publishedCount})
                </button>
                <button
                  onClick={() => setActiveFilter('ATTENTION')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'ATTENTION'
                      ? 'bg-violet-50 text-violet-800 border border-violet-200 font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Attention ({attentionCount})
                </button>
                <button
                  onClick={() => setActiveFilter('CANCELLED')}
                  className={`rounded-xl px-3 py-1.5 transition-colors ${
                    activeFilter === 'CANCELLED'
                      ? 'bg-soft-gray text-text-primary border border-canvas-border font-bold'
                      : 'text-text-muted hover:text-text-primary'
                  }`}
                >
                  Cancelled
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-text-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts or accounts..."
                  className="input-base pl-9 py-2 text-xs w-64 shadow-subtle"
                />
              </div>
            </div>

            {/* List Cards */}
            {isLoading ? (
              <div className="py-16">
                <ThreadPilotLoader message="Loading publishing schedules..." />
              </div>
            ) : filteredPosts.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="No schedules found"
                description={
                  searchQuery
                    ? 'No posts matched your current search filters.'
                    : 'There are no posts currently in this state. Draft and schedule posts from the Content Studio.'
                }
                actionLabel="Go to Content Studio"
                actionHref="/create"
                actionIcon={PenSquare}
                accent="cyan"
              />
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
