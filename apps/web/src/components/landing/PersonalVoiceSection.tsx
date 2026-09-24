'use client';

import React from 'react';
import Link from 'next/link';
import {
  Sparkles,
  ArrowRight,
  Layers,
  Feather,
  Zap,
  Activity,
} from 'lucide-react';
import { voiceData } from '../../data/threadpilot/voice';

export const PersonalVoiceSection: React.FC = () => {
  return (
    <section id="voice" className="relative z-10 bg-ivory py-24 px-6 border-b border-black/[0.06]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 mb-3">
            {voiceData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#151515] tracking-tight font-display mb-4">
            {voiceData.headline}
          </h2>
          <p className="text-base text-[#525252] leading-relaxed">
            {voiceData.subtext}
          </p>
        </div>

        {/* 3-Panel Visual Composition */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Panel 1: Ingested Posts Feed */}
          <div className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/[0.06]">
                <h3 className="text-sm font-bold text-[#151515]">Your Ingested Posts</h3>
                <span className="text-[11px] font-mono text-[#737373]">Via Meta API</span>
              </div>
              <div className="space-y-3">
                {voiceData.existingPosts.map((post, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-black/[0.05] bg-ivory/60 hover:bg-ivory transition-colors"
                  >
                    <div className="flex items-center justify-between text-[10px] text-[#737373] mb-1 font-mono">
                      <span>Post #{idx + 1}</span>
                      <span className="bg-black/5 px-2 py-0.5 rounded text-[#151515] font-semibold">{post.tag}</span>
                    </div>
                    <p className="text-xs font-semibold text-[#151515] line-clamp-1">{post.title}</p>
                    <p className="text-[10px] text-[#737373] mt-1">{post.stats}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-4 text-center">
              <span className="text-xs text-[#737373]">Analyzed continuously for stylistic markers</span>
            </div>
          </div>

          {/* Panel 2: Pattern Analysis Breakdown */}
          <div className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/[0.06]">
                <h3 className="text-sm font-bold text-[#151515]">Pattern Extraction</h3>
                <span className="text-[11px] font-mono text-emerald-600 font-semibold">Active</span>
              </div>
              <div className="space-y-3">
                {voiceData.patternAnalysis.map((item) => (
                  <div
                    key={item.title}
                    className="p-3 rounded-xl border border-black/[0.05] bg-ivory/60"
                  >
                    <div className="text-[11px] font-bold text-coral-600 mb-0.5 uppercase tracking-wide">
                      {item.title}
                    </div>
                    <div className="text-xs font-semibold text-[#151515]">{item.value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-4 text-center">
              <span className="text-xs text-[#737373]">Zero generic templates • 100% personalized</span>
            </div>
          </div>

          {/* Panel 3: Style Fingerprint Radar Visualization */}
          <div className="rounded-3xl border border-black/[0.06] bg-white p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-black/[0.06]">
                <h3 className="text-sm font-bold text-[#151515]">Style Fingerprint</h3>
                <span className="text-[11px] font-mono text-violet-600 font-semibold">Vector Profile</span>
              </div>

              {/* SVG Pentagon Radar */}
              <div className="relative h-48 w-full flex items-center justify-center my-2">
                <svg className="h-full w-full max-h-48" viewBox="0 0 200 200">
                  {/* Concentric pentagons */}
                  <polygon
                    points="100,20 180,75 150,165 50,165 20,75"
                    fill="none"
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth="1"
                  />
                  <polygon
                    points="100,45 155,85 135,145 65,145 45,85"
                    fill="none"
                    stroke="rgba(0,0,0,0.06)"
                    strokeWidth="1"
                  />
                  {/* Active radar polygon */}
                  <polygon
                    points="100,30 168,78 140,155 60,150 35,78"
                    fill="rgba(139, 92, 246, 0.15)"
                    stroke="#8B5CF6"
                    strokeWidth="2"
                  />
                  {/* Radar corner points */}
                  <circle cx="100" cy="30" r="3.5" fill="#FF7048" />
                  <circle cx="168" cy="78" r="3.5" fill="#8B5CF6" />
                  <circle cx="140" cy="155" r="3.5" fill="#00ADB5" />
                  <circle cx="60" cy="150" r="3.5" fill="#84CC16" />
                  <circle cx="35" cy="78" r="3.5" fill="#A855F7" />
                </svg>
              </div>

              {/* Radar Metric Legend */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-[#525252]">
                {voiceData.radarMetrics.map((m) => (
                  <div key={m.label} className="flex items-center justify-between p-1.5 rounded-lg bg-ivory/80">
                    <span>{m.label}</span>
                    <span className="font-mono font-bold text-[#151515]">{m.score}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 text-center">
              <span className="text-xs italic text-[#737373]">"Your voice, amplified."</span>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center">
          <Link
            href="/profile"
            className="btn-primary py-3 px-8 text-sm shadow-sm inline-flex items-center gap-2"
          >
            <span>{voiceData.ctaText}</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </section>
  );
};
