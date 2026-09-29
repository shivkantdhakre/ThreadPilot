'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Layers,
  LayoutDashboard,
  Calendar,
  Sparkles,
  BarChart3,
  Bot,
  ArrowRight,
  Share2,
  CheckCircle2,
  Clock,
  Fingerprint,
} from 'lucide-react';

export const CreatorWorkflow: React.FC = () => {
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<number>(0);

  const workflowScreens = [
    {
      title: '01. High-Signal Creation',
      tag: 'Studio Composer',
      description: 'Drafting with live 500-char feedback, hook recommendations, and voice resonance scores.',
      mainMetric: '94% Hook Resonance',
      subtext: 'Optimized for first-line reply rate',
    },
    {
      title: '02. Cadence Scheduling',
      tag: 'Calendar Matrix',
      description: 'Automated dispatch scheduled around organic follower discussion spikes without manual intervention.',
      mainMetric: '3 Automated Windows',
      subtext: 'UTC aligned with local audience peak',
    },
    {
      title: '03. Telemetry Feedback',
      tag: 'Live Telemetry',
      description: 'Post analytics feeding directly back into stylistic weights to make future threads sharper.',
      mainMetric: '+42% Reply Volume',
      subtext: 'Continuous vector recalibration',
    },
  ];

  return (
    <section id="workflow" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border overflow-hidden">
      {/* Subtle Trajectory Connecting Line SVG */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
        <svg className="w-full h-full" viewBox="0 0 1440 800" fill="none">
          <path
            d="M-100 400 C 300 200, 600 600, 1100 300 C 1300 200, 1500 500, 1600 400"
            stroke="#FF7048"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
            <Layers className="h-3.5 w-3.5 text-coral-600" />
            <span>Integrated Architecture</span>
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            An uninterrupted loop from concept to publishing.
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            ThreadPilot connects content creation, voice modeling, multi-account queueing, and audience intelligence into one unified workspace.
          </p>
        </div>

        {/* 3 Interactive Workflow Navigation Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-12">
          {workflowScreens.map((step, idx) => {
            const isActive = activeWorkflowStep === idx;
            return (
              <button
                key={step.title}
                onClick={() => setActiveWorkflowStep(idx)}
                className={`p-6 rounded-3xl text-left border transition-all duration-300 relative overflow-hidden ${
                  isActive
                    ? 'border-coral-500 bg-white shadow-card ring-2 ring-coral-500/20'
                    : 'border-canvas-border bg-paper/60 hover:bg-white text-text-secondary'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-bold font-mono uppercase tracking-wider ${isActive ? 'text-coral-600' : 'text-text-muted'}`}>
                    {step.title}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${isActive ? 'bg-coral-50 text-coral-700 border border-coral-200' : 'bg-canvas-neutral text-text-muted'}`}>
                    {step.tag}
                  </span>
                </div>
                <h4 className="text-base font-bold text-text-primary mb-2">{step.mainMetric}</h4>
                <p className="text-xs text-text-secondary leading-relaxed mb-3">{step.description}</p>
                <div className="text-[11px] font-mono text-text-muted flex items-center gap-1.5">
                  <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-coral-500 animate-pulse' : 'bg-text-faint'}`} />
                  <span>{step.subtext}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* Appshot Editorial Stage Composition */}
        <div className="relative rounded-3xl border border-canvas-border bg-white p-6 sm:p-10 shadow-card">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Primary Large Screen Simulation (8 cols) */}
            <div className="lg:col-span-8 rounded-2xl border border-canvas-border bg-paper/40 p-5 shadow-subtle">
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-canvas-border">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-coral-500" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <span className="ml-2 text-xs font-mono text-text-muted">app.threadpilot.com/workspace</span>
                </div>
                <span className="text-[10px] font-mono text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  Telemetry Synced
                </span>
              </div>

              {activeWorkflowStep === 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Content Studio • Draft View</div>
                      <div className="text-[11px] text-text-muted">Multi-mode preview with real-time character limit enforcement</div>
                    </div>
                    <span className="text-xs font-mono font-bold text-coral-600 bg-coral-50 px-2.5 py-1 rounded-full border border-coral-200">
                      312 / 500 Chars
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border border-canvas-border bg-white shadow-subtle text-xs text-text-primary leading-relaxed">
                    <p className="font-semibold text-coral-600 mb-1 font-mono text-[11px]">// Opening Hook (High Signal)</p>
                    <p className="mb-2">"Great engineering products feel inevitable in hindsight, but chaotic during the first 100 days."</p>
                    <p className="text-text-secondary">Here are the 3 structural shifts we made when building the ThreadPilot event outbox to handle thousands of concurrent background jobs without dropped transactions...</p>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[11px]">
                    <div className="p-2 rounded-lg bg-paper border border-canvas-border">
                      <span className="text-text-muted block text-[10px]">Pacing Score</span>
                      <span className="font-bold text-text-primary">96 / 100</span>
                    </div>
                    <div className="p-2 rounded-lg bg-paper border border-canvas-border">
                      <span className="text-text-muted block text-[10px]">Vocabulary Drift</span>
                      <span className="font-bold text-emerald-600">0.02 (Nominal)</span>
                    </div>
                    <div className="p-2 rounded-lg bg-paper border border-canvas-border">
                      <span className="text-text-muted block text-[10px]">Thread Chunks</span>
                      <span className="font-bold text-text-primary">1 Post</span>
                    </div>
                  </div>
                </div>
              )}

              {activeWorkflowStep === 1 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Publishing Orchestrator • Queue Timeline</div>
                      <div className="text-[11px] text-text-muted">Automated execution window with outbox fail-safe guarantees</div>
                    </div>
                    <span className="text-xs font-mono font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                      BullMQ Active
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="p-3 rounded-xl border border-canvas-border bg-white flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <Clock className="h-4 w-4 text-coral-600" />
                        <div>
                          <span className="font-bold text-text-primary block">Engineering Deep-Dive: Event-Driven Outbox</span>
                          <span className="text-[10px] text-text-muted">Today at 14:15 UTC • Automated Meta Graph Publish</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-coral-700 bg-coral-50 px-2 py-0.5 rounded border border-coral-200">
                        Queued
                      </span>
                    </div>
                    <div className="p-3 rounded-xl border border-canvas-border bg-white flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <div>
                          <span className="font-bold text-text-primary block">Architecture Notes: Distributed Workers</span>
                          <span className="text-[10px] text-text-muted">Yesterday at 08:30 UTC • Successfully confirmed on Threads</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        Published
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {activeWorkflowStep === 2 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-text-primary">Audience Signal Telemetry • Voice Convergence</div>
                      <div className="text-[11px] text-text-muted">Real-time engagement rates recalibrating prompt few-shot context</div>
                    </div>
                    <span className="text-xs font-mono font-bold text-violet-600 bg-violet-50 px-2.5 py-1 rounded-full border border-violet-200">
                      Vector v2.4
                    </span>
                  </div>
                  <div className="p-4 rounded-xl border border-canvas-border bg-white space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-text-primary">Quoted Reply Rate vs. Average</span>
                      <span className="text-emerald-600 font-bold font-mono">+142%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-paper overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-coral-500 to-violet-600 w-[78%]" />
                    </div>
                    <p className="text-[11px] text-text-secondary leading-relaxed pt-1">
                      Posts opening with concrete architecture decisions receive 3.4x more engineering discussion replies than high-level commentary.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Secondary Contextual Card & Quick Stats (4 cols) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="p-5 rounded-2xl border border-canvas-border bg-paper/60 space-y-3">
                <div className="flex items-center gap-2">
                  <Fingerprint className="h-4 w-4 text-violet-600" />
                  <span className="text-xs font-bold text-text-primary">Continuous Self-Improvement</span>
                </div>
                <p className="text-xs text-text-secondary leading-relaxed">
                  Every comment and reply rate signal is captured by the background worker, ensuring the next cycle is sharper than the last.
                </p>
                <div className="pt-2">
                  <a
                    href="/dashboard"
                    className="w-full btn-secondary text-xs py-2 px-3 justify-center inline-flex items-center gap-1.5 shadow-subtle"
                  >
                    <span>View Workspace Demo</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </a>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-canvas-border bg-white shadow-subtle flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-text-muted uppercase font-semibold">Security Vault</div>
                  <div className="text-xs font-bold text-text-primary mt-0.5">AES-256 GCM Tokens</div>
                </div>
                <span className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-semibold font-mono">
                  Encrypted
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
