'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react';
import { ShimmerButton } from '../ui/ShimmerButton';

export const FinalCtaSection: React.FC = () => {
  return (
    <section id="cta" className="relative z-10 bg-[#FFFDF8] py-28 px-6 border-b border-black/[0.06] overflow-hidden text-center">
      {/* Subtle Trajectory Background SVG Animation */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-70">
        <svg
          className="absolute w-full h-full text-coral-500/15"
          viewBox="0 0 1440 600"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M -100,300 C 250,150 450,450 720,300 C 990,150 1190,450 1540,300"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="6 6"
          />
          <circle cx="720" cy="300" r="4" fill="#FF6B4A">
            <animate attributeName="opacity" values="0.3;1;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="720" cy="300" r="16" stroke="#FF6B4A" strokeWidth="1" opacity="0.2">
            <animate attributeName="r" values="8;24;8" dur="3s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.4;0;0.4" dur="3s" repeatCount="indefinite" />
          </circle>
        </svg>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[480px] w-[600px] rounded-full bg-coral-500/8 blur-[130px]" />
        <div className="absolute bottom-0 right-1/4 h-[300px] w-[400px] rounded-full bg-violet-600/6 blur-[120px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        {/* Eyebrow badge */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-coral-50 border border-coral-200/60 mb-6 shadow-xs">
          <span className="h-1.5 w-1.5 rounded-full bg-coral-500 animate-pulse" />
          <span className="text-[12px] font-semibold text-coral-700 tracking-wide uppercase">
            Closed-Loop Creator Architecture
          </span>
        </div>

        {/* Direction Headline */}
        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#151518] tracking-tight font-display mb-6 leading-[1.12]">
          Build a Threads presence that{' '}
          <span className="bg-gradient-to-r from-coral-500 via-lava-orange to-coral-600 bg-clip-text text-transparent">
            gets smarter with every post.
          </span>
        </h2>

        {/* Supporting Copy */}
        <p className="text-base sm:text-lg text-[#5F5D61] max-w-2xl mx-auto mb-10 leading-relaxed font-sans">
          Create, personalize, schedule, and continuously learn with an AI system built around your authentic voice. No generic bots, no robotic drafts—just a compounding feedback loop that refines your ideas into resonant Threads.
        </p>

        {/* Dual CTAs with Magic UI ShimmerButton */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <Link
            href="/register"
            className="w-full sm:w-auto"
          >
            <ShimmerButton className="w-full sm:w-auto py-3.5 px-8 text-sm">
              <span>Get Started</span>
              <ArrowRight className="h-4 w-4" />
            </ShimmerButton>
          </Link>
          <a
            href="#product"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl border border-black/10 bg-white hover:bg-[#F7F4EE] hover:border-black/15 text-[#151518] text-sm font-semibold transition-all shadow-2xs active:scale-[0.98]"
          >
            <Play className="h-3.5 w-3.5 fill-current text-[#5F5D61]" />
            <span>Watch Demo</span>
          </a>
        </div>

        {/* 4 Architecture Milestones */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 max-w-3xl mx-auto text-left pt-8 border-t border-black/[0.08]">
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-coral-500 shrink-0 mt-0.5" />
            <span className="text-xs font-medium text-[#5F5D61]">Official Meta Graph API</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <span className="text-xs font-medium text-[#5F5D61]">8D Voice Vectorization</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
            <span className="text-xs font-medium text-[#5F5D61]">Deterministic 500-char limits</span>
          </div>
          <div className="flex items-start gap-2.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="text-xs font-medium text-[#5F5D61]">Autonomous Learning Loop</span>
          </div>
        </div>

        {/* Subtle trajectory signoff */}
        <div className="mt-12 flex items-center justify-center gap-2">
          <span className="h-px w-8 bg-black/10" />
          <span className="text-xs font-mono tracking-wider text-[#8A8784] uppercase">
            Trajectory: Idea → Voice → Schedule → Feedback
          </span>
          <span className="h-px w-8 bg-black/10" />
        </div>
      </div>
    </section>
  );
};
