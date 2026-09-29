'use client';

import React from 'react';
import {
  motion,
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useTransform,
} from 'framer-motion';

export interface MovingBorderProps {
  children: React.ReactNode;
  duration?: number;
  rx?: string;
  ry?: string;
  className?: string;
  containerClassName?: string;
  borderClassName?: string;
  as?: React.ElementType;
}

export const MovingBorder: React.FC<MovingBorderProps> = ({
  children,
  duration = 3500,
  rx = '16px',
  ry = '16px',
  className = '',
  containerClassName = '',
  borderClassName = '',
  as: Component = 'div',
  ...otherProps
}) => {
  const pathRef = React.useRef<SVGRectElement>(null);
  const progress = useMotionValue<number>(0);

  useAnimationFrame((time) => {
    const length = pathRef.current?.getTotalLength();
    if (length) {
      const pxPerMillisecond = length / duration;
      progress.set((time * pxPerMillisecond) % length);
    }
  });

  const x = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).x
  );
  const y = useTransform(
    progress,
    (val) => pathRef.current?.getPointAtLength(val).y
  );

  const transform = useMotionTemplate`translateX(${x}px) translateY(${y}px) translateX(-50%) translateY(-50%)`;

  return (
    <Component
      className={`relative overflow-hidden p-[1.5px] ${containerClassName}`}
      style={{ borderRadius: rx }}
      {...otherProps}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ borderRadius: rx }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="none"
          className="absolute h-full w-full"
          width="100%"
          height="100%"
        >
          <rect
            fill="none"
            width="100%"
            height="100%"
            rx={rx}
            ry={ry}
            ref={pathRef}
          />
        </svg>
        <motion.div
          style={{
            top: 0,
            left: 0,
            position: 'absolute',
            transform,
          }}
        >
          <div
            className={`h-16 w-16 opacity-70 blur-[3px] bg-gradient-to-r from-coral-500 via-lava-orange to-violet-500 ${borderClassName}`}
          />
        </motion.div>
      </div>

      <div
        className={`relative z-10 w-full rounded-[calc(${rx}-1.5px)] bg-white ${className}`}
      >
        {children}
      </div>
    </Component>
  );
};

export default MovingBorder;
