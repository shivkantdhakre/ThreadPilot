'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
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
    <section id="voice" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-16"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 mb-3 font-mono">
            {voiceData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {voiceData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed font-sans">
            {voiceData.subtext}
          </p>
        </motion.div>

        {/* 3-Panel Visual Composition with Staggered Entrance */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12">
          {/* Panel 1: Ingested Posts Feed */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-canvas-border">
                <h3 className="text-sm font-bold text-text-primary">Your Ingested Posts</h3>
                <span className="text-[11px] font-mono text-text-muted">Via Meta API</span>
              </div>
              <div className="space-y-3">
                {voiceData.existingPosts.map((post, idx) => (
                  <motion.div
                    key={idx}
                    whileHover={{ x: 3 }}
                    transition={{ duration: 0.15 }}
                    className="p-3 rounded-xl border border-canvas-border/80 bg-paper/60 hover:bg-paper transition-colors cursor-default"
                  >
                    <div className="flex items-center justify-between text-[10px] text-text-muted mb-1 font-mono">
                      <span>Post #{idx + 1}</span>
                      <span className="bg-canvas-neutral px-2 py-0.5 rounded text-text-primary font-semibold">{post.tag}</span>
                    </div>
                    <p className="text-xs font-semibold text-text-primary line-clamp-1">{post.title}</p>
                    <p className="text-[10px] text-text-muted mt-1">{post.stats}</p>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="pt-4 text-center">
              <span className="text-xs text-text-muted">Analyzed continuously for stylistic markers</span>
            </div>
          </motion.div>

          {/* Panel 2: Pattern Analysis Breakdown */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-canvas-border">
                <h3 className="text-sm font-bold text-text-primary">Pattern Extraction</h3>
                <span className="text-[11px] font-mono text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Active
                </span>
              </div>
              <div className="space-y-3">
                {voiceData.patternAnalysis.map((item) => (
                  <motion.div
                    key={item.title}
                    whileHover={{ scale: 1.01 }}
                    transition={{ duration: 0.15 }}
                    className="p-3 rounded-xl border border-canvas-border/80 bg-paper/60"
                  >
                    <div className="text-[11px] font-bold text-coral-600 mb-0.5 uppercase tracking-wide font-mono">
                      {item.title}
                    </div>
                    <div className="text-xs font-semibold text-text-primary">{item.value}</div>
                  </motion.div>
                ))}
              </div>
            </div>
            <div className="pt-4 text-center">
              <span className="text-xs text-text-muted">Zero generic templates • 100% personalized</span>
            </div>
          </motion.div>

          {/* Panel 3: Style Fingerprint Radar Visualization */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-50px' }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between pb-3 mb-4 border-b border-canvas-border">
                <h3 className="text-sm font-bold text-text-primary">Style Fingerprint</h3>
                <span className="text-[11px] font-mono text-violet-600 font-semibold">Vector Profile</span>
              </div>

              {/* Animated SVG Pentagon Radar */}
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
                  {/* Animated Active radar polygon */}
                  <motion.polygon
                    initial={{ scale: 0.75, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.7, type: 'spring' }}
                    style={{ transformOrigin: '100px 100px' }}
                    points="100,30 168,78 140,155 60,150 35,78"
                    fill="rgba(124, 58, 237, 0.14)"
                    stroke="#7C3AED"
                    strokeWidth="2"
                  />
                  {/* Radar corner points with subtle pulse */}
                  <circle cx="100" cy="30" r="3.5" fill="#FF6B4A" />
                  <circle cx="168" cy="78" r="3.5" fill="#7C3AED" />
                  <circle cx="140" cy="155" r="3.5" fill="#00ADB5" />
                  <circle cx="60" cy="150" r="3.5" fill="#84CC16" />
                  <circle cx="35" cy="78" r="3.5" fill="#A855F7" />
                </svg>
              </div>

              {/* Radar Metric Legend */}
              <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-text-secondary">
                {voiceData.radarMetrics.map((m) => (
                  <div key={m.label} className="flex items-center justify-between p-1.5 rounded-lg bg-paper">
                    <span>{m.label}</span>
                    <span className="font-mono font-bold text-text-primary">{m.score}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-4 text-center">
              <span className="text-xs italic text-text-muted">"Your voice, amplified."</span>
            </div>
          </motion.div>
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
