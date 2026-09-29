'use client';

import React from 'react';

interface ShimmerButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
  className?: string;
  children?: React.ReactNode;
}

export const ShimmerButton = React.forwardRef<HTMLButtonElement, ShimmerButtonProps>(
  (
    {
      shimmerColor = '#ffffff',
      shimmerSize = '0.08em',
      shimmerDuration = '3s',
      borderRadius = '12px',
      background = '#FF6B4A',
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        style={
          {
            '--spread': '90deg',
            '--shimmer-color': shimmerColor,
            '--radius': borderRadius,
            '--speed': shimmerDuration,
            '--cut': shimmerSize,
            '--bg': background,
            borderRadius,
          } as React.CSSProperties
        }
        className={`group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap border border-coral-600/30 px-6 py-3 text-white [background:var(--bg)] active:scale-[0.98] transition-transform duration-150 shadow-sm ${className}`}
        {...props}
      >
        {/* Shimmer sweep effect */}
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <div className="absolute -inset-[100%] animate-[spin_4s_linear_infinite] bg-[conic-gradient(from_0deg_at_50%_50%,transparent_0deg,transparent_340deg,rgba(255,255,255,0.45)_360deg)]" />
        </div>

        {/* Backdrop surface */}
        <div
          className="absolute inset-[1.5px] -z-10 rounded-[calc(var(--radius)-1.5px)] bg-coral-500 transition-colors duration-200 group-hover:bg-coral-600"
        />

        {/* Content */}
        <span className="relative z-10 flex items-center gap-2 text-sm font-semibold tracking-wide">
          {children}
        </span>
      </button>
    );
  }
);

ShimmerButton.displayName = 'ShimmerButton';

export default ShimmerButton;
