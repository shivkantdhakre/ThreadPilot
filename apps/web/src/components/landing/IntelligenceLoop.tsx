'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Share2,
  BarChart3,
  Bot,
  Fingerprint,
  Sparkles,
  Calendar,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence, useScroll, useMotionValueEvent } from 'framer-motion';
import { LogoIcon } from '../ui/Logo';
import { intelligenceData, IntelligenceNode } from '../../data/threadpilot/intelligence';
import { NumberTicker } from '../ui/NumberTicker';

const loopNodes = [
  {
    id: '1',
    label: '1. Threads',
    sublabel: 'Live content',
    angle: -90,
    left: '50%',
    top: '14.42%',
    x: 260,
    y: 75,
    icon: Share2,
    activeColor: '#FF6B4A',
    activeClass: 'border-2 border-coral-500 text-coral-600 ring-4 ring-coral-500/20 shadow-glow',
    idleBorder: 'border border-coral-200 text-coral-600',
    placement: 'above',
  },
  {
    id: '2',
    label: '2. Analytics',
    sublabel: 'Real signals',
    angle: -30,
    left: '80.81%',
    top: '32.21%',
    x: 420.2,
    y: 167.5,
    icon: BarChart3,
    activeColor: '#00ADB5',
    activeClass: 'border-2 border-cyan-500 text-cyan-600 ring-4 ring-cyan-500/20 shadow-glow',
    idleBorder: 'border border-cyan-200 text-cyan-600',
    placement: 'right',
  },
  {
    id: '3',
    label: '3. Learning',
    sublabel: 'Finds patterns',
    angle: 30,
    left: '80.81%',
    top: '67.79%',
    x: 420.2,
    y: 352.5,
    icon: Bot,
    activeColor: '#7C3AED',
    activeClass: 'border-2 border-purple-500 text-purple-600 ring-4 ring-purple-500/20 shadow-glow',
    idleBorder: 'border border-purple-200 text-purple-600',
    placement: 'right',
  },
  {
    id: '4',
    label: '4. Profile',
    sublabel: 'Refines voice',
    angle: 90,
    left: '50%',
    top: '85.58%',
    x: 260,
    y: 445,
    icon: Fingerprint,
    activeColor: '#8B5CF6',
    activeClass: 'border-2 border-violet-500 text-violet-600 ring-4 ring-violet-500/20 shadow-glow',
    idleBorder: 'border border-violet-200 text-violet-600',
    placement: 'below',
  },
  {
    id: '5',
    label: '5. Drafting',
    sublabel: 'Better content',
    angle: 150,
    left: '19.19%',
    top: '67.79%',
    x: 99.8,
    y: 352.5,
    icon: Sparkles,
    activeColor: '#FF7A18',
    activeClass: 'border-2 border-orange-500 text-orange-600 ring-4 ring-orange-500/20 shadow-glow',
    idleBorder: 'border border-orange-200 text-orange-600',
    placement: 'left',
  },
  {
    id: '6',
    label: '6. Publishing',
    sublabel: 'Smart timing',
    angle: 210,
    left: '19.19%',
    top: '32.21%',
    x: 99.8,
    y: 167.5,
    icon: Calendar,
    activeColor: '#65A30D',
    activeClass: 'border-2 border-lime-500 text-lime-600 ring-4 ring-lime-500/20 shadow-glow',
    idleBorder: 'border border-lime-200 text-lime-600',
    placement: 'left',
  },
];

const stageDetails: Record<
  string,
  {
    step: string;
    title: string;
    subtitle: string;
    detail: string;
    metric: string;
    color: string;
    bg: string;
    border: string;
  }
> = {
  '1': {
    step: '01',
    title: 'Live Threads Publishing',
    subtitle: 'Direct Meta Graph API Outbox',
    detail:
      'Posts are dispatched reliably through official Meta OAuth with cryptographic tokens and strict 500-char platform bounds.',
    metric: 'Official Meta Graph API v21',
    color: '#FF6B4A',
    bg: 'bg-coral-50',
    border: 'border-coral-200',
  },
  '2': {
    step: '02',
    title: 'Real-Time Signal Telemetry',
    subtitle: 'Engagement & Conversation Depth',
    detail:
      'Monitors early reply velocity, discussion depth, bookmark rates, and audience drop-off over the critical initial 4 hours.',
    metric: 'Continuous Signal Stream',
    color: '#00ADB5',
    bg: 'bg-cyan-50',
    border: 'border-cyan-200',
  },
  '3': {
    step: '03',
    title: 'Pattern Extraction Engine',
    subtitle: 'Hook & Cadence Deconstruction',
    detail:
      'Isolates which opening hooks, formatting densities, and post lengths provoked high-quality replies vs passive scrolling.',
    metric: 'High-Resonance Extraction',
    color: '#7C3AED',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
  },
  '4': {
    step: '04',
    title: 'Personal Voice Profile',
    subtitle: '8D Vector Recalibration',
    detail:
      'Updates your private stylistic weights across sentence rhythm, vocabulary complexity, and technical depth in prompt memory.',
    metric: '8D Stylistic Recalibration',
    color: '#8B5CF6',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
  },
  '5': {
    step: '05',
    title: 'Calibrated Content Drafting',
    subtitle: 'Adaptive Idea Generation',
    detail:
      'Next drafts inherit the validated structural strengths of past winners while eliminating robotic tropes and low-performing patterns.',
    metric: 'Zero-AI-Slop Guarantee',
    color: '#FF7A18',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
  },
  '6': {
    step: '06',
    title: 'Smart Scheduling & Cadence',
    subtitle: 'Audience Peak Optimization',
    detail:
      'Pins drafts into highest-probability engagement windows, queuing them into the BullMQ outbox with automatic retry safety.',
    metric: 'Optimal Discovery Cadence',
    color: '#65A30D',
    bg: 'bg-lime-50',
    border: 'border-lime-200',
  },
};

export const IntelligenceLoop: React.FC = () => {
  const [activeNode, setActiveNode] = useState<string>('1');
  const [isHovered, setIsHovered] = useState<boolean>(false);
  const sectionRef = useRef<HTMLElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });

  // Scroll-driven sequential node progression
  useMotionValueEvent(scrollYProgress, 'change', (latest) => {
    if (isHovered) return;
    if (latest >= 0.25 && latest <= 0.75) {
      const normalized = (latest - 0.25) / 0.5;
      const stageIdx = Math.min(6, Math.max(1, Math.floor(normalized * 6) + 1));
      setActiveNode(String(stageIdx));
    }
  });

  // Idle continuous auto-cycling (every 4.5s)
  useEffect(() => {
    if (isHovered) return;
    const timer = setInterval(() => {
      setActiveNode((prev) => {
        const next = (parseInt(prev, 10) % 6) + 1;
        return String(next);
      });
    }, 4500);
    return () => clearInterval(timer);
  }, [isHovered]);

  const currentStage = stageDetails[activeNode] || stageDetails['1']!;
  const activeNodeData = loopNodes.find((n) => n.id === activeNode) || loopNodes[0]!;

  return (
    <section
      id="intelligence"
      ref={sectionRef}
      className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border overflow-hidden"
    >
      {/* Ambient background glows */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[650px] w-[650px] rounded-full bg-gradient-to-tr from-coral-500/8 via-violet-500/6 to-cyan-500/6 blur-[150px]" />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-14"
        >
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3 font-mono">
            {intelligenceData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {intelligenceData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed font-sans">
            {intelligenceData.subtext}
          </p>
        </motion.div>

        {/* Circular Signature Visualization */}
        <div className="relative max-w-3xl mx-auto py-8 sm:py-12 flex items-center justify-center">
          {/* Orbital Circular Track Container */}
          <div className="relative w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] md:w-[520px] md:h-[520px] flex items-center justify-center">
            {/* SVG Connecting Circle with Animated Looping Gradient and Radial Guides */}
            <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 520 520">
              <defs>
                <linearGradient id="orbit-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#FF6B4A" />
                  <stop offset="35%" stopColor="#00ADB5" />
                  <stop offset="65%" stopColor="#7C3AED" />
                  <stop offset="100%" stopColor="#84CC16" />
                </linearGradient>
                <filter id="orbit-glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              {/* Outer static guide track */}
              <circle
                cx="260"
                cy="260"
                r="185"
                fill="none"
                stroke="rgba(0,0,0,0.06)"
                strokeWidth="1.5"
              />

              {/* Inner counter-guide track */}
              <circle
                cx="260"
                cy="260"
                r="140"
                fill="none"
                stroke="rgba(0,0,0,0.04)"
                strokeWidth="1"
                strokeDasharray="4 8"
              />

              {/* Subtle radial guide spokes connecting center to each node angle */}
              {[ -90, -30, 30, 90, 150, 210 ].map((deg) => (
                <line
                  key={deg}
                  x1="260"
                  y1="260"
                  x2={260 + 185 * Math.cos((deg * Math.PI) / 180)}
                  y2={260 + 185 * Math.sin((deg * Math.PI) / 180)}
                  stroke="rgba(255, 107, 74, 0.08)"
                  strokeWidth="1"
                  strokeDasharray="2 4"
                />
              ))}

              {/* Active Energetic Beam from Center Logo to Active Station */}
              <motion.line
                key={`beam-${activeNode}`}
                initial={{ opacity: 0, pathLength: 0 }}
                animate={{ opacity: 0.8, pathLength: 1 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                x1="260"
                y1="260"
                x2={activeNodeData.x}
                y2={activeNodeData.y}
                stroke={activeNodeData.activeColor}
                strokeWidth="2"
                strokeDasharray="4 4"
                className="opacity-75"
              />

              {/* Animated orbital loop */}
              <motion.circle
                cx="260"
                cy="260"
                r="185"
                fill="none"
                stroke="url(#orbit-gradient)"
                strokeWidth="2.5"
                strokeDasharray="16 12"
                animate={{ rotate: 360 }}
                transition={{ duration: 32, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: 'center' }}
                className="opacity-80"
              />

              {/* Continuous Traveling Energy Photon along the Circular Orbit */}
              <motion.g
                animate={{ rotate: 360 }}
                transition={{ duration: 16, repeat: Infinity, ease: 'linear' }}
                style={{ transformOrigin: '260px 260px' }}
              >
                <circle cx="260" cy="75" r="7" fill={activeNodeData.activeColor} opacity="0.35" filter="url(#orbit-glow)" />
                <circle cx="260" cy="75" r="4.5" fill={activeNodeData.activeColor} />
                <circle cx="260" cy="75" r="2" fill="#FFFFFF" />
              </motion.g>
            </svg>

            {/* Geometric Center: ORIGINAL ThreadPilot 3D Ribbon Logo */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0, rotate: -8 }}
              whileInView={{ scale: 1, opacity: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, type: 'spring', bounce: 0.3 }}
              whileHover={{ scale: 1.08 }}
              className="relative z-20 h-28 w-28 sm:h-36 sm:w-36 rounded-full bg-white border border-canvas-border shadow-xl flex flex-col items-center justify-center p-3 text-center cursor-default ring-4 ring-coral-500/10"
            >
              <LogoIcon size={54} />
              <span className="text-[11px] font-bold text-text-primary mt-1 font-display">ThreadPilot</span>
              <span className="text-[9px] text-coral-600 font-mono uppercase font-bold tracking-wider">Self-Learning</span>
            </motion.div>

            {/* Orbit Stations (Mapped with Staggered Entrance & Motion Effects) */}
            {loopNodes.map((node, index) => {
              const Icon = node.icon;
              const isActive = activeNode === node.id;

              return (
                <div
                  key={node.id}
                  style={{ left: node.left, top: node.top }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-auto"
                >
                  <motion.button
                    onClick={() => setActiveNode(node.id)}
                    onMouseEnter={() => {
                      setIsHovered(true);
                      setActiveNode(node.id);
                    }}
                    onMouseLeave={() => setIsHovered(false)}
                    initial={{ scale: 0, opacity: 0 }}
                    whileInView={{ scale: 1, opacity: 1 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{
                      type: 'spring',
                      stiffness: 260,
                      damping: 18,
                      delay: 0.1 + index * 0.08,
                    }}
                    whileHover={{ scale: 1.15 }}
                    whileTap={{ scale: 0.95 }}
                    className={`relative cursor-pointer transition-transform ${
                      isActive ? 'scale-110' : 'opacity-85 hover:opacity-100'
                    }`}
                    aria-label={node.label}
                  >
                    <motion.div
                      animate={{ y: isActive ? 0 : [-2, 2, -2] }}
                      transition={{ duration: 3.5 + index * 0.5, repeat: Infinity, ease: 'easeInOut' }}
                      className={`relative h-11 w-11 sm:h-12 sm:w-12 rounded-2xl bg-white flex items-center justify-center shadow-card transition-all ${
                        isActive ? node.activeClass : node.idleBorder
                      }`}
                    >
                      <Icon className="h-5 w-5" />

                      {/* Active Station Pulse Ripple Ring */}
                      {isActive && (
                        <motion.span
                          animate={{ scale: [1, 1.45, 1], opacity: [0.75, 0, 0.75] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          className="absolute inset-0 rounded-2xl border-2 pointer-events-none"
                          style={{ borderColor: node.activeColor }}
                        />
                      )}
                    </motion.div>

                    {/* Radial Label Placements */}
                    {node.placement === 'above' && (
                      <div className="absolute bottom-[calc(100%+8px)] left-1/2 -translate-x-1/2 flex flex-col items-center whitespace-nowrap pointer-events-none">
                        <span className={`text-xs font-bold font-display ${isActive ? 'text-coral-600 font-extrabold' : 'text-text-primary'}`}>
                          {node.label}
                        </span>
                        <span className="text-[10px] text-text-muted hidden sm:block">{node.sublabel}</span>
                      </div>
                    )}

                    {node.placement === 'below' && (
                      <div className="absolute top-[calc(100%+8px)] left-1/2 -translate-x-1/2 flex flex-col items-center whitespace-nowrap pointer-events-none">
                        <span className={`text-xs font-bold font-display ${isActive ? 'text-violet-600 font-extrabold' : 'text-text-primary'}`}>
                          {node.label}
                        </span>
                        <span className="text-[10px] text-text-muted hidden sm:block">{node.sublabel}</span>
                      </div>
                    )}

                    {node.placement === 'right' && (
                      <div className="absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 flex flex-col items-start whitespace-nowrap text-left pointer-events-none">
                        <span className={`text-xs font-bold font-display ${isActive ? 'text-cyan-600 font-extrabold' : 'text-text-primary'}`}>
                          {node.label}
                        </span>
                        <span className="text-[10px] text-text-muted hidden sm:block">{node.sublabel}</span>
                      </div>
                    )}

                    {node.placement === 'left' && (
                      <div className="absolute right-[calc(100%+10px)] top-1/2 -translate-y-1/2 flex flex-col items-end whitespace-nowrap text-right pointer-events-none">
                        <span className={`text-xs font-bold font-display ${isActive ? 'text-coral-600 font-extrabold' : 'text-text-primary'}`}>
                          {node.label}
                        </span>
                        <span className="text-[10px] text-text-muted hidden sm:block">{node.sublabel}</span>
                      </div>
                    )}
                  </motion.button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Dynamic Active Node Detail Card */}
        <div className="max-w-2xl mx-auto mb-10">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeNode}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-canvas-border bg-white p-5 sm:p-6 shadow-card flex flex-col sm:flex-row items-center justify-between gap-4 text-left"
            >
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-mono font-bold text-coral-600 uppercase">
                    Stage {currentStage.step}
                  </span>
                  <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded border border-canvas-border text-text-muted">
                    {currentStage.subtitle}
                  </span>
                </div>
                <h4 className="text-base sm:text-lg font-bold text-text-primary font-display">
                  {currentStage.title}
                </h4>
                <p className="text-xs sm:text-sm text-text-secondary leading-relaxed mt-1 max-w-lg">
                  {currentStage.detail}
                </p>
              </div>

              <div className="shrink-0 w-full sm:w-auto p-3 rounded-xl bg-paper/60 border border-canvas-border text-right">
                <div className="text-[10px] font-mono uppercase text-text-muted font-bold">Architecture Guarantee</div>
                <div className="text-xs font-bold text-text-primary font-display mt-0.5 flex items-center gap-1.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                  <span>{currentStage.metric}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Supporting Metric Badges with NumberTicker */}
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row items-center justify-center gap-4 text-center">
          <div className="w-full sm:w-1/2 rounded-2xl border border-black/[0.06] bg-white px-6 py-4 shadow-sm hover:shadow-subtle transition-all">
            <div className="text-3xl font-extrabold text-[#151518] font-display">
              +<NumberTicker value={38} />%
            </div>
            <div className="text-xs text-[#5F5D61] mt-1 font-medium">Engagement rate improvement</div>
          </div>
          <div className="w-full sm:w-1/2 rounded-2xl border border-black/[0.06] bg-white px-6 py-4 shadow-sm hover:shadow-subtle transition-all">
            <div className="text-3xl font-extrabold text-[#151518] font-display">
              <NumberTicker value={2.4} decimalPlaces={1} />x
            </div>
            <div className="text-xs text-[#5F5D61] mt-1 font-medium">Better consistency over time</div>
          </div>
        </div>

        <div className="text-center mt-6">
          <span className="text-xs sm:text-sm font-semibold italic text-coral-600">
            "{intelligenceData.handwrittenNote}"
          </span>
        </div>
      </div>
    </section>
  );
};

