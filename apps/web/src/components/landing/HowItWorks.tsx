'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Feather,
  Fingerprint,
  Calendar,
  Send,
  BarChart3,
  RefreshCw,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { workflowData, WorkflowStep } from '../../data/threadpilot/workflow';

const stepIcons: Record<string, React.ElementType> = {
  feather: Feather,
  fingerprint: Fingerprint,
  calendar: Calendar,
  send: Send,
  'bar-chart': BarChart3,
  'refresh-cw': RefreshCw,
};

const stepMicroPreviews: Record<string, { previewTitle: string; previewBadge: string; detail: string; metric: string }> = {
  '01': {
    previewTitle: 'Hook & Thought Ingestion',
    previewBadge: 'Prompt Context',
    detail: 'Turn fleeting bullet points or engineering ideas into high-signal drafts within 500-char limits.',
    metric: '3 Alternative Hook Angles Evaluated',
  },
  '02': {
    previewTitle: '8D Vector Voice Calibration',
    previewBadge: 'Voice Model',
    detail: 'Rewrites raw AI draft against your historical vocabulary, sentence variety, and punchiness weights.',
    metric: '0.02 Drift Tolerance • 100% Authentic',
  },
  '03': {
    previewTitle: 'Cadence Window Calculation',
    previewBadge: 'Smart Queue',
    detail: 'Schedules automatically during historical audience reply spikes to maximize organic discovery.',
    metric: 'Calculated from 30-Day Follower Activity',
  },
  '04': {
    previewTitle: 'Meta Graph API Dispatch',
    previewBadge: 'Outbox Worker',
    detail: 'Zero manual copy-pasting. Dispatches securely through encrypted token vault with BullMQ retries.',
    metric: '100% Direct Official API Publication',
  },
  '05': {
    previewTitle: 'Discussion & Reply Telemetry',
    previewBadge: 'Signal Ingestion',
    detail: 'Tracks real-time comment depth, quoted threads, and reply rates within the first 4 hours.',
    metric: 'Real Quoted Replies vs. Passive Impressions',
  },
  '06': {
    previewTitle: 'Continuous Memory Update',
    previewBadge: 'Self-Learning',
    detail: 'Feeds high-performing hook patterns back into your voice model so your next draft is even sharper.',
    metric: 'Autonomous System-Level Feedback',
  },
};

export const HowItWorks: React.FC = () => {
  const [activeStepIndex, setActiveStepIndex] = useState<number>(0);
  const fallbackStep: WorkflowStep = workflowData.steps[0]!;
  const activeStep: WorkflowStep = workflowData.steps[activeStepIndex] || fallbackStep;
  const fallbackPreview = stepMicroPreviews['01']!;
  const activePreview = (activeStep && stepMicroPreviews[activeStep.step]) || fallbackPreview;
  const ActiveIcon = (activeStep && stepIcons[activeStep.iconName]) || Feather;

  return (
    <section id="how-it-works" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3 font-mono">
            {workflowData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {workflowData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            {workflowData.subtext}
          </p>
        </div>

        {/* 6-Step Connected Flow Grid */}
        <div className="relative mb-10">
          {/* Subtle horizontal connecting line (desktop) */}
          <div className="hidden lg:block absolute top-7 left-12 right-12 h-0.5 bg-gradient-to-r from-coral-400 via-violet-400 to-lime-400 opacity-30 z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 relative z-10">
            {workflowData.steps.map((step: WorkflowStep, idx: number) => {
              const Icon = stepIcons[step.iconName] || Feather;
              const isSelected = activeStepIndex === idx;

              return (
                <button
                  key={step.step}
                  onClick={() => setActiveStepIndex(idx)}
                  className={`rounded-2xl border p-4 flex flex-col justify-between text-left transition-all duration-200 group ${
                    isSelected
                      ? 'border-coral-500 bg-white shadow-card ring-2 ring-coral-500/20'
                      : 'border-canvas-border bg-paper/60 hover:bg-white hover:shadow-subtle'
                  }`}
                >
                  <div>
                    {/* Step Icon Badge */}
                    <div
                      className={`h-11 w-11 rounded-xl flex items-center justify-center text-white mb-3 shadow-subtle transition-transform group-hover:scale-105 ${
                        isSelected ? 'scale-105' : ''
                      }`}
                      style={{ backgroundColor: step.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Step Number & Title */}
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-text-muted mb-0.5">
                      {step.step}
                    </div>
                    <h3 className={`text-sm font-bold transition-colors ${isSelected ? 'text-coral-600' : 'text-text-primary'}`}>
                      {step.title}
                    </h3>
                  </div>

                  <div className="pt-2 text-[10px] text-text-muted line-clamp-2">
                    {step.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive Step Detail Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={activeStep.step}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="rounded-3xl border border-canvas-border bg-white p-6 sm:p-8 shadow-card flex flex-col sm:flex-row items-center justify-between gap-6"
          >
            <div className="flex items-center gap-4">
              <div
                className="h-14 w-14 rounded-2xl flex items-center justify-center text-white shrink-0 shadow-subtle"
                style={{ backgroundColor: activeStep.accent }}
              >
                <ActiveIcon className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-mono font-bold text-coral-600 uppercase">
                    Stage {activeStep.step}
                  </span>
                  <span className="text-[10px] font-mono font-semibold bg-paper px-2 py-0.5 rounded border border-canvas-border text-text-muted">
                    {activePreview.previewBadge}
                  </span>
                </div>
                <h4 className="text-lg font-bold text-text-primary font-display">
                  {activePreview.previewTitle}
                </h4>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mt-1 max-w-xl">
                  {activePreview.detail}
                </p>
              </div>
            </div>

            <div className="sm:text-right shrink-0 w-full sm:w-auto p-3.5 rounded-2xl bg-paper/60 border border-canvas-border">
              <div className="text-[10px] font-mono uppercase text-text-muted font-bold">Platform Signal</div>
              <div className="text-xs font-bold text-text-primary font-display mt-0.5 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>{activePreview.metric}</span>
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
};
