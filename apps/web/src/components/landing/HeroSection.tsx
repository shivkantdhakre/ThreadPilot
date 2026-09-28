'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  Sparkles,
  ArrowRight,
  Play,
  Share2,
  Calendar,
  Layers,
  Activity,
  Bot,
  Feather,
  Clock,
  TrendingUp,
} from 'lucide-react';
import { heroData } from '../../data/threadpilot/hero';

export const HeroSection: React.FC = () => {
  return (
    <section className="relative overflow-hidden bg-warm-white text-text-primary pt-32 pb-20 sm:pt-36 sm:pb-28 border-b border-canvas-border">
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/4 h-[500px] w-[500px] rounded-full bg-coral-500/8 blur-[140px]" />
        <div className="absolute top-1/3 right-[-5%] h-[600px] w-[600px] rounded-full bg-violet-600/8 blur-[160px]" />
        <div className="absolute bottom-[-10%] left-1/3 h-[450px] w-[450px] rounded-full bg-cyan-500/6 blur-[150px]" />
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-6 sm:px-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
          {/* Left Column: Primary Product Positioning */}
          <div className="lg:col-span-5 text-left">
            {/* Eyebrow Pill */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 rounded-full border border-coral-500/30 bg-coral-500/10 px-3.5 py-1 text-xs font-semibold text-coral-600 mb-6"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-coral-500 animate-pulse" />
              <span>{heroData.eyebrow}</span>
            </motion.div>

            {/* Dominant Editorial Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-text-primary mb-6 leading-[1.08] font-display"
            >
              {heroData.headline.start}{' '}
              <span className="bg-gradient-to-r from-coral-500 via-lava-orange to-violet-600 bg-clip-text text-transparent">
                {heroData.headline.highlight}
              </span>
            </motion.h1>

            {/* Concise Supporting Copy */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-base sm:text-lg text-text-secondary leading-relaxed mb-8 max-w-lg font-normal"
            >
              {heroData.subtext}
            </motion.p>

            {/* Dual CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-3.5 mb-10"
            >
              <Link
                href={heroData.primaryCta.href}
                className="btn-primary py-3 px-6 text-sm shadow-subtle inline-flex items-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <span>{heroData.primaryCta.label}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={heroData.secondaryCta.href}
                className="btn-secondary py-3 px-5 text-sm inline-flex items-center gap-2 shadow-subtle hover:bg-paper transition-all"
              >
                <Play className="h-3.5 w-3.5 fill-current text-text-secondary" />
                <span>{heroData.secondaryCta.label}</span>
              </a>
            </motion.div>

            {/* Value Anchor Pills */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="grid grid-cols-2 gap-3 pt-6 border-t border-canvas-border"
            >
              {heroData.valuePills.map((pill) => (
                <div key={pill.label} className="flex items-center gap-2 text-xs text-text-secondary">
                  <span className="h-1.5 w-1.5 rounded-full bg-coral-500" />
                  <span>{pill.label}</span>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right Column: Polished Production Dashboard Showcase */}
          <div className="lg:col-span-7 relative">
            {/* Main Layered Dashboard Card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ duration: 0.7, delay: 0.2 }}
              className="relative rounded-2xl border border-canvas-border bg-white p-5 sm:p-7 shadow-card overflow-hidden"
            >
              {/* Card Header */}
              <div className="flex items-center justify-between pb-4 mb-5 border-b border-canvas-border">
                <div className="flex items-center gap-2.5">
                  <span className="h-3 w-3 rounded-full bg-coral-500" />
                  <span className="h-3 w-3 rounded-full bg-amber-500" />
                  <span className="h-3 w-3 rounded-full bg-emerald-500" />
                  <span className="ml-2 text-xs font-mono text-text-muted">app.threadpilot.com</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    Meta API Connected
                  </span>
                </div>
              </div>

              {/* Dashboard Content Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                {/* Mini Sidebar representation */}
                <div className="hidden sm:block sm:col-span-3 space-y-1.5 pr-3 border-r border-canvas-border text-xs text-text-secondary">
                  <div className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-2">Workspace</div>
                  <div className="p-1.5 rounded-lg bg-paper text-text-primary font-semibold flex items-center gap-2 border border-canvas-border shadow-subtle">
                    <Activity className="h-3.5 w-3.5 text-coral-500" />
                    <span>Overview</span>
                  </div>
                  <div className="p-1.5 rounded-lg hover:bg-paper/70 flex items-center gap-2">
                    <Feather className="h-3.5 w-3.5" />
                    <span>Create</span>
                  </div>
                  <div className="p-1.5 rounded-lg hover:bg-paper/70 flex items-center gap-2">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>Calendar</span>
                  </div>
                  <div className="p-1.5 rounded-lg hover:bg-paper/70 flex items-center gap-2">
                    <TrendingUp className="h-3.5 w-3.5" />
                    <span>Analytics</span>
                  </div>
                  <div className="p-1.5 rounded-lg hover:bg-paper/70 flex items-center gap-2">
                    <Bot className="h-3.5 w-3.5" />
                    <span>Learning</span>
                  </div>
                </div>

                {/* Main Content Area */}
                <div className="sm:col-span-9 space-y-4">
                  {/* Metric Counters Bar */}
                  <div className="grid grid-cols-4 gap-2">
                    {heroData.dashboardMockup.stats.map((stat) => (
                      <div
                        key={stat.label}
                        className="rounded-xl border border-canvas-border bg-paper/60 p-2.5 text-left"
                      >
                        <div className="text-[10px] text-text-muted uppercase font-semibold">{stat.label}</div>
                        <div className="text-base sm:text-lg font-bold text-text-primary font-display mt-0.5">{stat.value}</div>
                        <div className="text-[10px] text-emerald-600 font-semibold">{stat.change}</div>
                      </div>
                    ))}
                  </div>

                  {/* Dual Engagement Trend Curves */}
                  <div className="rounded-xl border border-canvas-border bg-paper/30 p-3.5 relative overflow-hidden">
                    <div className="flex items-center justify-between text-xs mb-2">
                      <span className="font-semibold text-text-primary">30-Day Growth Velocity</span>
                      <span className="text-[11px] text-coral-600 font-mono font-bold">+42% Engagement</span>
                    </div>

                    {/* SVG Trend Graph */}
                    <div className="h-24 w-full relative">
                      <svg className="h-full w-full overflow-visible" viewBox="0 0 300 80" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="hero-curve-grad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#FF7048" stopOpacity="0.2" />
                            <stop offset="100%" stopColor="#FF7048" stopOpacity="0.0" />
                          </linearGradient>
                        </defs>
                        {/* Area fill */}
                        <path
                          d="M 0 65 Q 40 55, 80 40 T 160 30 T 240 18 T 300 10 L 300 80 L 0 80 Z"
                          fill="url(#hero-curve-grad)"
                        />
                        {/* Primary curve */}
                        <path
                          d="M 0 65 Q 40 55, 80 40 T 160 30 T 240 18 T 300 10"
                          fill="none"
                          stroke="#FF7048"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                        />
                        {/* Secondary curve */}
                        <path
                          d="M 0 72 Q 40 68, 80 55 T 160 48 T 240 35 T 300 24"
                          fill="none"
                          stroke="#7C3AED"
                          strokeWidth="1.8"
                          strokeDasharray="4 4"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* AI Recommendation Banner */}
                  <div className="rounded-xl border border-coral-500/20 bg-coral-50/70 p-3 flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-coral-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-coral-900 leading-relaxed font-medium">
                      {heroData.dashboardMockup.aiRecommendation}
                    </p>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Floating Supporting Quote Pill */}
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              className="hidden sm:inline-flex items-center gap-2 absolute -bottom-5 right-6 rounded-full border border-canvas-border bg-white px-4 py-2 text-xs font-semibold text-text-primary shadow-elevated"
            >
              <span className="h-2 w-2 rounded-full bg-violet-600" />
              <span>{heroData.dashboardMockup.quotePill}</span>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
};
