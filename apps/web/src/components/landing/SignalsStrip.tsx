'use client';

import React from 'react';
import { heroData } from '../../data/threadpilot/hero';

export const SignalsStrip: React.FC = () => {
  return (
    <section className="relative z-10 bg-ivory border-b border-black/[0.06] py-8 px-6 overflow-hidden">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
        {/* Left Label */}
        <div className="text-xs uppercase font-bold tracking-widest text-[#737373]">
          {heroData.trustLabel}
        </div>

        {/* Right Capability Signals */}
        <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-xs sm:text-sm font-bold tracking-wider text-[#151515]">
          {heroData.capabilitySignals.map((signal, idx) => (
            <React.Fragment key={signal}>
              <span className="hover:text-coral-500 transition-colors cursor-default">
                {signal}
              </span>
              {idx < heroData.capabilitySignals.length - 1 && (
                <span className="text-coral-500/60 font-black">•</span>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
};
