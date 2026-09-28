'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Sparkles,
  Send,
  Heart,
  CheckCircle2,
  Clock,
  User,
  RefreshCw,
  AtSign,
  ArrowUpRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

interface ConversationItem {
  id: string;
  authorUsername: string;
  authorDisplayName: string;
  postSnippet: string;
  userComment: string;
  timestamp: string;
  priority: 'HIGH' | 'QUESTION' | 'STANDARD';
  replied: boolean;
}

export default function RepliesPage() {
  const [account, setAccount] = useState<any>(null);
  const [publishedPosts, setPublishedPosts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedConversationId, setSelectedConversationId] = useState<string>('conv-1');
  const [replyText, setReplyText] = useState('');
  const [isGeneratingReply, setIsGeneratingReply] = useState(false);
  const [repliedIds, setRepliedIds] = useState<string[]>([]);

  useEffect(() => {
    async function load() {
      setIsLoading(true);
      try {
        const [accRes, schedRes] = await Promise.allSettled([
          apiClient.get<{ accounts: any[] }>('/threads-auth/status'),
          apiClient.get<{ data: any[] }>('/content/schedules?status=PUBLISHED&limit=10'),
        ]);

        if (accRes.status === 'fulfilled') {
          setAccount(accRes.value.accounts?.[0] || null);
        }
        if (schedRes.status === 'fulfilled') {
          setPublishedPosts(schedRes.value.data || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
    load();
  }, []);

  // Conversational items
  const conversations: ConversationItem[] = [
    {
      id: 'conv-1',
      authorUsername: 'alex_builds',
      authorDisplayName: 'Alex Rivera',
      postSnippet: publishedPosts[0]?.contentSnapshot?.body || 'Building in public on Threads requires high consistency.',
      userComment: 'How are you balancing depth vs. short hooks? Most short hooks feel like clickbait nowadays.',
      timestamp: '14m ago',
      priority: 'QUESTION',
      replied: repliedIds.includes('conv-1'),
    },
    {
      id: 'conv-2',
      authorUsername: 'sarah_dev',
      authorDisplayName: 'Sarah Lin',
      postSnippet: publishedPosts[1]?.contentSnapshot?.body || 'Our autonomous publishing pipeline arbitrates quota safely.',
      userComment: 'Love this breakdown! Does the Graph API have webhooks for real-time replies yet?',
      timestamp: '1h ago',
      priority: 'HIGH',
      replied: repliedIds.includes('conv-2'),
    },
    {
      id: 'conv-3',
      authorUsername: 'marcus_ai',
      authorDisplayName: 'Marcus Vance',
      postSnippet: publishedPosts[0]?.contentSnapshot?.body || 'Personal voice modeling is 10x better than generic AI writing.',
      userComment: 'Bookmarked. The 8-dimensional vector approach is way more rigorous than basic prompt stuffing.',
      timestamp: '3h ago',
      priority: 'STANDARD',
      replied: repliedIds.includes('conv-3'),
    },
  ];

  const selectedConv = conversations.find((c) => c.id === selectedConversationId) || conversations[0];

  const handleGenerateReply = (tone: 'direct' | 'thoughtful' | 'expand') => {
    setIsGeneratingReply(true);
    setTimeout(() => {
      if (tone === 'direct') {
        setReplyText(
          `Great question. The key is making the first line an actual contrarian truth rather than empty suspense. Give the core insight immediately.`
        );
      } else if (tone === 'thoughtful') {
        setReplyText(
          `Completely agree with this tension. We tune our style profile to prioritize high-signal takeaway density over artificial curiosity gaps.`
        );
      } else {
        setReplyText(
          `Appreciate the feedback! We're writing up an architectural deep dive on this specific pattern next week.`
        );
      }
      setIsGeneratingReply(false);
    }, 600);
  };

  const handleSendReply = () => {
    if (!replyText.trim() || !selectedConv) return;
    setRepliedIds((prev) => [...prev, selectedConv.id]);
    setReplyText('');
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Replies & Social Engagement"
        subtitle="Conversational workspace for community discussions and voice-aligned replies"
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-6">
        {/* Top Status & Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Inbound Discussion Threads"
            value={conversations.length}
            meta="Active Threads conversations"
            icon={MessageSquare}
            accent="coral"
          />

          <MetricCard
            label="Replied Rate"
            value={`${Math.round((repliedIds.length / conversations.length) * 100)}%`}
            meta="Audience engagement response"
            icon={CheckCircle2}
            accent="lime"
          />

          <MetricCard
            label="Active Connected Identity"
            value={account ? `@${account.username}` : 'Not Linked'}
            meta="Verified Meta Graph API Account"
            icon={AtSign}
            accent="cyan"
          />
        </div>

        {/* Social Workspace: 2 Columns */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Column: Conversations List (5 cols) */}
          <div className="lg:col-span-5 card-base p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                Inbound Conversations
              </h3>
              <span className="badge-neutral text-[10px] font-mono">
                {conversations.length} discussions
              </span>
            </div>

            <div className="divide-y divide-canvas-border max-h-[560px] overflow-y-auto">
              {conversations.map((conv) => {
                const isSelected = conv.id === selectedConversationId;
                return (
                  <button
                    key={conv.id}
                    onClick={() => setSelectedConversationId(conv.id)}
                    className={`w-full p-3.5 text-left rounded-xl transition-all duration-150 space-y-2 ${
                      isSelected
                        ? 'bg-paper border border-canvas-border shadow-subtle'
                        : 'hover:bg-soft-gray/60'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <div className="h-6 w-6 rounded-full bg-gradient-to-tr from-coral-500 to-amber-500 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          {conv.authorDisplayName.slice(0, 1)}
                        </div>
                        <span className="text-xs font-bold text-text-primary truncate">
                          {conv.authorDisplayName}
                        </span>
                        <span className="text-[11px] text-text-muted truncate">
                          @{conv.authorUsername}
                        </span>
                      </div>

                      <span className="text-[10px] text-text-muted font-mono shrink-0">
                        {conv.timestamp}
                      </span>
                    </div>

                    <p className="text-xs text-text-secondary line-clamp-2 leading-relaxed font-normal">
                      "{conv.userComment}"
                    </p>

                    <div className="flex items-center justify-between pt-1 text-[10px]">
                      {conv.priority === 'QUESTION' ? (
                        <span className="badge-violet text-[9px] py-0.5">Question</span>
                      ) : conv.priority === 'HIGH' ? (
                        <span className="badge-coral text-[9px] py-0.5">High Signal</span>
                      ) : (
                        <span className="badge-neutral text-[9px] py-0.5">Engagement</span>
                      )}

                      {conv.replied && (
                        <span className="text-lime-700 font-semibold flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" /> Replied
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Column: Conversation Thread & AI Reply Composer (7 cols) */}
          <div className="lg:col-span-7 space-y-5">
            {selectedConv ? (
              <div className="card-base p-6 space-y-5">
              <div className="border-b border-canvas-border pb-4 space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-text-muted">
                  Your Original Thread
                </span>
                <p className="text-xs sm:text-sm text-text-primary italic leading-relaxed bg-paper/70 p-3.5 rounded-xl border border-canvas-border">
                  "{selectedConv.postSnippet}"
                </p>
              </div>

              {/* User Comment Box */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-full bg-gradient-to-tr from-cyan-500 to-violet-600 flex items-center justify-center text-sm font-bold text-white shadow-sm">
                      {selectedConv.authorDisplayName.slice(0, 1)}
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        {selectedConv.authorDisplayName}{' '}
                        <span className="font-normal text-text-muted">@{selectedConv.authorUsername}</span>
                      </div>
                      <div className="text-[11px] text-text-muted font-mono">{selectedConv.timestamp}</div>
                    </div>
                  </div>

                  <span className="badge-coral text-[10px]">Direct Reply</span>
                </div>

                <div className="rounded-2xl border border-canvas-border bg-white p-4 text-xs sm:text-sm text-text-primary leading-relaxed font-sans shadow-subtle">
                  {selectedConv.userComment}
                </div>
              </div>

              {/* Contextual AI Reply Presets */}
              <div className="pt-2 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 text-violet-600" />
                    <span>AI Reply Assistance</span>
                  </span>
                  <span className="text-[10px] text-text-muted font-mono">Personal Voice Aligned</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleGenerateReply('direct')}
                    disabled={isGeneratingReply}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Zap className="h-3 w-3 text-coral-600" />
                    <span>Direct Answer</span>
                  </button>

                  <button
                    onClick={() => handleGenerateReply('thoughtful')}
                    disabled={isGeneratingReply}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <Sparkles className="h-3 w-3 text-violet-600" />
                    <span>Thoughtful Stance</span>
                  </button>

                  <button
                    onClick={() => handleGenerateReply('expand')}
                    disabled={isGeneratingReply}
                    className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1"
                  >
                    <span>Acknowledge & Expand</span>
                  </button>
                </div>
              </div>

              {/* Reply Textarea & Dispatch */}
              <div className="space-y-3 pt-2">
                <textarea
                  rows={4}
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  placeholder={`Write an authentic reply to @${selectedConv.authorUsername} (under 500 chars)...`}
                  className="input-base text-xs sm:text-sm resize-none"
                />

                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-mono text-[11px]">
                    {replyText.length} / 500 chars
                  </span>

                  <button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isGeneratingReply}
                    className="btn-primary text-xs py-2 px-4 flex items-center gap-1.5 shadow-subtle disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Reply on Threads</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-base p-12 text-center">
              <MessageSquare className="h-8 w-8 text-text-muted mx-auto mb-3" />
              <h3 className="text-sm font-bold text-text-primary">Select a Conversation</h3>
              <p className="text-xs text-text-muted mt-1">
                Choose an inbound response from the list to view context and draft an authentic reply.
              </p>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
