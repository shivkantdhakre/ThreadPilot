'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';

import { Navbar } from '../components/landing/Navbar';
import { HeroSection } from '../components/landing/HeroSection';
import { SignalsStrip } from '../components/landing/SignalsStrip';
import { HowItWorks } from '../components/landing/HowItWorks';
import { ProductShowcase } from '../components/landing/ProductShowcase';
import { AIContentCreation } from '../components/landing/AIContentCreation';
import { PersonalVoiceSection } from '../components/landing/PersonalVoiceSection';
import { SchedulerSection } from '../components/landing/SchedulerSection';
import { AnalyticsSection } from '../components/landing/AnalyticsSection';
import { IntelligenceLoop } from '../components/landing/IntelligenceLoop';
import { FeaturesGrid } from '../components/landing/FeaturesGrid';
import { CreatorWorkflow } from '../components/landing/CreatorWorkflow';
import { ValueOutcomes } from '../components/landing/ValueOutcomes';
import { PricingSection } from '../components/landing/PricingSection';
import { FaqSection } from '../components/landing/FaqSection';
import { FinalCtaSection } from '../components/landing/FinalCtaSection';
import { Footer } from '../components/landing/Footer';
import { TrajectoryScrollThread } from '../components/landing/TrajectoryScrollThread';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen bg-[#FFFDF8] text-[#151518] selection:bg-coral-500 selection:text-white flex flex-col justify-between overflow-x-hidden">
      {/* Scroll-Driven Trajectory Indicator (Right Rail) */}
      <TrajectoryScrollThread />

      {/* 01. Floating Sticky Light Navbar (navbar.gallery) */}
      <Navbar />

      <main className="flex-1">
        {/* 02. Hero Section with Interactive 5-State Live Demo (minimal.gallery + 21st.dev + kinetics) */}
        <HeroSection />

        {/* 03. Trust & Capability Signals Strip (getlayers.ai) */}
        <SignalsStrip />

        {/* 04. How ThreadPilot Works: Connected 6-Stage Loop (minimal.gallery) */}
        <HowItWorks />

        {/* 05. Interactive Product Studio & Live Threads Preview (appshot.gallery) */}
        <ProductShowcase />

        {/* 06. AI Content Creation: 3-Tier Drafting & Voice vs Generic LLM (21st.dev) */}
        <AIContentCreation />

        {/* 07. Personal Voice: 8D Vector Radar & Pattern Extraction (designmd.ai) */}
        <PersonalVoiceSection />

        {/* 08. Smart Scheduling & Optimal Cadence (component.gallery) */}
        <SchedulerSection />

        {/* 09. Restrained Telemetry & Performance Signals (styles.refero.design) */}
        <AnalyticsSection />

        {/* 10. Signature Intelligence Loop: Autonomous Compounding Flywheel (kinetics) */}
        <IntelligenceLoop />

        {/* 11. Bento Feature Architecture with Asymmetric Hierarchy (minimal.gallery) */}
        <FeaturesGrid />

        {/* 12. Creator Workflow: Editorial Product Showcase (appshot.gallery) */}
        <CreatorWorkflow />

        {/* 13. Verified Product Outcomes & Architecture Commitments (minimal.gallery) */}
        <ValueOutcomes />

        {/* 14. Transparent Pricing Matrix (component.gallery + cta.gallery) */}
        <PricingSection />

        {/* 15. Real Architecture FAQ Accordion (shadcn/ui + component.gallery) */}
        <FaqSection />

        {/* 16. Final Calm & Confident Conversion CTA (cta.gallery) */}
        <FinalCtaSection />
      </main>

      {/* 17. High-Craft Editorial Footer (footer.design) */}
      <Footer />
    </div>
  );
}
