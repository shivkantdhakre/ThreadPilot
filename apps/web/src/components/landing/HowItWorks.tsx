'use client';

import React from 'react';
import {
  Feather,
  Fingerprint,
  Calendar,
  Send,
  BarChart3,
  RefreshCw,
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

export const HowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
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
        <div className="relative">
          {/* Subtle horizontal connecting line (desktop) */}
          <div className="hidden lg:block absolute top-12 left-10 right-10 h-0.5 bg-gradient-to-r from-coral-400 via-violet-400 to-lime-400 opacity-25 z-0" />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-6 relative z-10">
            {workflowData.steps.map((step: WorkflowStep) => {
              const Icon = stepIcons[step.iconName] || Feather;
              return (
                <div
                  key={step.step}
                  className="rounded-2xl border border-canvas-border bg-paper/60 p-5 flex flex-col justify-between hover:border-canvas-border-muted hover:bg-paper hover:shadow-subtle transition-all duration-300 group shadow-subtle"
                >
                  <div>
                    {/* Step Icon Badge */}
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-subtle group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: step.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Step Number & Title */}
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-text-muted mb-1">
                      {step.step}
                    </div>
                    <h3 className="text-base font-bold text-text-primary mb-2">{step.title}</h3>
                    <p className="text-xs text-text-secondary leading-relaxed">
                      {step.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
