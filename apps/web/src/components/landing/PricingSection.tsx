'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Check, ArrowRight } from 'lucide-react';
import { pricingData, PricingTier } from '../../data/threadpilot/pricing';

export const PricingSection: React.FC = () => {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');

  return (
    <section id="pricing" className="relative z-10 bg-ivory py-24 px-6 border-b border-black/[0.06]">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-violet-700 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20 mb-3">
            {pricingData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#151515] tracking-tight font-display mb-4">
            {pricingData.headline}
          </h2>
          <p className="text-base text-[#525252] leading-relaxed mb-8">
            {pricingData.subtext}
          </p>

          {/* Billing Cycle Toggle */}
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-black/[0.05] border border-black/[0.06]">
            <button
              onClick={() => setBillingCycle('monthly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                billingCycle === 'monthly'
                  ? 'bg-white text-[#151515] shadow-sm'
                  : 'text-[#737373] hover:text-[#151515]'
              }`}
            >
              Monthly
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                billingCycle === 'yearly'
                  ? 'bg-white text-[#151515] shadow-sm'
                  : 'text-[#737373] hover:text-[#151515]'
              }`}
            >
              <span>Yearly</span>
              <span className="text-[10px] font-bold text-coral-600 bg-coral-100 px-1.5 py-0.5 rounded-full">
                {pricingData.discountBadge}
              </span>
            </button>
          </div>
        </div>

        {/* 3 Tier Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
          {pricingData.plans.map((plan: PricingTier) => {
            const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
            return (
              <div
                key={plan.id}
                className={`rounded-3xl border p-8 flex flex-col justify-between transition-all duration-300 relative ${
                  plan.popular
                    ? 'border-coral-500/50 bg-white shadow-xl md:-translate-y-2 ring-1 ring-coral-500/30'
                    : 'border-black/[0.06] bg-white/70 hover:bg-white hover:shadow-md'
                }`}
              >
                <div>
                  {/* Card Header */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-base font-bold text-[#151515]">{plan.name}</span>
                    {plan.badge && (
                      <span className="text-[10px] font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-2.5 py-0.5 rounded-full border border-coral-500/20">
                        {plan.badge}
                      </span>
                    )}
                  </div>

                  {/* Price Display */}
                  <div className="flex items-baseline gap-1.5 mb-3">
                    <span className="text-4xl sm:text-5xl font-extrabold text-[#151515] font-display">
                      ${price}
                    </span>
                    <span className="text-xs text-[#737373]">/ month</span>
                  </div>

                  <p className="text-xs text-[#525252] leading-relaxed mb-6">
                    {plan.description}
                  </p>

                  {/* Features List */}
                  <div className="space-y-3 pt-4 border-t border-black/[0.06] mb-8">
                    {plan.features.map((feat) => (
                      <div key={feat} className="flex items-center gap-2.5 text-xs text-[#151515]">
                        <Check className="h-4 w-4 text-coral-600 shrink-0" />
                        <span>{feat}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* CTA Button */}
                <Link
                  href="/register"
                  className={`w-full text-center py-3 rounded-xl text-xs font-bold transition-all ${
                    plan.popular
                      ? 'btn-primary shadow-sm'
                      : 'btn-secondary'
                  }`}
                >
                  {plan.ctaLabel}
                </Link>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
