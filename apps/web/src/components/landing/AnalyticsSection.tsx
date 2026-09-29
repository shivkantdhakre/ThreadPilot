'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { TrendingUp, ArrowRight, BarChart3, ArrowUpRight } from 'lucide-react';
import { analyticsData } from '../../data/threadpilot/analytics';
import { NumberTicker } from '../ui/NumberTicker';

export const AnalyticsSection: React.FC = () => {
  return (
    <section id="analytics" className="relative z-10 bg-warm-white text-text-primary py-24 px-6 border-b border-canvas-border overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-cyan-700 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20 mb-3 font-mono">
            {analyticsData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {analyticsData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed font-sans">
            {analyticsData.subtext}
          </p>
        </motion.div>

        {/* 4 Metric Badges with NumberTicker */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {analyticsData.stats.map((stat, idx) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.1 }}
              whileHover={{ y: -3 }}
              className="rounded-2xl border border-canvas-border bg-white p-5 text-left shadow-subtle cursor-default"
            >
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wider font-mono">{stat.label}</div>
              <div className="text-2xl sm:text-3xl font-extrabold text-text-primary font-display mt-1">{stat.value}</div>
              <div className="text-xs text-emerald-700 font-semibold mt-1 flex items-center gap-1">
                <ArrowUpRight className="h-3.5 w-3.5" />
                <span>{stat.change} past 30 days</span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Dual Chart & Top Performing Posts */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Main Dual Trend Chart (8 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6 }}
            className="lg:col-span-8 rounded-3xl border border-canvas-border bg-white p-6 sm:p-8 flex flex-col justify-between shadow-card"
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-bold text-text-primary">Engagement vs Reach Trajectory</h3>
                <span className="text-xs text-text-muted">Aggregated performance from connected account</span>
              </div>
              <div className="flex items-center gap-4 text-xs font-medium">
                <div className="flex items-center gap-1.5 text-coral-600 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-coral-500" />
                  <span>Reach</span>
                </div>
                <div className="flex items-center gap-1.5 text-cyan-700 font-semibold">
                  <span className="h-2 w-2 rounded-full bg-cyan-600" />
                  <span>Engagement</span>
                </div>
              </div>
            </div>

            {/* SVG Visual Curves with animated draw */}
            <div className="h-56 w-full relative py-2">
              <svg className="h-full w-full overflow-visible" viewBox="0 0 500 160" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="analytics-coral-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FF6B4A" stopOpacity="0.18" />
                    <stop offset="100%" stopColor="#FF6B4A" stopOpacity="0.0" />
                  </linearGradient>
                </defs>
                {/* Horizontal reference grid lines */}
                <line x1="0" y1="40" x2="500" y2="40" stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="80" x2="500" y2="80" stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />
                <line x1="0" y1="120" x2="500" y2="120" stroke="rgba(0,0,0,0.06)" strokeDasharray="3 3" />

                {/* Reach Area Fill */}
                <path
                  d="M 0 130 Q 80 110, 160 85 T 320 60 T 500 20 L 500 160 L 0 160 Z"
                  fill="url(#analytics-coral-grad)"
                />
                {/* Animated Reach Line */}
                <motion.path
                  d="M 0 130 Q 80 110, 160 85 T 320 60 T 500 20"
                  fill="none"
                  stroke="#FF6B4A"
                  strokeWidth="3"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.4, ease: 'easeInOut' }}
                />
                {/* Animated Engagement Line */}
                <motion.path
                  d="M 0 145 Q 80 135, 160 110 T 320 90 T 500 45"
                  fill="none"
                  stroke="#00ADB5"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  whileInView={{ pathLength: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1.6, delay: 0.2, ease: 'easeInOut' }}
                />
              </svg>
            </div>

            {/* Insights Footer */}
            <div className="pt-4 border-t border-canvas-border grid grid-cols-1 sm:grid-cols-2 gap-3">
              {analyticsData.insights.map((insight, idx) => (
                <div key={idx} className="text-xs text-text-secondary leading-relaxed flex items-start gap-2">
                  <span className="text-cyan-600 font-bold">•</span>
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Top Posts Leaderboard (4 cols) */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="lg:col-span-4 rounded-3xl border border-canvas-border bg-white p-6 flex flex-col justify-between shadow-card"
          >
            <div>
              <h3 className="text-base font-bold text-text-primary mb-1">Top Performing Threads</h3>
              <p className="text-xs text-text-muted mb-4">Ranked by discussion thread depth</p>

              <div className="space-y-3">
                {analyticsData.topPosts.map((post) => (
                  <div
                    key={post.rank}
                    className="p-3.5 rounded-xl border border-canvas-border bg-paper/60 hover:bg-paper transition-colors"
                  >
                    <div className="flex items-center justify-between text-[11px] font-mono text-coral-600 font-semibold mb-1">
                      <span>#{post.rank} Ranked</span>
                      <span className="text-text-muted">{post.reach} • {post.replies} replies</span>
                    </div>
                    <p className="text-xs font-semibold text-text-primary line-clamp-2 leading-relaxed">
                      {post.title}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 border-t border-canvas-border">
              <Link
                href="/analytics"
                className="w-full btn-secondary text-xs py-2.5 px-4 text-center justify-center flex items-center gap-1.5 shadow-subtle"
              >
                <span>{analyticsData.ctaText}</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
};
