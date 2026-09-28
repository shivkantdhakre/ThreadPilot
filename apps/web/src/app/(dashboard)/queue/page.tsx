'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  ListOrdered,
  Clock,
  ShieldAlert,
  RotateCw,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Search,
  PenSquare,
  ArrowRight,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { ScheduleCard, ScheduledPostItem } from '../../../components/schedules/ScheduleCard';
import { ResolveScheduleModal } from '../../../components/schedules/ResolveScheduleModal';
import { CancelScheduleModal } from '../../../components/schedules/CancelScheduleModal';
import { computePollInterval } from '../../../lib/schedule-utils';
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

export default function QueuePage() {
  const [posts, setPosts] = useState<ScheduledPostItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'UPCOMING' | 'IN_FLIGHT' | 'ATTENTION' | 'ALL'>('UPCOMING');
  const [resolvingPost, setResolvingPost] = useState<ScheduledPostItem | null>(null);
  const [cancellingPost, setCancellingPost] = useState<ScheduledPostItem | null>(null);
  const isFetchingRef = useRef(false);

  const fetchQueue = async (silent = false) => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      if (!silent) setIsLoading(true);
      const res = await apiClient.get<{ data: ScheduledPostItem[] }>('/content/schedules?limit=50&order=asc');
      setPosts(res.data || []);
    } catch (err) {
      console.error('Failed to load queue', err);
    } finally {
      isFetchingRef.current = false;
      if (!silent) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
  }, []);

  // Adaptive polling
  useEffect(() => {
    const pollIntervalMs = computePollInterval(posts);
    const timer = setInterval(() => {
      fetchQueue(true);
    }, pollIntervalMs);
    return () => clearInterval(timer);
  }, [posts]);

  // Compute states
  const inFlightPosts = posts.filter((p) =>
    ['CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'].includes(p.status),
  );
  const upcomingPosts = posts.filter((p) => p.status === 'SCHEDULED');
  const attentionPosts = posts.filter((p) =>
    ['RECOVERY_REQUIRED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(p.status),
  );

  const filteredPosts = posts.filter((p) => {
    if (activeTab === 'UPCOMING' && p.status !== 'SCHEDULED') return false;
    if (activeTab === 'IN_FLIGHT' && !['CLAIMED', 'CREATING_CONTAINER', 'CONTAINER_CREATED', 'PUBLISHING'].includes(p.status))
      return false;
    if (
      activeTab === 'ATTENTION' &&
      !['RECOVERY_REQUIRED', 'QUOTA_BLOCKED', 'FAILED_RETRYABLE', 'AUTH_REQUIRED'].includes(p.status)
    )
      return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const body = p.contentSnapshot?.body?.toLowerCase() || '';
      const user = p.socialAccount?.username?.toLowerCase() || '';
      return body.includes(q) || user.includes(q);
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Publishing Queue"
        subtitle="Active pipeline telemetry and automated dispatch sequence"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchQueue()}
              disabled={isLoading}
              className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary transition-colors shadow-subtle"
              title="Refresh queue"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
            </button>
            <Link
              href="/create"
              className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-subtle"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Queue Post</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="In-Flight Dispatching"
            value={inFlightPosts.length}
            meta={inFlightPosts.length > 0 ? 'Publishing container active' : 'Quiescent'}
            icon={RotateCw}
            accent="coral"
          />

          <MetricCard
            label="Scheduled Ahead"
            value={upcomingPosts.length}
            meta="Awaiting target time window"
            icon={Clock}
            accent="cyan"
          />

          <MetricCard
            label="Attention Required"
            value={attentionPosts.length}
            meta={attentionPosts.length > 0 ? 'Action required by creator' : 'Zero pipeline bottlenecks'}
            icon={ShieldAlert}
            accent={attentionPosts.length > 0 ? 'violet' : 'neutral'}
          />
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-canvas-border pb-4">
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('UPCOMING')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'UPCOMING'
                  ? 'bg-cyan-50 text-cyan-800 border border-cyan-200 font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Scheduled ({upcomingPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('IN_FLIGHT')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'IN_FLIGHT'
                  ? 'bg-coral-50 text-coral-700 border border-coral-200 font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              In-Flight ({inFlightPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('ATTENTION')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'ATTENTION'
                  ? 'bg-violet-50 text-violet-800 border border-violet-200 font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Attention Needed ({attentionPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('ALL')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              All Items ({posts.length})
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search queue content..."
              className="input-base pl-9 py-2 text-xs w-64 shadow-subtle"
            />
          </div>
        </div>

        {/* Content List */}
        {isLoading ? (
          <div className="py-16">
            <ThreadPilotLoader message="Polling active publishing queue..." />
          </div>
        ) : filteredPosts.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="Publishing queue is clear"
            description="There are no items currently in this queue state. Draft posts and set publication windows in Content Studio."
            actionLabel="Open Studio"
            actionHref="/create"
            actionIcon={PenSquare}
            accent="coral"
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

      {resolvingPost && (
        <ResolveScheduleModal
          isOpen={true}
          onClose={() => setResolvingPost(null)}
          scheduledPost={resolvingPost}
          onResolved={() => {
            fetchQueue();
            setResolvingPost(null);
          }}
        />
      )}

      {cancellingPost && (
        <CancelScheduleModal
          isOpen={true}
          onClose={() => setCancellingPost(null)}
          scheduledPost={cancellingPost}
          onCancelled={() => {
            fetchQueue();
            setCancellingPost(null);
          }}
        />
      )}
    </div>
  );
}
