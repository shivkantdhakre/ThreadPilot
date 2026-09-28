'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface ThreadPilotLoaderProps {
  message?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ThreadPilotLoader({
  message = 'Processing...',
  size = 'md',
  className = '',
}: ThreadPilotLoaderProps) {
  const dimensions = {
    sm: { w: 32, h: 32, stroke: 1.5, dot: 2 },
    md: { w: 48, h: 48, stroke: 2, dot: 2.5 },
    lg: { w: 64, h: 64, stroke: 2.5, dot: 3.5 },
  }[size];

  return (
    <div className={`flex flex-col items-center justify-center p-6 text-center ${className}`}>
      {/* Dynamic Thread Vector Loop */}
      <div className="relative mb-3 flex items-center justify-center">
        <svg
          width={dimensions.w}
          height={dimensions.h}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Base Trajectory Track */}
          <path
            d="M8 24C8 15.1634 15.1634 8 24 8C32.8366 8 40 15.1634 40 24C40 32.8366 32.8366 40 24 40C18 40 14 36 14 30C14 24 20 20 24 20C28 20 30 22 30 24C30 26 28 28 26 28"
            stroke="#E8E5DF"
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
          />

          {/* Animated Traveling Pulse */}
          <motion.path
            d="M8 24C8 15.1634 15.1634 8 24 8C32.8366 8 40 15.1634 40 24C40 32.8366 32.8366 40 24 40C18 40 14 36 14 30C14 24 20 20 24 20C28 20 30 22 30 24C30 26 28 28 26 28"
            stroke="url(#threadPilotGradient)"
            strokeWidth={dimensions.stroke}
            strokeLinecap="round"
            strokeDasharray="18 90"
            initial={{ strokeDashoffset: 108 }}
            animate={{ strokeDashoffset: 0 }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          />

          <defs>
            <linearGradient id="threadPilotGradient" x1="8" y1="8" x2="40" y2="40" gradientUnits="userSpaceOnUse">
              <stop stopColor="#FF6B4A" />
              <stop offset="0.6" stopColor="#7C3AED" />
              <stop offset="1" stopColor="#00ADB5" />
            </linearGradient>
          </defs>
        </svg>

        {/* Pulsing center node */}
        <motion.div
          animate={{ scale: [1, 1.25, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute h-2 w-2 rounded-full bg-coral-500"
        />
      </div>

      {message && (
        <p className="text-xs font-medium text-text-secondary tracking-tight">
          {message}
        </p>
      )}
    </div>
  );
}

export default ThreadPilotLoader;
