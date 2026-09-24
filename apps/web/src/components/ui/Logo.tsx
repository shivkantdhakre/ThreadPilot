'use client';

import React from 'react';

export interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showWordmark?: boolean;
  className?: string;
  iconOnly?: boolean;
  theme?: 'light' | 'dark';
}

export const LogoIcon: React.FC<{
  size?: number;
  className?: string;
}> = ({
  size = 32,
  className = '',
}) => {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-105 ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src="/assets/logo.png"
        alt="ThreadPilot"
        width={size}
        height={size}
        className="h-full w-full object-contain"
        loading="eager"
      />
    </div>
  );
};

export const Logo: React.FC<LogoProps> = ({
  size = 'md',
  showWordmark = true,
  className = '',
  iconOnly = false,
  theme = 'dark',
}) => {
  const pixelSize = {
    sm: 24,
    md: 32,
    lg: 40,
    xl: 48,
  }[size];

  const textSize = {
    sm: 'text-base',
    md: 'text-lg',
    lg: 'text-xl',
    xl: 'text-2xl',
  }[size];

  const threadTextColor = theme === 'light' ? 'text-[#151515]' : 'text-white';

  return (
    <div className={`group inline-flex items-center gap-2.5 select-none ${className}`}>
      <LogoIcon size={pixelSize} />
      {showWordmark && !iconOnly && (
        <span className={`font-display font-extrabold tracking-tight leading-none ${threadTextColor} ${textSize}`}>
          Thread<span className="bg-gradient-to-r from-coral-500 via-lava-orange to-electric-orange bg-clip-text text-transparent">Pilot</span>
        </span>
      )}
    </div>
  );
};

export default Logo;
