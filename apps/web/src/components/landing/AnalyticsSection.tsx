'use client';

import React from 'react';
import Link from 'next/link';
import { TrendingUp, ArrowRight, BarChart3, ArrowUpRight } from 'lucide-react';
import { analyticsData } from '../../data/threadpilot/analytics';

export const AnalyticsSection: React.FC = () => {
  return (
    <section id="analytics" className="relative z-10 bg-[#111118] text-white py-24 px-6 border-b border-white/[0.08]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20 mb-3">
            {analyticsData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight font-display mb-4">
            {analyticsData.headline}
          </h2>
          <p className="text-base text-white/65 leading-relaxed">
            {analyticsData.subtext}
          </p>
        </div>

        {/* 4 Metric Badges */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {analyticsData.stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/[0.08] bg-[#161622] p-5 text-left"
            >
              <div className="text-xs font-semibold text-white/40 uppercase tracking-wider">{stat.label}</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-display mt-1">{stat.value}</div>
              <div className="text-xs text-emerald-400 font-medium mt-1 flex items-center gap-1">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>{stat.change} past 30 days</span>
              </div>
            </div>
          ))}
        </div>

        {/* Dual Chart & Top Performing Posts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Main Dual Trend Chart (8 cols) */}
          <div className="lg:col-span-8 rounded-3xl border border-white/[0.08] bg-[#161622] p-6 sm:p-8 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-white">Engagement vs Reach Trajectory</h3>
                <span className="text-xs text-white/40">Aggregated performance from connected account</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5 text-coral-400">
                  <span className="h-2 w-2 rounded-full bg-coral-400" />
                  <span>Reach</span>
                </div>
                <div className="flex items-center gap-1.5 text-cyan-400">
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span>Engagement</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Curves */}
            <div className="h-56 w-full relative py-2">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="analytics-coral-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF7048" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#FF7048" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(255,255,255,0.05)" strokeDasharray="3 3" />

                {/* Reach Area Fill */}
                <path
                  d="M 0 130 Q 80 110, 160 85 T 320 60 T 500 20 L 500 160 L 0 160 Z"
                  fill="url(#analytics-coral-grad)"
                />
                {/* Reach Line */}
                <path
                  d="M 0 130 Q 80 110, 160 85 T 320 60 T 500 20"
                  fill="none"
                  stroke="#FF7048"
                  strokeWidth="3"
                  strokeLinecap="round"
                />
                {/* Engagement Line */}
                <path
                  d="M 0 145 Q 80 135, 160 110 T 320 90 T 500 45"
                  fill="none"
                  stroke="#22D3EE"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>

            {/* Insights Footer */}
            <div className="pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analyticsData.insights.map((insight, idx) => (
                <div key={idx} className="text-xs text-white/60 leading-relaxed flex items-start gap-2">
                  <span className="text-cyan-400 font-bold">•</span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Top Posts Leaderboard (4 cols) */}
          <div className="lg:col-span-4 rounded-3xl border border-white/[0.08] bg-[#161622] p-6 flex flex-col justify-between">
            <div>
              <h3 className="text-base font-bold text-white mb-1">Top Performing Threads</h3>
              <p className="text-xs text-white/40 mb-4">Ranked by discussion thread depth</p>

              <div className="space-y-3">
                {analyticsData.topPosts.map((post) => (
                  <div
                    key={post.rank}
                    className="p-3.5 rounded-xl border border-white/[0.06] bg-black/20 hover:bg-black/40 transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-coral-400 mb-1">
                      <span>#{post.rank} Ranked</span>
                      <span className="text-white/40">{post.reach} • {post.replies} replies</span>
                    </div>
                    <p className="text-xs font-medium text-white/90 line-clamp-2 leading-relaxed">
                      {post.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-white/[0.06]">
              <Link
                href="/dashboard"
                className="w-full btn-secondary text-xs py-2.5 px-4 text-center justify-center flex items-center gap-1.5"
              >
                <span>{analyticsData.ctaText}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
