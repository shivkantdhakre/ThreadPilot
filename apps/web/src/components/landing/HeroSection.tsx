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
import { Spotlight } from '../ui/Spotlight';
import { ShimmerButton } from '../ui/ShimmerButton';
import { NumberTicker } from '../ui/NumberTicker';

export const HeroSection: React.FC = () => {
  const [activeHeroTab, setActiveHeroTab] = React.useState<'overview' | 'create' | 'calendar' | 'analytics' | 'voice'>('overview');

  return (
    <section id="hero" className="relative overflow-hidden bg-warm-white text-text-primary pt-32 pb-20 sm:pt-36 sm:pb-28 border-b border-canvas-border">
      {/* 1. Luminous Ambient Gradient Backdrop */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Soft Radial Ambient Canvas - Enhanced Depth & Radiance */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_75%_60%_at_45%_-8%,rgba(255,107,74,0.22),rgba(255,122,24,0.10)_45%,rgba(255,253,248,0)_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_55%_at_82%_35%,rgba(124,58,237,0.18),rgba(168,85,247,0.08)_45%,rgba(255,253,248,0)_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_50%_45%_at_12%_65%,rgba(0,173,181,0.14),rgba(255,253,248,0)_65%)]" />

        {/* High-Craft Architectural Pattern Grid with Dots & Intersections */}
        <svg
          className="absolute inset-0 h-full w-full opacity-60"
          xmlns="http://www.w3.org/2000/svg"
          style={{
            maskImage: 'radial-gradient(ellipse 95% 80% at 50% 35%, black 40%, transparent 85%)',
            WebkitMaskImage: 'radial-gradient(ellipse 95% 80% at 50% 35%, black 40%, transparent 85%)',
          }}
        >
          <defs>
            <pattern id="hero-fine-grid" width="36" height="36" patternUnits="userSpaceOnUse">
              <path d="M 36 0 L 0 0 0 36" fill="none" stroke="rgba(21, 21, 24, 0.05)" strokeWidth="1" />
              <circle cx="36" cy="36" r="1.2" fill="rgba(255, 107, 74, 0.4)" />
            </pattern>
            <pattern id="hero-major-grid" width="108" height="108" patternUnits="userSpaceOnUse">
              <path d="M 108 0 L 0 0 0 108" fill="none" stroke="rgba(255, 107, 74, 0.12)" strokeWidth="1.2" />
              <path d="M 104 108 L 112 108 M 108 104 L 108 112" stroke="#FF6B4A" strokeWidth="1.2" strokeOpacity="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hero-fine-grid)" />
          <rect width="100%" height="100%" fill="url(#hero-major-grid)" />
        </svg>

        {/* Concentric Telemetry Radar Arcs Radiating behind Product Preview */}
        <svg
          className="absolute -right-20 top-10 w-[900px] h-[900px] pointer-events-none opacity-40 text-coral-500/20"
          viewBox="0 0 900 900"
          fill="none"
        >
          <circle cx="550" cy="350" r="180" stroke="currentColor" strokeWidth="1" strokeDasharray="3 6" />
          <circle cx="550" cy="350" r="320" stroke="#7C3AED" strokeOpacity="0.3" strokeWidth="1" strokeDasharray="4 8" />
          <circle cx="550" cy="350" r="480" stroke="currentColor" strokeWidth="1" strokeDasharray="6 12" />
          <circle cx="550" cy="350" r="640" stroke="#00ADB5" strokeOpacity="0.25" strokeWidth="1" strokeDasharray="8 16" />
        </svg>

        {/* Animated Floating Gradient Orbs */}
        <motion.div
          animate={{
            x: [0, 25, 0],
            y: [0, -25, 0],
            scale: [1, 1.1, 1],
          }}
          transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute -top-24 left-1/4 h-[560px] w-[560px] rounded-full bg-gradient-to-tr from-coral-500/20 via-orange-400/12 to-transparent blur-[120px]"
        />
        <motion.div
          animate={{
            x: [0, -35, 0],
            y: [0, 30, 0],
            scale: [1, 1.12, 1],
          }}
          transition={{ duration: 15, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
          className="absolute top-1/4 -right-16 h-[640px] w-[640px] rounded-full bg-gradient-to-bl from-violet-600/18 via-purple-500/10 to-transparent blur-[140px]"
        />
        <motion.div
          animate={{
            x: [0, 25, 0],
            y: [0, 18, 0],
          }}
          transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
          className="absolute -bottom-20 left-1/3 h-[450px] w-[450px] rounded-full bg-gradient-to-tr from-cyan-500/14 to-emerald-400/8 blur-[130px]"
        />
      </div>

      {/* 2. Aceternity UI Spotlight for Focused Editorial Key Light */}
      <Spotlight className="-top-40 left-0 md:left-40 md:-top-20" fill="#FF6B4A" />

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

            {/* Dual CTAs with Magic UI ShimmerButton */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap items-center gap-3.5 mb-10"
            >
              <Link
                href={heroData.primaryCta.href}
                className="w-full sm:w-auto"
              >
                <ShimmerButton className="w-full py-3 px-6 shadow-sm">
                  <span>{heroData.primaryCta.label}</span>
                  <ArrowRight className="h-4 w-4" />
                </ShimmerButton>
              </Link>
              <a
                href={heroData.secondaryCta.href}
                className="w-full sm:w-auto btn-secondary py-3 px-5 text-sm inline-flex items-center justify-center gap-2 shadow-subtle hover:bg-paper transition-all"
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
          <div className="lg:col-span-7 relative group">
            {/* Ambient Glowing Halo behind Dashboard Card */}
            <div className="absolute -inset-2 sm:-inset-4 bg-gradient-to-tr from-coral-500/25 via-violet-500/20 to-cyan-500/18 rounded-3xl blur-2xl opacity-75 -z-10 group-hover:opacity-95 transition-opacity pointer-events-none" />

            {/* Precision Flowing Trajectory Streams - Locked to Dashboard */}
            <svg
              className="absolute -inset-x-8 -inset-y-12 sm:-inset-x-14 sm:-inset-y-16 w-[calc(100%+64px)] sm:w-[calc(100%+112px)] h-[calc(100%+96px)] sm:h-[calc(100%+128px)] pointer-events-none -z-10 overflow-visible"
              viewBox="0 0 850 560"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <defs>
                <linearGradient id="dashboard-stream-1" x1="0%" y1="100%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#FF6B4A" stopOpacity="0" />
                  <stop offset="25%" stopColor="#FF6B4A" stopOpacity="0.45" />
                  <stop offset="65%" stopColor="#7C3AED" stopOpacity="0.45" />
                  <stop offset="100%" stopColor="#00ADB5" stopOpacity="0.1" />
                </linearGradient>
                <linearGradient id="dashboard-stream-2" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.05" />
                  <stop offset="40%" stopColor="#00ADB5" stopOpacity="0.4" />
                  <stop offset="80%" stopColor="#84CC16" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#FF6B4A" stopOpacity="0.05" />
                </linearGradient>
              </defs>

              {/* Stream 1: Ascending Compounding Growth Arc */}
              <motion.path
                d="M -30,510 C 140,510 240,430 440,320 C 620,220 730,160 880,120"
                stroke="url(#dashboard-stream-1)"
                strokeWidth="2.2"
                strokeDasharray="10 8"
                animate={{ strokeDashoffset: [0, -72] }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
              />

              {/* Stream 2: Overhead Telemetry Arc */}
              <motion.path
                d="M 20,90 C 220,30 460,40 650,80 C 760,105 820,90 880,60"
                stroke="url(#dashboard-stream-2)"
                strokeWidth="1.8"
                strokeDasharray="12 10"
                animate={{ strokeDashoffset: [0, -88] }}
                transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
              />

              {/* Stream 3: Subtle Harmonic Shadow Line */}
              <motion.path
                d="M 10,540 C 180,540 280,460 470,360 C 650,260 760,200 880,170"
                stroke="#FF6B4A"
                strokeOpacity="0.15"
                strokeWidth="1.2"
                strokeDasharray="6 8"
                animate={{ strokeDashoffset: [0, -56] }}
                transition={{ duration: 22, repeat: Infinity, ease: 'linear' }}
              />
            </svg>

            {/* Satellite Badge: Top-Right Meta Graph API */}
            <motion.div
              animate={{ y: [-3, 3, -3] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              className="hidden sm:inline-flex absolute -top-3.5 right-4 sm:right-8 z-20 items-center gap-2 px-3 py-1 rounded-full bg-white/95 backdrop-blur-md border border-emerald-200/80 shadow-card text-[11px] font-mono font-medium text-emerald-800 pointer-events-none"
            >
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Meta API v21 Connected</span>
            </motion.div>

            {/* Satellite Badge: Bottom-Left 8D Voice Vector Active */}
            <motion.div
              animate={{ y: [3, -3, 3] }}
              transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
              className="hidden sm:inline-flex absolute -bottom-3.5 left-4 sm:left-8 z-20 items-center gap-2 px-3 py-1 rounded-full bg-white/95 backdrop-blur-md border border-violet-200/80 shadow-card text-[11px] font-mono font-medium text-violet-800 pointer-events-none"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-violet-600" />
              <span>8D Stylistic Vector Active</span>
            </motion.div>

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
                {/* Mini Sidebar representation with interactive tabs */}
                <div className="hidden sm:block sm:col-span-3 space-y-1.5 pr-3 border-r border-canvas-border text-xs text-text-secondary">
                  <div className="text-[10px] uppercase font-bold text-text-muted tracking-wider mb-2">Interactive Demo</div>
                  
                  <button
                    onClick={() => setActiveHeroTab('overview')}
                    className={`w-full p-1.5 rounded-lg flex items-center gap-2 text-left transition-all ${
                      activeHeroTab === 'overview'
                        ? 'bg-paper text-text-primary font-semibold border border-canvas-border shadow-subtle'
                        : 'hover:bg-paper/70'
                    }`}
                  >
                    <Activity className={`h-3.5 w-3.5 ${activeHeroTab === 'overview' ? 'text-coral-500' : 'text-text-muted'}`} />
                    <span>Overview</span>
                  </button>

                  <button
                    onClick={() => setActiveHeroTab('create')}
                    className={`w-full p-1.5 rounded-lg flex items-center gap-2 text-left transition-all ${
                      activeHeroTab === 'create'
                        ? 'bg-paper text-text-primary font-semibold border border-canvas-border shadow-subtle'
                        : 'hover:bg-paper/70'
                    }`}
                  >
                    <Feather className={`h-3.5 w-3.5 ${activeHeroTab === 'create' ? 'text-coral-500' : 'text-text-muted'}`} />
                    <span>Composer</span>
                  </button>

                  <button
                    onClick={() => setActiveHeroTab('voice')}
                    className={`w-full p-1.5 rounded-lg flex items-center gap-2 text-left transition-all ${
                      activeHeroTab === 'voice'
                        ? 'bg-paper text-text-primary font-semibold border border-canvas-border shadow-subtle'
                        : 'hover:bg-paper/70'
                    }`}
                  >
                    <Bot className={`h-3.5 w-3.5 ${activeHeroTab === 'voice' ? 'text-coral-500' : 'text-text-muted'}`} />
                    <span>Voice Radar</span>
                  </button>

                  <button
                    onClick={() => setActiveHeroTab('calendar')}
                    className={`w-full p-1.5 rounded-lg flex items-center gap-2 text-left transition-all ${
                      activeHeroTab === 'calendar'
                        ? 'bg-paper text-text-primary font-semibold border border-canvas-border shadow-subtle'
                        : 'hover:bg-paper/70'
                    }`}
                  >
                    <Calendar className={`h-3.5 w-3.5 ${activeHeroTab === 'calendar' ? 'text-coral-500' : 'text-text-muted'}`} />
                    <span>Calendar</span>
                  </button>

                  <button
                    onClick={() => setActiveHeroTab('analytics')}
                    className={`w-full p-1.5 rounded-lg flex items-center gap-2 text-left transition-all ${
                      activeHeroTab === 'analytics'
                        ? 'bg-paper text-text-primary font-semibold border border-canvas-border shadow-subtle'
                        : 'hover:bg-paper/70'
                    }`}
                  >
                    <TrendingUp className={`h-3.5 w-3.5 ${activeHeroTab === 'analytics' ? 'text-coral-500' : 'text-text-muted'}`} />
                    <span>Analytics</span>
                  </button>
                </div>

                {/* Main Content Area: Dynamic Previews */}
                <div className="sm:col-span-9 space-y-4 min-h-[300px]">
                  {/* OVERVIEW TAB */}
                  {activeHeroTab === 'overview' && (
                    <div className="space-y-4">
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
                            <path
                              d="M 0 65 Q 40 55, 80 40 T 160 30 T 240 18 T 300 10 L 300 80 L 0 80 Z"
                              fill="url(#hero-curve-grad)"
                            />
                            <path
                              d="M 0 65 Q 40 55, 80 40 T 160 30 T 240 18 T 300 10"
                              fill="none"
                              stroke="#FF7048"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                            />
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
                  )}

                  {/* COMPOSER TAB */}
                  {activeHeroTab === 'create' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-canvas-border">
                        <span className="font-bold text-text-primary">Content Studio • Threads Limit Bound</span>
                        <span className="text-[11px] font-mono text-coral-600 bg-coral-50 px-2 py-0.5 rounded border border-coral-200">
                          284 / 500 Chars
                        </span>
                      </div>
                      <div className="p-3.5 rounded-xl border border-canvas-border bg-paper/50 text-xs text-text-primary leading-relaxed">
                        <p className="font-bold text-coral-600 mb-1 font-mono text-[10px]">// Opening Hook</p>
                        <p className="font-semibold mb-1.5">"Why most AI writing fails on Threads: it lacks sentence length variety."</p>
                        <p className="text-text-secondary text-[11px]">When you write naturally, you switch between 4-word punchlines and 20-word explanations. ThreadPilot preserves that exact cadence.</p>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px]">
                        <div className="p-2 rounded-lg bg-paper border border-canvas-border flex items-center justify-between">
                          <span className="text-text-muted">Hook Punchiness:</span>
                          <span className="font-bold text-emerald-600 font-mono">94%</span>
                        </div>
                        <div className="p-2 rounded-lg bg-paper border border-canvas-border flex items-center justify-between">
                          <span className="text-text-muted">Draft State:</span>
                          <span className="font-bold text-text-primary font-mono">Ready to Queue</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VOICE RADAR TAB */}
                  {activeHeroTab === 'voice' && (
                    <div className="space-y-3 text-center">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-canvas-border text-left">
                        <span className="font-bold text-text-primary">8D Voice Profile Vector</span>
                        <span className="text-[11px] font-mono text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">
                          92% Calibration
                        </span>
                      </div>
                      <div className="relative h-28 w-full flex items-center justify-center my-1">
                        <svg className="h-full w-full max-h-28" viewBox="0 0 200 120">
                          <polygon points="100,10 160,40 140,100 60,100 40,40" fill="none" stroke="#E2DDD5" strokeWidth="1" />
                          <polygon points="100,25 145,50 130,90 70,90 55,50" fill="rgba(124, 58, 237, 0.15)" stroke="#7C3AED" strokeWidth="2" />
                          <circle cx="100" cy="25" r="3" fill="#FF7048" />
                          <circle cx="145" cy="50" r="3" fill="#7C3AED" />
                          <circle cx="130" cy="90" r="3" fill="#00ADB5" />
                          <circle cx="70" cy="90" r="3" fill="#84CC16" />
                          <circle cx="55" cy="50" r="3" fill="#FF7048" />
                        </svg>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[10px] text-left">
                        <div className="p-2 rounded-lg bg-paper border border-canvas-border">
                          <span className="text-text-muted block">Sentence Variety:</span>
                          <span className="font-bold text-text-primary">High (78%)</span>
                        </div>
                        <div className="p-2 rounded-lg bg-paper border border-canvas-border">
                          <span className="text-text-muted block">Technical Tone:</span>
                          <span className="font-bold text-text-primary">Direct (92%)</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* CALENDAR TAB */}
                  {activeHeroTab === 'calendar' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-canvas-border">
                        <span className="font-bold text-text-primary">Publishing Cadence • September 2026</span>
                        <span className="text-[11px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          UTC +00:00
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div className="p-2.5 rounded-xl border border-canvas-border bg-paper/60 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-coral-600" />
                            <div>
                              <div className="font-bold text-text-primary text-[11px]">Morning Engineering Digest</div>
                              <div className="text-[10px] text-text-muted">Today at 08:30 UTC • Automated Dispatch</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-coral-700 bg-coral-100 px-2 py-0.5 rounded-full">Queued</span>
                        </div>
                        <div className="p-2.5 rounded-xl border border-canvas-border bg-paper/60 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-violet-600" />
                            <div>
                              <div className="font-bold text-text-primary text-[11px]">Evening Architecture Thoughts</div>
                              <div className="text-[10px] text-text-muted">Tomorrow at 19:45 UTC • Follower Reply Peak</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">Scheduled</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* ANALYTICS TAB */}
                  {activeHeroTab === 'analytics' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs pb-1 border-b border-canvas-border">
                        <span className="font-bold text-text-primary">Real Telemetry Signals</span>
                        <span className="text-[11px] font-mono text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">
                          Live Data
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="p-3 rounded-xl border border-canvas-border bg-paper/50">
                          <div className="text-[10px] text-text-muted font-semibold uppercase">Replies / Post</div>
                          <div className="text-xl font-extrabold text-text-primary font-display mt-0.5">18.4</div>
                          <div className="text-[10px] text-emerald-600 font-semibold mt-0.5">+34% vs last mo</div>
                        </div>
                        <div className="p-3 rounded-xl border border-canvas-border bg-paper/50">
                          <div className="text-[10px] text-text-muted font-semibold uppercase">Quoted Discussion</div>
                          <div className="text-xl font-extrabold text-text-primary font-display mt-0.5">42.1%</div>
                          <div className="text-[10px] text-cyan-600 font-semibold mt-0.5">High-signal engagement</div>
                        </div>
                      </div>
                      <p className="text-[11px] text-text-secondary leading-relaxed p-2 rounded-lg bg-coral-50/60 border border-coral-200/50">
                        ⚡ ThreadPilot learned: Posts opening with specific architecture decisions generated 3.4x more engineering discussion replies.
                      </p>
                    </div>
                  )}
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
