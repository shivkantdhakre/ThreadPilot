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
    <section id="how-it-works" className="relative z-10 bg-white py-24 px-6 border-b border-black/[0.06]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
            {workflowData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#151515] tracking-tight font-display mb-4">
            {workflowData.headline}
          </h2>
          <p className="text-base text-[#525252] leading-relaxed">
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
                  className="rounded-2xl border border-black/[0.06] bg-ivory/80 p-5 flex flex-col justify-between hover:border-black/15 hover:shadow-md transition-all duration-300 group"
                >
                  <div>
                    {/* Step Icon Badge */}
                    <div
                      className="h-12 w-12 rounded-xl flex items-center justify-center text-white mb-4 shadow-sm group-hover:scale-105 transition-transform"
                      style={{ backgroundColor: step.accent }}
                    >
                      <Icon className="h-5 w-5" />
                    </div>

                    {/* Step Number & Title */}
                    <div className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#737373] mb-1">
                      {step.step}
                    </div>
                    <h3 className="text-base font-bold text-[#151515] mb-2">{step.title}</h3>
                    <p className="text-xs text-[#525252] leading-relaxed">
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
