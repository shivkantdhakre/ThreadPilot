'use client';

import React from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Clock,
  Zap,
  TrendingUp,
  Sparkles,
  Lock,
} from 'lucide-react';

export const ValueOutcomes: React.FC = () => {
  const principles = [
    {
      icon: ShieldCheck,
      iconColor: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      borderColor: 'border-emerald-200',
      title: 'Zero Sycophancy & Cliché Filtering',
      description:
        'Raw AI models fill posts with emojis and hollow buzzwords. ThreadPilot enforces authentic sentence variation, conversational hooks, and concise syntax.',
      badge: 'Editorial Rule',
    },
    {
      icon: Lock,
      iconColor: 'text-cyan-600',
      bgColor: 'bg-cyan-50',
      borderColor: 'border-cyan-200',
      title: 'Official Meta Graph API Integration',
      description:
        'Direct OAuth 2.0 handshake with Meta. Your user tokens are encrypted at rest with AES-256 GCM in our cryptographic vault. Never scraped, never unverified.',
      badge: 'Platform Security',
    },
    {
      icon: Cpu,
      iconColor: 'text-violet-600',
      bgColor: 'bg-violet-50',
      borderColor: 'border-violet-200',
      title: 'Fail-Safe Event Outbox Architecture',
      description:
        'Schedules execute through a distributed BullMQ transaction outbox with worker lease tokens. If a network blip occurs, posts retry exponentially without dropping.',
      badge: 'Infrastructure',
    },
    {
      icon: TrendingUp,
      iconColor: 'text-coral-600',
      bgColor: 'bg-coral-50',
      borderColor: 'border-coral-200',
      title: 'Continuous Style Drift Calibration',
      description:
        'The platform monitors changes in your vocabulary and audience preferences over 30-day windows, preventing your automated presence from stagnating.',
      badge: 'Intelligence Loop',
    },
  ];

  return (
    <section id="principles" className="relative z-10 bg-paper py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-text-primary bg-canvas-neutral px-3 py-1 rounded-full border border-canvas-border mb-3 font-mono">
            Platform Guarantees
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            Built on verified engineering, not marketing hype.
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            ThreadPilot does not manufacture fake reviews or generic testimonials. Our credibility is built on transparent platform architecture and creator outcomes.
          </p>
        </div>

        {/* 4 Outcome & Principle Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
          {principles.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-3xl border border-canvas-border bg-white p-7 sm:p-8 shadow-subtle hover:shadow-card hover:border-canvas-border-strong transition-all duration-300 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-5">
                    <div className={`h-11 w-11 rounded-2xl ${item.bgColor} border ${item.borderColor} ${item.iconColor} flex items-center justify-center`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-text-muted bg-paper px-2.5 py-1 rounded-full border border-canvas-border">
                      {item.badge}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-text-primary mb-2.5 font-display">{item.title}</h3>
                  <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">{item.description}</p>
                </div>
              </div>
            );
          })}
        </div>

        {/* Technical Specification Strip */}
        <div className="rounded-2xl border border-canvas-border bg-white p-5 shadow-subtle grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-extrabold text-text-primary font-display">500</div>
            <div className="text-[11px] text-text-muted mt-0.5">Strict Character Limit</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary font-display">AES-256</div>
            <div className="text-[11px] text-text-muted mt-0.5">GCM Cryptographic Vault</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary font-display">8D</div>
            <div className="text-[11px] text-text-muted mt-0.5">Voice Vector Dimensions</div>
          </div>
          <div>
            <div className="text-2xl font-extrabold text-text-primary font-display">100%</div>
            <div className="text-[11px] text-text-muted mt-0.5">Official Graph API Direct</div>
          </div>
        </div>
      </div>
    </section>
  );
};
