'use client';

import React from 'react';

export interface MarqueeProps {
  children: React.ReactNode;
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
  reverse?: boolean;
  className?: string;
}

export const Marquee: React.FC<MarqueeProps> = ({
  children,
  pauseOnHover = true,
  reverse = false,
  className = '',
}) => {
  return (
    <div
      className={`group flex overflow-hidden p-2 [--duration:35s] [--gap:1.5rem] [gap:var(--gap)] ${className}`}
    >
      <div
        className={`flex shrink-0 justify-around [gap:var(--gap)] animate-marquee ${
          pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''
        }`}
        style={{
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {children}
      </div>
      <div
        aria-hidden="true"
        className={`flex shrink-0 justify-around [gap:var(--gap)] animate-marquee ${
          pauseOnHover ? 'group-hover:[animation-play-state:paused]' : ''
        }`}
        style={{
          animationDirection: reverse ? 'reverse' : 'normal',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default Marquee;
