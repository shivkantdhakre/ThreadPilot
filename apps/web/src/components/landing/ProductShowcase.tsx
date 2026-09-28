'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles,
  Calendar,
  BarChart3,
  Fingerprint,
  ArrowRight,
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  CheckCircle2,
} from 'lucide-react';
import { showcaseData } from '../../data/threadpilot/showcase';

export const ProductShowcase: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'write' | 'improve' | 'expand'>('write');
  const [selectedTone, setSelectedTone] = useState<string>('Casual');

  return (
    <section id="product" className="relative z-10 bg-paper text-text-primary py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 mb-3">
            {showcaseData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {showcaseData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            {showcaseData.subtext}
          </p>
        </div>

        {/* Studio Preview Window */}
        <div className="rounded-3xl border border-canvas-border bg-warm-white p-6 sm:p-10 shadow-card">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Left Column: Feature Highlights */}
            <div className="lg:col-span-4 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted mb-2">
                Creative Studio Features
              </h3>
              {showcaseData.features.map((feat) => (
                <div
                  key={feat.id}
                  className="rounded-xl border border-canvas-border bg-white p-4 shadow-subtle hover:border-canvas-border-muted transition-all"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <span className="p-1.5 rounded-lg bg-coral-500/10 text-coral-600">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <h4 className="text-sm font-bold text-text-primary">{feat.title}</h4>
                  </div>
                  <p className="text-xs text-text-secondary leading-relaxed pl-8">
                    {feat.description}
                  </p>
                </div>
              ))}

              <div className="pt-2">
                <Link
                  href="/create"
                  className="btn-primary text-xs py-2.5 px-5 shadow-subtle inline-flex items-center gap-2"
                >
                  <span>Launch Content Studio</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>

            {/* Right Column: Interactive Composer & Live Threads Preview */}
            <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-12 gap-5">
              {/* Center Editor */}
              <div className="md:col-span-7 rounded-2xl border border-canvas-border bg-white p-5 space-y-4 shadow-subtle">
                {/* Editor Tabs */}
                <div className="flex items-center justify-between border-b border-canvas-border pb-3">
                  <div className="flex items-center gap-2 text-xs">
                    {(['write', 'improve', 'expand'] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`capitalize px-3 py-1 rounded-lg font-medium transition-all ${
                          activeTab === tab
                            ? 'bg-paper text-text-primary font-bold border border-canvas-border shadow-subtle'
                            : 'text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                  <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1 font-semibold">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>500-char safe</span>
                  </span>
                </div>

                {/* Draft Content Textarea Mockup */}
                <div className="text-xs text-text-primary leading-relaxed font-normal whitespace-pre-line bg-paper/60 p-3.5 rounded-xl border border-canvas-border">
                  {showcaseData.sampleEditor.draftText}
                </div>

                {/* Hook Suggestion Card */}
                <div className="rounded-xl border border-violet-500/25 bg-violet-50/70 p-3 flex items-start gap-2.5">
                  <Sparkles className="h-4 w-4 text-violet-600 shrink-0 mt-0.5" />
                  <div className="text-[11px] text-violet-900 leading-tight">
                    <span className="font-bold text-violet-700">Suggestion: </span>
                    {showcaseData.sampleEditor.hookSuggestion}
                  </div>
                </div>

                {/* Tone Preset Pills */}
                <div>
                  <div className="text-[10px] uppercase font-bold text-text-muted mb-2">Tone Match</div>
                  <div className="flex flex-wrap gap-1.5">
                    {showcaseData.sampleEditor.tonePresets.map((tone) => (
                      <button
                        key={tone}
                        onClick={() => setSelectedTone(tone)}
                        className={`text-xs px-2.5 py-1 rounded-lg border transition-all ${
                          selectedTone === tone
                            ? 'border-coral-500 bg-coral-500/10 text-coral-600 font-semibold'
                            : 'border-canvas-border text-text-secondary hover:bg-paper'
                        }`}
                      >
                        {tone}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Threads Preview Card */}
              <div className="md:col-span-5 rounded-2xl border border-canvas-border bg-white p-4 flex flex-col justify-between shadow-subtle">
                <div>
                  <div className="text-[10px] uppercase font-bold text-text-muted mb-3 flex items-center justify-between">
                    <span>Threads Live Preview</span>
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </div>

                  {/* Profile Header */}
                  <div className="flex items-center gap-2.5 mb-3">
                    <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-coral-500 to-electric-orange flex items-center justify-center font-bold text-xs text-white shadow-subtle">
                      TP
                    </div>
                    <div>
                      <div className="text-xs font-bold text-text-primary">
                        {showcaseData.sampleEditor.previewPost.author}
                      </div>
                      <div className="text-[10px] text-text-muted">Scheduled • via ThreadPilot</div>
                    </div>
                  </div>

                  {/* Post Content */}
                  <p className="text-xs text-text-primary leading-relaxed whitespace-pre-line mb-4 font-normal">
                    {showcaseData.sampleEditor.previewPost.content}
                  </p>
                </div>

                {/* Engagement Bar */}
                <div className="pt-3 border-t border-canvas-border flex items-center justify-between text-[11px] text-text-muted">
                  <div className="flex items-center gap-1.5 hover:text-rose-600 transition-colors">
                    <Heart className="h-3.5 w-3.5" />
                    <span>{showcaseData.sampleEditor.previewPost.likes}</span>
                  </div>
                  <div className="flex items-center gap-1.5 hover:text-cyan-600 transition-colors">
                    <MessageCircle className="h-3.5 w-3.5" />
                    <span>{showcaseData.sampleEditor.previewPost.replies}</span>
                  </div>
                  <div className="flex items-center gap-1.5 hover:text-emerald-600 transition-colors">
                    <Repeat2 className="h-3.5 w-3.5" />
                    <span>{showcaseData.sampleEditor.previewPost.reposts}</span>
                  </div>
                  <Send className="h-3.5 w-3.5" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
