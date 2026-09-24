'use client';

import React from 'react';
import Link from 'next/link';
import { Logo } from '../ui/Logo';
import { footerData } from '../../data/threadpilot/footer';

export const Footer: React.FC = () => {
  return (
    <footer className="relative z-10 bg-[#0D1018] text-white py-16 px-6 border-t border-white/[0.08]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-10 pb-12 border-b border-white/[0.08]">
          {/* Brand Info (5 cols) */}
          <div className="md:col-span-5 space-y-4">
            <Link href="/" className="inline-block">
              <Logo size="md" theme="dark" />
            </Link>
            <p className="text-xs text-white/50 max-w-sm leading-relaxed">
              {footerData.tagline}
            </p>
            <div className="pt-2 text-xs text-white/40">
              Built for creators, developers, founders and teams who think in public.
            </div>
          </div>

          {/* Nav Columns (7 cols) */}
          <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-8 text-xs">
            {footerData.columns.map((col) => (
              <div key={col.title}>
                <h4 className="font-bold text-white uppercase tracking-wider mb-3 font-mono text-[11px]">
                  {col.title}
                </h4>
                <ul className="space-y-2.5 text-white/60">
                  {col.links.map((link) => (
                    <li key={link.label}>
                      <a href={link.href} className="hover:text-white transition-colors">
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-white/40">
          <div>{footerData.copyright}</div>
          <div className="flex items-center gap-6">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Security</a>
          </div>
        </div>
      </div>
    </footer>
  );
};
