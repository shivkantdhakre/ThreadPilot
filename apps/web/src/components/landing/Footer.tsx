'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '../ui/Logo';
import { footerData } from '../../data/threadpilot/footer';

export const Footer: React.FC = () => {
  return (
    <footer className="relative z-10 bg-paper text-text-primary py-20 px-6 border-t border-canvas-border overflow-hidden">
      {/* Subtle ThreadPilot Trajectory Pattern in Background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.04]">
        <svg className="w-full h-full" viewBox="0 0 1200 400" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M -50 200 C 200 50, 400 350, 700 150 C 950 0, 1100 300, 1300 180"
            stroke="currentColor"
            strokeWidth="3"
            strokeDasharray="8 8"
          />
          <circle cx="700" cy="150" r="8" fill="currentColor" />
          <circle cx="200" cy="50" r="5" fill="currentColor" />
        </svg>
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-12 pb-14 border-b border-canvas-border">
          {/* Brand Area (4 cols) */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="inline-block">
              <Logo size="md" theme="light" />
            </Link>
            <p className="text-xs sm:text-sm text-text-secondary max-w-sm leading-relaxed">
              {footerData.tagline} Built around personal voice modeling, intelligent cadence, and continuous learning.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-800">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>All Systems Operational • Meta Graph API Active</span>
            </div>
          </div>

          {/* Nav Columns (7 cols) */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8 text-xs">
            {footerData.columns.map((col) => (
              <div key={col.title}>
                <h4 className="font-bold text-text-primary uppercase tracking-wider mb-4 font-mono text-[11px]">
                  {col.title}
                </h4>
                <ul className="space-y-3 text-text-secondary">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="hover:text-coral-600 transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar: Legal & Social */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-text-muted">
          <div>
            {footerData.copyright} • Built for creators, founders, and teams who think in public.
          </div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-text-primary transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-text-primary transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-text-primary transition-colors">Security Vault</a>
            <a
              href="https://threads.net"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-coral-600 hover:text-coral-700 transition-colors"
            >
              @threadpilot
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

