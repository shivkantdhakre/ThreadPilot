'use client';

import React, { useEffect, useState } from 'react';
import { motion, useScroll, useSpring } from 'framer-motion';

const trajectoryStages = [
  { id: 'hero', label: '01 Idea', href: '#' },
  { id: 'how-it-works', label: '02 Architecture', href: '#how-it-works' },
  { id: 'product', label: '03 Studio', href: '#product' },
  { id: 'voice', label: '04 Voice Vector', href: '#voice' },
  { id: 'scheduler', label: '05 Cadence Queue', href: '#scheduler' },
  { id: 'analytics', label: '06 Telemetry', href: '#analytics' },
  { id: 'intelligence', label: '07 Feedback Loop', href: '#intelligence' },
  { id: 'cta', label: '08 Launch', href: '#cta' },
];

export const TrajectoryScrollThread: React.FC = () => {
  const { scrollYProgress } = useScroll();
  const scaleY = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 30,
    restDelta: 0.001,
  });

  const [activeStage, setActiveStage] = useState<string>('hero');

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const viewportHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;

      // 1. Top zone of page is always 'hero'
      if (scrollY < 180) {
        setActiveStage('hero');
        return;
      }

      // 2. Near bottom of page is always the final stage ('cta')
      if (scrollY + viewportHeight >= documentHeight - 200) {
        setActiveStage(trajectoryStages[trajectoryStages.length - 1]!.id);
        return;
      }

      // 3. Middle sections: find the section that intersects the active focal line (35% from viewport top)
      const focalLine = viewportHeight * 0.35;
      let matched = 'hero';

      for (let i = 0; i < trajectoryStages.length; i++) {
        const stage = trajectoryStages[i]!;
        const el = document.getElementById(stage.id);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        // Section currently contains the focal reading line
        if (rect.top <= focalLine && rect.bottom > focalLine) {
          matched = stage.id;
          break;
        }
        // Section top has crossed the focal line
        if (rect.top <= focalLine) {
          matched = stage.id;
        }
      }

      setActiveStage(matched);
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleScroll);
    };
  }, []);

  return (
    <div className="fixed right-3 2xl:right-6 top-1/2 -translate-y-1/2 z-40 hidden xl:flex flex-col items-center pointer-events-none select-none">
      <div className="pointer-events-auto relative rounded-full border border-canvas-border bg-white/85 p-2 shadow-dropdown backdrop-blur-md flex flex-col items-center">
        {/* Dynamic active trajectory progress line track */}
        <div className="absolute top-4 bottom-4 w-[2px] bg-canvas-border/60 rounded-full" />
        <motion.div
          style={{ scaleY, transformOrigin: 'top' }}
          className="absolute top-4 bottom-4 w-[2px] bg-gradient-to-b from-coral-500 via-violet-500 to-cyan-500 rounded-full"
        />

        {/* Stage Nodes List */}
        <div className="relative z-10 flex flex-col items-center gap-3.5 py-1">
          {trajectoryStages.map((stage) => {
            const isActive = activeStage === stage.id;
            return (
              <a
                key={stage.id}
                href={`#${stage.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  if (stage.id === 'hero') {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } else {
                    const el = document.getElementById(stage.id);
                    if (el) {
                      const navOffset = 80;
                      const elementPosition = el.getBoundingClientRect().top + window.scrollY;
                      window.scrollTo({
                        top: elementPosition - navOffset,
                        behavior: 'smooth',
                      });
                    }
                  }
                }}
                className="group relative flex items-center justify-center p-1 focus:outline-none cursor-pointer"
                aria-label={stage.label}
              >
                {/* Floating Tooltip (Appears to the left on hover) */}
                <div className="absolute right-[calc(100%+8px)] top-1/2 -translate-y-1/2 pointer-events-none opacity-0 group-hover:opacity-100 translate-x-1 group-hover:translate-x-0 transition-all duration-150 z-50">
                  <div className="rounded-md bg-charcoal px-2.5 py-1 text-[10px] font-mono font-medium text-white shadow-dropdown whitespace-nowrap flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-coral-500" />
                    <span>{stage.label}</span>
                  </div>
                </div>

                {/* Bead Indicator */}
                <span
                  className={`h-2.5 w-2.5 rounded-full transition-all duration-200 ${
                    isActive
                      ? 'bg-coral-500 ring-4 ring-coral-500/25 scale-125'
                      : 'bg-canvas-border group-hover:bg-coral-400 group-hover:scale-110'
                  }`}
                />
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default TrajectoryScrollThread;
