'use client';

import React from 'react';
import {
  Share2,
  BarChart3,
  Bot,
  Fingerprint,
  Sparkles,
  Calendar,
  ArrowRight,
} from 'lucide-react';
import { LogoIcon } from '../ui/Logo';
import { intelligenceData, IntelligenceNode } from '../../data/threadpilot/intelligence';

const nodeIcons: Record<string, React.ElementType> = {
  '1': Share2,
  '2': BarChart3,
  '3': Bot,
  '4': Fingerprint,
  '5': Sparkles,
  '6': Calendar,
};

export const IntelligenceLoop: React.FC = () => {
  return (
    <section id="intelligence" className="relative z-10 bg-cream py-24 px-6 border-b border-black/[0.06] overflow-hidden">
      {/* Ambient background blur */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full bg-coral-500/5 blur-[160px]" />
        <div className="absolute top-1/3 left-1/3 h-[400px] w-[400px] rounded-full bg-violet-600/5 blur-[140px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16 sm:mb-20">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
            {intelligenceData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#151515] tracking-tight font-display mb-4">
            {intelligenceData.headline}
          </h2>
          <p className="text-base text-[#525252] leading-relaxed">
            {intelligenceData.subtext}
          </p>
        </div>

        {/* Circular Signature Visualization */}
        <div className="relative max-w-3xl mx-auto py-10 flex items-center justify-center">
          {/* Orbital Circular Track */}
          <div className="relative w-[340px] h-[340px] sm:w-[460px] sm:h-[460px] flex items-center justify-center">
            {/* SVG Connecting Circle with Stroke Gradient */}
            <svg className="absolute inset-0 h-full w-full" viewBox="0 0 460 460">
              <defs>
                <linearGradient id="orbit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF7048" />
                  <stop offset="35%" stopColor="#00ADB5" />
                  <stop offset="65%" stopColor="#8B5CF6" />
                  <stop offset="100%" stopColor="#84CC16" />
                </linearGradient>
              </defs>
              <circle
                cx="230"
                cy="230"
                r="180"
                fill="none"
                stroke="url(#orbit-gradient)"
                strokeWidth="2.5"
                strokeDasharray="6 6"
                className="animate-spin-slow opacity-60"
              />
              <circle
                cx="230"
                cy="230"
                r="180"
                fill="none"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="1"
              />
            </svg>

            {/* Geometric Center: ORIGINAL ThreadPilot 3D Ribbon Logo */}
            <div className="relative z-20 h-28 w-28 sm:h-36 sm:w-36 rounded-full bg-white border border-black/[0.08] shadow-xl flex flex-col items-center justify-center p-3 text-center transition-transform hover:scale-105 duration-300">
              <LogoIcon size={56} />
              <span className="text-[11px] font-bold text-[#151515] mt-1 font-display">ThreadPilot</span>
              <span className="text-[9px] text-[#737373] uppercase font-semibold tracking-wider">Self-Learning</span>
            </div>

            {/* Orbit Node 1: Threads (Top Center) */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center text-center -translate-y-2">
              <div className="h-12 w-12 rounded-2xl bg-white border border-coral-200 text-coral-600 shadow-md flex items-center justify-center mb-1">
                <Share2 className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">1. Threads</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Live content</span>
            </div>

            {/* Orbit Node 2: Analytics (Top Right) */}
            <div className="absolute top-[18%] right-[-5%] sm:right-[4%] z-20 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-2xl bg-white border border-cyan-200 text-cyan-600 shadow-md flex items-center justify-center mb-1">
                <BarChart3 className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">2. Analytics</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Real signals</span>
            </div>

            {/* Orbit Node 3: Learning (Bottom Right) */}
            <div className="absolute bottom-[18%] right-[-5%] sm:right-[4%] z-20 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-2xl bg-white border border-purple-200 text-purple-600 shadow-md flex items-center justify-center mb-1">
                <Bot className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">3. Learning</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Finds patterns</span>
            </div>

            {/* Orbit Node 4: Personal Profile (Bottom Center) */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center text-center translate-y-2">
              <div className="h-12 w-12 rounded-2xl bg-white border border-violet-200 text-violet-600 shadow-md flex items-center justify-center mb-1">
                <Fingerprint className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">4. Profile</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Refines voice</span>
            </div>

            {/* Orbit Node 5: Content Generation (Bottom Left) */}
            <div className="absolute bottom-[18%] left-[-5%] sm:left-[4%] z-20 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-2xl bg-white border border-orange-200 text-orange-600 shadow-md flex items-center justify-center mb-1">
                <Sparkles className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">5. Drafting</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Better content</span>
            </div>

            {/* Orbit Node 6: Publishing (Top Left) */}
            <div className="absolute top-[18%] left-[-5%] sm:left-[4%] z-20 flex flex-col items-center text-center">
              <div className="h-12 w-12 rounded-2xl bg-white border border-lime-200 text-lime-600 shadow-md flex items-center justify-center mb-1">
                <Calendar className="h-5 w-5" />
              </div>
              <span className="text-xs font-bold text-[#151515]">6. Publishing</span>
              <span className="text-[10px] text-[#737373] hidden sm:block max-w-[100px]">Smart timing</span>
            </div>
          </div>
        </div>

        {/* Supporting Metric Badges & Handwritten Accent */}
        <div className="max-w-xl mx-auto mt-12 flex flex-col sm:flex-row items-center justify-center gap-6 text-center">
          {intelligenceData.metrics.map((m) => (
            <div
              key={m.label}
              className="rounded-2xl border border-black/[0.06] bg-white px-6 py-4 shadow-sm"
            >
              <div className="text-3xl font-extrabold text-[#151515] font-display">{m.value}</div>
              <div className="text-xs text-[#525252] mt-1">{m.label}</div>
            </div>
          ))}
        </div>

        <div className="text-center mt-6">
          <span className="text-sm font-semibold italic text-coral-600">
            "{intelligenceData.handwrittenNote}"
          </span>
        </div>
      </div>
    </section>
  );
};
