'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';

import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { SignalsStrip } from '../components/landing/SignalsStrip';
import { HowItWorks } from '../components/landing/HowItWorks';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { PersonalVoiceSection } from '../components/landing/PersonalVoiceSection';
import { SchedulerSection } from '../components/landing/SchedulerSection';
import { AnalyticsSection } from '../components/landing/AnalyticsSection';
import { IntelligenceLoop } from '../components/landing/IntelligenceLoop';
import { FeaturesGrid } from '../components/landing/FeaturesGrid';
import { PricingSection } from '../components/landing/PricingSection';
import { FinalCtaSection } from '../components/landing/FinalCtaSection';
import { Footer } from '../components/landing/Footer';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-ivory text-[#151515] selection:bg-coral-500 selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* 1. Floating Sticky Navbar */}
      <Navbar />

      <main className="flex-1">
        {/* 2. Hero Section (Cinematic Dark Stage on Ambient Backdrop) */}
        <HeroSection />

        {/* 3. Capability Signals Strip (Light Ivory) */}
        <SignalsStrip />

        {/* 4. How It Works (6-Step Connected Flow on Paper White) */}
        <HowItWorks />

        {/* 5. Product Showcase (Dark Contrast Creative Command Center) */}
        <ProductShowcase />

        {/* 6. Personal Voice Section (3-Panel Analysis on Warm Ivory) */}
        <PersonalVoiceSection />

        {/* 7. Smart Scheduling & Cadence (Paper White Calendar Grid) */}
        <SchedulerSection />

        {/* 8. Analytics Deep-Dive (Dark Contrast Telemetry Surface) */}
        <AnalyticsSection />

        {/* 9. Signature Intelligence Loop (Self-Improving Feedback System) */}
        <IntelligenceLoop />

        {/* 10. Powerful Features Grid (Muted Neutral Surface) */}
        <FeaturesGrid />

        {/* 11. Transparent Pricing Matrix (Ivory Canvas with Toggle) */}
        <PricingSection />

        {/* 12. Final Launch CTA (Warm Glow Canvas) */}
        <FinalCtaSection />
      </main>

      {/* 13. Editorial Grounding Footer (Dark #0D1018) */}
      <Footer />
    </div>
  );
}
