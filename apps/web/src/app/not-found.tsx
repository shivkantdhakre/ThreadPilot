'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Home, LayoutDashboard } from 'lucide-react';
import Logo from '../components/ui/Logo';

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-warm-white text-text-primary text-center">
      <div className="w-full max-w-md space-y-6">
        <Link href="/" className="inline-block hover:opacity-95 transition-opacity">
          <Logo size="md" theme="light" />
        </Link>

        {/* Minimal Trajectory Illustration */}
        <div className="relative mx-auto my-6 flex h-36 w-36 items-center justify-center">
          <svg
            className="h-full w-full text-canvas-border"
            viewBox="0 0 120 120"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            {/* Diverging interrupted trajectory */}
            <path
              d="M20 100 C 40 80, 50 40, 70 30 C 90 20, 100 60, 80 80 C 65 95, 45 70, 60 50"
              stroke="#DDD9D1"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="4 4"
            />
            {/* Disconnected loop */}
            <circle cx="60" cy="50" r="4" fill="#FF6B4A" />
            <circle cx="20" cy="100" r="3" fill="#8A8784" />
          </svg>

          <span className="absolute font-mono text-3xl font-extrabold text-text-primary tracking-tighter">
            404
          </span>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold tracking-tight text-text-primary font-display">
            A thread temporarily lost its route
          </h2>
          <p className="text-xs sm:text-sm text-text-secondary leading-relaxed max-w-sm mx-auto">
            The page or resource you requested has disconnected from the active ThreadPilot navigation graph.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Link
            href="/dashboard"
            className="btn-primary text-xs py-2.5 px-4 inline-flex items-center gap-2 shadow-subtle"
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            <span>Back to Dashboard</span>
          </Link>
          <Link
            href="/"
            className="btn-secondary text-xs py-2.5 px-4 inline-flex items-center gap-2"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Go to Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
