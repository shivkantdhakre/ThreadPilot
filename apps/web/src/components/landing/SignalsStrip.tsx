'use client';

import React from 'react';
import { heroData } from '../../data/threadpilot/hero';
import { Marquee } from '../ui/Marquee';

const architecturalPillars = [
  'Meta Graph API v21 Integration',
  '8-Dimensional Stylistic Voice Vectorization',
  'Strict 500-Character Platform Bounds',
  'BullMQ Event-Driven Outbox with Retry Safety',
  'Continuous Feedback Loop from Real Telemetry',
  'Self-Calibrating Hook & Cadence Engine',
  'Encrypted User Credential Vault',
];

export const SignalsStrip: React.FC = () => {
  return (
    <section className="relative z-10 bg-paper border-b border-canvas-border py-5 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center gap-6">
        {/* Left Label */}
        <div className="text-xs uppercase font-bold tracking-widest text-text-muted shrink-0 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span>{heroData.trustLabel}</span>
        </div>

        {/* Right Flowing Marquee Strip */}
        <div className="flex-1 overflow-hidden relative">
          {/* Subtle gradient edge fades */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-paper to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-paper to-transparent z-10" />

          <Marquee pauseOnHover={true} className="py-0">
            {architecturalPillars.map((pillar) => (
              <div
                key={pillar}
                className="flex items-center gap-3 text-xs sm:text-sm font-semibold tracking-wide text-text-primary px-3 py-1 rounded-lg bg-white border border-canvas-border shadow-2xs whitespace-nowrap cursor-default hover:border-coral-300 transition-colors"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-coral-500" />
                <span>{pillar}</span>
              </div>
            ))}
          </Marquee>
        </div>
      </div>
    </section>
  );
};

