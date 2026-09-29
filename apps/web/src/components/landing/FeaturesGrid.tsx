'use client';

import React from 'react';
import {
  Sparkles,
  Fingerprint,
  Calendar,
  BarChart3,
  MessageSquare,
  Lock,
  Sliders,
  Shield,
  ArrowRight,
  Zap,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { NumberTicker } from '../ui/NumberTicker';

export const FeaturesGrid: React.FC = () => {
  return (
    <section id="features" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3 font-mono">
            Platform Capabilities
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            Engineered specifically for the mechanics of Threads.
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            ThreadPilot avoids generic multi-platform abstractions. Every module is tailored to Meta Graph API capabilities, 500-character constraints, and conversational discovery algorithms.
          </p>
        </div>

        {/* Asymmetric Bento-Style Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
          {/* Card 1: Large Anchor Feature (7 cols) - 8D Voice Synthesis */}
          <div className="lg:col-span-7 rounded-3xl border border-canvas-border bg-white p-7 sm:p-9 shadow-subtle hover:shadow-card transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="h-12 w-12 rounded-2xl bg-violet-50 border border-violet-100 text-violet-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Fingerprint className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-violet-700 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200">
                  Vector Calibration
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-text-primary mb-3 font-display">
                8-Dimensional Voice Synthesis
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-6 max-w-lg">
                We measure sentence cadence, vocabulary complexity, technical depth, and hook punchiness across your previous Threads. Content generation adapts directly to your natural syntax so you never sound like an LLM.
              </p>
            </div>

            {/* Visual Vector Spectrum */}
            <div className="p-4 rounded-2xl bg-paper/60 border border-canvas-border space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-mono text-[11px]">Vocabulary Variance</span>
                  <span className="font-bold text-text-primary font-mono"><NumberTicker value={92} />% Match</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-canvas-neutral overflow-hidden">
                  <div className="h-full rounded-full bg-violet-600 w-[92%]" />
                </div>
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-text-muted font-mono text-[11px]">Sentence Length Rhythm</span>
                  <span className="font-bold text-text-primary font-mono"><NumberTicker value={88} />% Match</span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-canvas-neutral overflow-hidden">
                  <div className="h-full rounded-full bg-coral-500 w-[88%]" />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Medium Feature (5 cols) - Automated Cadence Scheduling */}
          <div className="lg:col-span-5 rounded-3xl border border-canvas-border bg-white p-7 sm:p-9 shadow-subtle hover:shadow-card transition-all duration-300 flex flex-col justify-between group">
            <div>
              <div className="flex items-center justify-between mb-6">
                <div className="h-12 w-12 rounded-2xl bg-coral-50 border border-coral-100 text-coral-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Calendar className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-mono uppercase font-bold tracking-wider text-coral-700 bg-coral-50 px-2.5 py-1 rounded-full border border-coral-200">
                  Smart Cadence
                </span>
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-text-primary mb-3 font-display">
                Peak Discussion Scheduling
              </h3>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mb-6">
                Instead of posting into the void, ThreadPilot computes historical follower activity peaks. Posts dispatch automatically into active conversation windows.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-paper/60 border border-canvas-border flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="font-mono text-text-primary">Next Peak: 14:15 UTC</span>
              </div>
              <span className="text-[10px] font-mono text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                +42% Discovery
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Row: 3 Specialized Cards (4 cols each) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 3: 500-Character Boundary Validation */}
          <div className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle hover:shadow-card transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-cyan-50 border border-cyan-100 text-cyan-600 flex items-center justify-center mb-4">
              <Sliders className="h-5 w-5" />
            </div>
            <h4 className="text-base font-bold text-text-primary mb-2 font-display">
              Strict 500-Char Bounds
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Real-time character counting and intelligent thread division that breaks thoughts at punctuation boundaries without awkward mid-sentence cut-offs.
            </p>
          </div>

          {/* Card 4: Quoted Discussion Stream */}
          <div className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle hover:shadow-card transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-orange-50 border border-orange-100 text-orange-600 flex items-center justify-center mb-4">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h4 className="text-base font-bold text-text-primary mb-2 font-display">
              Conversational Social Inbox
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Consolidated discussion stream with sentiment tagging and AI reply assistance that drafts relevant answers mirroring your established tone.
            </p>
          </div>

          {/* Card 5: Cryptographic Vault Security */}
          <div className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle hover:shadow-card transition-all duration-300">
            <div className="h-10 w-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
              <Lock className="h-5 w-5" />
            </div>
            <h4 className="text-base font-bold text-text-primary mb-2 font-display">
              AES-256 Token Vault
            </h4>
            <p className="text-xs text-text-secondary leading-relaxed">
              Meta OAuth access tokens are encrypted at rest with military-grade AES-256 GCM. Your credentials never touch client browsers or unencrypted logs.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
