'use client';

import React from 'react';

interface CircleLoaderProps {
  size?: number;
  className?: string;
  label?: string;
}

export const CircleLoader: React.FC<CircleLoaderProps> = ({
  size = 40,
  className = '',
  label,
}) => {
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div
        className="relative flex items-center justify-center shrink-0"
        style={{ width: size, height: size }}
      >
        {/* Outer trajectory ring */}
        <svg
          className="animate-spin w-full h-full text-coral-500"
          style={{ animationDuration: '2.5s' }}
          viewBox="0 0 50 50"
          fill="none"
        >
          <circle
            cx="25"
            cy="25"
            r="20"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray="31.4 31.4"
            className="opacity-75"
          />
        </svg>

        {/* Counter-rotating inner ring */}
        <svg
          className="absolute inset-1.5 animate-[spin_1.5s_linear_infinite_reverse] w-[calc(100%-12px)] h-[calc(100%-12px)] text-violet-500"
          viewBox="0 0 50 50"
          fill="none"
        >
          <circle
            cx="25"
            cy="25"
            r="18"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="20 40"
            className="opacity-60"
          />
        </svg>

        {/* Core signal node */}
        <div className="h-2 w-2 rounded-full bg-coral-500 animate-pulse" />
      </div>

      {label && (
        <span className="text-xs font-mono font-medium text-text-secondary tracking-wide">
          {label}
        </span>
      )}
    </div>
  );
};

export default CircleLoader;
