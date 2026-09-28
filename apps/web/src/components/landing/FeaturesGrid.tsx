'use client';

import React from 'react';
import {
  Sparkles,
  Fingerprint,
  Calendar,
  BarChart3,
  MessageSquare,
  Folder,
  Sliders,
  Shield,
} from 'lucide-react';
import { featuresData, FeatureItem } from '../../data/threadpilot/features';

const featureIcons: Record<string, React.ElementType> = {
  sparkles: Sparkles,
  fingerprint: Fingerprint,
  calendar: Calendar,
  'bar-chart': BarChart3,
  'message-square': MessageSquare,
  folder: Folder,
  sliders: Sliders,
  shield: Shield,
};

export const FeaturesGrid: React.FC = () => {
  return (
    <section id="features" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
            {featuresData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {featuresData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            {featuresData.subtext}
          </p>
        </div>

        {/* 8 Feature Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {featuresData.features.map((feat: FeatureItem) => {
            const Icon = featureIcons[feat.iconName] || Sparkles;
            return (
              <div
                key={feat.id}
                className="rounded-3xl border border-canvas-border bg-white p-6 shadow-subtle hover:shadow-card hover:border-canvas-border-strong transition-all duration-300 flex flex-col justify-between group"
              >
                <div>
                  <div className="h-11 w-11 rounded-2xl bg-coral-50 border border-coral-100 text-coral-600 flex items-center justify-center mb-5 group-hover:scale-105 transition-transform">
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-base font-bold text-text-primary mb-2">{feat.title}</h3>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    {feat.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
