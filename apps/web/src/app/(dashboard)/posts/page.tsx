'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Layers,
  Search,
  ExternalLink,
  Sparkles,
  RefreshCw,
  Clock,
  CheckCircle2,
  Share2,
  PenSquare,
  Copy,
  Check,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

export default function PostsPage() {
  const [ingestedPosts, setIngestedPosts] = useState<any[]>([]);
  const [publishedPosts, setPublishedPosts] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'ALL' | 'INGESTED' | 'PUBLISHED'>('ALL');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchPosts = async () => {
    setIsLoading(true);
    try {
      const [ingestRes, schedRes] = await Promise.allSettled([
        apiClient.get<{ data?: any[]; meta?: { total?: number } }>('/ingestion/posts?limit=50'),
        apiClient.get<{ data?: any[] }>('/content/schedules?status=PUBLISHED&limit=50&order=desc'),
      ]);

      const ingested = ingestRes.status === 'fulfilled' ? (Array.isArray(ingestRes.value) ? ingestRes.value : ingestRes.value?.data || []) : [];
      const totalIngested = ingestRes.status === 'fulfilled' && !Array.isArray(ingestRes.value) ? ingestRes.value?.meta?.total || ingested.length : ingested.length;
      const published = schedRes.status === 'fulfilled' ? schedRes.value?.data || [] : [];

      setIngestedPosts(ingested);
      setPublishedPosts(published);
      setTotalCount(totalIngested + published.length);
    } catch (err) {
      console.error('Failed to load posts library', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPosts();
  }, []);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Combine and format
  const allPosts = [
    ...publishedPosts.map((p) => ({
      id: p.id,
      text: p.contentSnapshot?.body || '',
      hook: p.contentSnapshot?.hook,
      date: p.publishedAt || p.scheduledAt,
      username: p.socialAccount?.username || 'threads_user',
      source: 'PUBLISHED_THREADPILOT',
      permalink: p.socialAccount?.username ? `https://www.threads.net/@${p.socialAccount.username}` : undefined,
    })),
    ...ingestedPosts.map((p) => ({
      id: p.id || p.externalId,
      text: p.text || p.content || '',
      hook: null,
      date: p.publishedAt || p.timestamp || p.createdAt,
      username: p.username || 'threads_user',
      source: 'INGESTED_THREADS',
      permalink: p.permalink,
    })),
  ];

  const filteredPosts = allPosts.filter((item) => {
    if (activeTab === 'INGESTED' && item.source !== 'INGESTED_THREADS') return false;
    if (activeTab === 'PUBLISHED' && item.source !== 'PUBLISHED_THREADPILOT') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.text.toLowerCase().includes(q) || item.username.toLowerCase().includes(q);
    }

    return true;
  });

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Posts Library"
        subtitle="Historical Threads timeline, indexed memories, and published content"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={fetchPosts}
              disabled={isLoading}
              className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary transition-colors shadow-subtle"
              title="Refresh posts"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
            </button>
            <Link
              href="/create"
              className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-subtle"
            >
              <PenSquare className="h-3.5 w-3.5" />
              <span>Compose Post</span>
            </Link>
          </div>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Metrics Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MetricCard
            label="Total Library Memory"
            value={totalCount}
            meta="Combined Threads graph and local dispatches"
            icon={Layers}
            accent="cyan"
          />

          <MetricCard
            label="Dispatched via ThreadPilot"
            value={publishedPosts.length}
            meta="Published through autonomous pipeline"
            icon={CheckCircle2}
            accent="lime"
          />

          <MetricCard
            label="Indexed for Style Learning"
            value={ingestedPosts.length}
            meta="Used in few-shot vector context"
            icon={Sparkles}
            accent="violet"
          />
        </div>

        {/* Filter Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-canvas-border pb-4">
          <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
            <button
              onClick={() => setActiveTab('ALL')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'ALL'
                  ? 'bg-paper text-text-primary border border-canvas-border shadow-subtle font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              All Posts ({allPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('PUBLISHED')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'PUBLISHED'
                  ? 'bg-lime-50 text-lime-800 border border-lime-200 font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Dispatched ({publishedPosts.length})
            </button>
            <button
              onClick={() => setActiveTab('INGESTED')}
              className={`rounded-xl px-3 py-1.5 transition-colors ${
                activeTab === 'INGESTED'
                  ? 'bg-violet-50 text-violet-800 border border-violet-200 font-bold'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              Historical Ingested ({ingestedPosts.length})
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-3 h-3.5 w-3.5 text-text-muted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search posts by keyword..."
              className="input-base pl-9 py-2 text-xs w-64 shadow-subtle"
            />
          </div>
        </div>

        {/* Posts Content */}
        {isLoading ? (
          <div className="py-16">
            <ThreadPilotLoader message="Loading posts library..." />
          </div>
        ) : filteredPosts.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No posts found"
            description={
              searchQuery
                ? 'No posts matched your search keyword.'
                : 'Connect your Threads profile to automatically ingest past posts, or draft your first post in the studio.'
            }
            actionLabel="Connect Threads"
            actionHref="/connect"
            actionIcon={Share2}
            accent="cyan"
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredPosts.map((post) => {
              const charCount = post.text.length;
              return (
                <div
                  key={post.id}
                  className="card-base p-5 flex flex-col justify-between space-y-3 hover:border-canvas-border-muted transition-all"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-text-primary">
                          @{post.username}
                        </span>
                        {post.source === 'PUBLISHED_THREADPILOT' ? (
                          <span className="badge-lime text-[10px] py-0.5">
                            <CheckCircle2 className="h-3 w-3" /> Dispatched
                          </span>
                        ) : (
                          <span className="badge-violet text-[10px] py-0.5">
                            <Sparkles className="h-3 w-3" /> Memory Vector
                          </span>
                        )}
                      </div>

                      <span className="text-[11px] font-mono text-text-muted">
                        {post.date ? new Date(post.date).toLocaleDateString() : 'Historical'}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-text-primary leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">
                      {post.text || '(Empty post content)'}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-canvas-border flex items-center justify-between text-xs text-text-muted">
                    <span className="font-mono text-[11px]">
                      {charCount} / 500 chars
                    </span>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCopy(post.id, post.text)}
                        className="p-1 rounded-lg hover:bg-soft-gray hover:text-text-primary transition-colors text-text-muted"
                        title="Copy post text"
                      >
                        {copiedId === post.id ? (
                          <Check className="h-3.5 w-3.5 text-lime-600" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </button>

                      {post.permalink && (
                        <a
                          href={post.permalink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 rounded-lg hover:bg-soft-gray hover:text-text-primary transition-colors text-text-muted"
                          title="View on Threads"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}

                      <Link
                        href={`/create?topic=${encodeURIComponent(post.text.slice(0, 100))}`}
                        className="text-xs font-semibold text-coral-600 hover:text-coral-700 ml-1 transition-colors"
                      >
                        Spin off &rarr;
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
