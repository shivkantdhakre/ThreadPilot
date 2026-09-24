'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, Play, CheckCircle2 } from 'lucide-react';

export const FinalCtaSection: React.FC = () => {
  return (
    <section className="relative z-10 bg-ivory py-24 px-6 border-b border-black/[0.06] overflow-hidden text-center">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full bg-coral-500/10 blur-[140px]" />
        <div className="absolute bottom-0 right-1/4 h-[350px] w-[350px] rounded-full bg-violet-600/10 blur-[140px]" />
      </div>

      <div className="max-w-4xl mx-auto relative z-10">
        <h2 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-[#151515] tracking-tight font-display mb-6">
          Start building a smarter{' '}
          <span className="bg-gradient-to-r from-coral-500 via-lava-orange to-violet-600 bg-clip-text text-transparent">
            Threads presence today.
          </span>
        </h2>
        <p className="text-base sm:text-lg text-[#525252] max-w-xl mx-auto mb-10 leading-relaxed">
          Create, automate, analyze and grow with an AI that learns your voice and gets smarter with every thread you publish.
        </p>

        {/* Dual CTAs */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-14">
          <Link
            href="/register"
            className="btn-primary py-3.5 px-8 text-sm shadow-glow flex items-center gap-2"
          >
            <span>Get Started for Free</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#product"
            className="rounded-xl border border-black/10 bg-white py-3.5 px-6 text-sm font-semibold text-[#151515] hover:bg-black/[0.02] hover:border-black/20 transition-all flex items-center gap-2"
          >
            <Play className="h-3.5 w-3.5 fill-current text-[#525252]" />
            <span>Watch Demo</span>
          </a>
        </div>

        {/* 4 Feature Milestones */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-3xl mx-auto text-left pt-8 border-t border-black/[0.06]">
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-coral-600 shrink-0 mt-0.5" />
            <span className="text-xs text-[#525252]">Connect Threads in minutes</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
            <span className="text-xs text-[#525252]">Analyze your style automatically</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-cyan-600 shrink-0 mt-0.5" />
            <span className="text-xs text-[#525252]">Create & schedule with AI</span>
          </div>
          <div className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
            <span className="text-xs text-[#525252]">Start learning from day one</span>
          </div>
        </div>

        {/* Handwritten signoff */}
        <div className="mt-10">
          <span className="text-xs italic text-coral-600 font-semibold">
            "Idea today. A stronger tomorrow."
          </span>
        </div>
      </div>
    </section>
  );
};
