'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  CheckCircle2,
  Sliders,
  Feather,
  Copy,
  Check,
  Zap,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Layers,
} from 'lucide-react';
import { MovingBorder } from '../ui/MovingBorder';
import { CircleLoader } from '../ui/CircleLoader';

interface Variation {
  id: string;
  hookStyle: string;
  hookText: string;
  body: string;
  charCount: number;
  score: number;
}

const variations: Variation[] = [
  {
    id: '1',
    hookStyle: 'Contrarian Hook',
    hookText: 'Most social automation destroys personal voice. Here is why:',
    body: 'When you feed raw LLMs generic prompts, you get polite, homogenized corporate speak.\n\nThreadPilot extracts sentence length variance, pacing, and signature vocabulary from your actual ingested threads — so every automated dispatch sounds like you on your clearest day.',
    charCount: 304,
    score: 96,
  },
  {
    id: '2',
    hookStyle: 'Actionable Breakdown',
    hookText: '3 rules for high-signal Threads writing that converts:',
    body: '1. Keep opening line under 14 words.\n2. One central thesis per post — no rambling.\n3. Stop writing for likes; write for quoted replies.\n\nOur cadence engine tracks which opening structures trigger discussion threads instead of passive scrolls.',
    charCount: 268,
    score: 93,
  },
  {
    id: '3',
    hookStyle: 'Behind-The-Scenes',
    hookText: 'What building in public on Threads actually taught our team:',
    body: 'Consistency is not about motivation. It is about removing friction from the publishing pipeline.\n\nWith strict 500-character platform bounds and automated outbox retries, you focus entirely on the idea while ThreadPilot handles orchestration.',
    charCount: 262,
    score: 91,
  },
];

export const AIContentCreation: React.FC = () => {
  const [selectedVariation, setSelectedVariation] = useState<Variation>(variations[0]!);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'voice' | 'generic'>('voice');

  const handleCopy = () => {
    navigator.clipboard.writeText(`${selectedVariation.hookText}\n\n${selectedVariation.body}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section id="ai-studio" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border overflow-hidden">
      {/* Background ambient accents */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/4 -left-20 h-[400px] w-[400px] rounded-full bg-violet-600/5 blur-[140px]" />
        <div className="absolute bottom-1/4 -right-20 h-[400px] w-[400px] rounded-full bg-coral-500/5 blur-[140px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 mb-3">
            <Sparkles className="h-3.5 w-3.5 text-violet-600" />
            <span>Embedded AI Studio</span>
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            AI that drafts in your cadence, not a generic chatbot.
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            ThreadPilot observes how you structure opening hooks, transition between technical points, and sign off. Every draft feels like you wrote it on your best day.
          </p>
        </div>

        {/* 2-Column Studio Composition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Left Column: Technical Principles */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl border border-canvas-border bg-paper/60 p-6 sm:p-8 shadow-subtle space-y-6">
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <Layers className="h-4 w-4 text-violet-600" />
                <span>The 3-Tier Drafting Architecture</span>
              </h3>

              <div className="space-y-4">
                <div className="p-4 rounded-2xl border border-canvas-border bg-white shadow-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-coral-600 uppercase tracking-wider font-mono">01. Hook Engine</span>
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">Reply-Optimized</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Evaluates 3 distinct opening hook angles for every concept to maximize read-through before the 500-character fold.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-canvas-border bg-white shadow-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-violet-600 uppercase tracking-wider font-mono">02. Voice Calibration</span>
                    <span className="text-[10px] font-semibold text-violet-600 bg-violet-50 px-2 py-0.5 rounded border border-violet-200">Few-Shot Ingested</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Uses your historical top 20% engagement posts as dynamic prompt memory to mirror your authentic sentence structure.
                  </p>
                </div>

                <div className="p-4 rounded-2xl border border-canvas-border bg-white shadow-subtle">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-bold text-cyan-600 uppercase tracking-wider font-mono">03. Strict 500-Char Bounds</span>
                    <span className="text-[10px] font-semibold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded border border-cyan-200">Zero Truncation</span>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Automatic thread splitting with logical narrative breakpoints, preventing broken thoughts and awkward sentence cut-offs.
                  </p>
                </div>
              </div>

              {/* Security & Authenticity Guarantee */}
              <div className="pt-2 flex items-center gap-2 text-xs text-text-muted">
                <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Zero template stuffing • Continuous style calibration</span>
              </div>
            </div>
          </div>

          {/* Right Column: Interactive Thread Composer Preview with Aceternity MovingBorder */}
          <div className="lg:col-span-7">
            <MovingBorder
              duration={4200}
              rx="24px"
              className="p-6 sm:p-8 flex flex-col justify-between"
            >
              <div>
                {/* Studio Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-5 border-b border-canvas-border">
                  <div className="flex items-center gap-3">
                    <span className="p-1.5 rounded-lg bg-coral-500/10 text-coral-600">
                      <Feather className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-bold text-text-primary">Content Studio Composer</h3>
                      <div className="flex items-center gap-2 mt-0.5">
                        <CircleLoader size={14} label="8D Model Calibrated" />
                      </div>
                    </div>
                  </div>

                {/* Compare View Toggle */}
                <div className="inline-flex items-center p-1 rounded-xl bg-canvas-neutral border border-canvas-border text-xs font-semibold">
                  <button
                    onClick={() => setActiveTab('voice')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      activeTab === 'voice'
                        ? 'bg-white text-text-primary shadow-subtle'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    ThreadPilot Voice
                  </button>
                  <button
                    onClick={() => setActiveTab('generic')}
                    className={`px-3 py-1 rounded-lg transition-all ${
                      activeTab === 'generic'
                        ? 'bg-white text-text-primary shadow-subtle'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    Raw Generic LLM
                  </button>
                </div>
              </div>

              {/* Hook Variation Selector Tabs */}
              {activeTab === 'voice' && (
                <div className="mb-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-text-muted mb-2 font-mono">
                    Hook Angles Generated:
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {variations.map((v) => {
                      const isSelected = selectedVariation.id === v.id;
                      return (
                        <button
                          key={v.id}
                          onClick={() => setSelectedVariation(v)}
                          className={`p-2.5 rounded-xl text-left border transition-all ${
                            isSelected
                              ? 'border-coral-500 bg-coral-50/40 text-coral-900 shadow-subtle ring-1 ring-coral-500/20'
                              : 'border-canvas-border bg-paper/50 hover:bg-paper text-text-secondary'
                          }`}
                        >
                          <div className="text-[10px] font-bold uppercase tracking-wide truncate">{v.hookStyle}</div>
                          <div className="text-xs font-mono font-bold text-coral-600 mt-0.5">{v.score}% Match</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Draft Surface */}
              <div className="rounded-2xl border border-canvas-border bg-paper/30 p-5 relative min-h-[220px]">
                <AnimatePresence mode="wait">
                  {activeTab === 'voice' ? (
                    <motion.div
                      key={selectedVariation.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3"
                    >
                      <div className="font-semibold text-text-primary text-sm leading-snug">
                        {selectedVariation.hookText}
                      </div>
                      <div className="text-xs text-text-secondary leading-relaxed whitespace-pre-line">
                        {selectedVariation.body}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="generic"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-3 text-text-muted"
                    >
                      <div className="font-semibold text-sm leading-snug text-text-secondary italic">
                        "In today's fast-paced digital world, social media automation is revolutionizing how creators connect with audiences..."
                      </div>
                      <div className="text-xs leading-relaxed italic">
                        "It is crucial to remember that synergy and engagement require consistent posting. Leverage cutting-edge artificial intelligence to unlock your maximum potential and supercharge your reach across all platforms today! #AI #Growth #SocialMedia"
                      </div>
                      <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-[11px] text-red-700 font-medium">
                        ⚠️ High cliché density detected: 4 buzzwords, 0 authentic voice markers, generic hashtags.
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Studio Telemetry Footer */}
              <div className="mt-4 pt-4 border-t border-canvas-border flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-text-muted font-mono">
                      {activeTab === 'voice' ? selectedVariation.charCount : 412} / 500 chars
                    </span>
                  </div>
                  <span className="text-text-muted font-mono hidden sm:inline">•</span>
                  <span className="text-text-muted hidden sm:inline">1 Single Thread</span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-xl border border-canvas-border hover:bg-paper transition-all text-text-secondary inline-flex items-center gap-1.5"
                    title="Copy draft"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                    <span className="text-[11px] font-medium">{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                  <a
                    href="/create"
                    className="btn-primary text-xs py-2 px-3.5 inline-flex items-center gap-1.5 shadow-subtle"
                  >
                    <span>Open in Studio</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>
            </div>
          </MovingBorder>
        </div>
        </div>
      </div>
    </section>
  );
};
