'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Menu, X, ArrowRight } from 'lucide-react';
import { Logo } from '../ui/Logo';
import { navigationItems, navActions } from '../../data/threadpilot/navigation';

export const Navbar: React.FC = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        isScrolled
          ? 'bg-warm-white/95 backdrop-blur-md border-b border-canvas-border shadow-subtle py-3'
          : mobileMenuOpen
          ? 'bg-warm-white border-b border-canvas-border py-4 shadow-subtle'
          : 'bg-warm-white/80 backdrop-blur-sm border-b border-canvas-border/50 py-4'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Logo size="md" theme="light" />
        </Link>

        {/* Center Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {navigationItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className="transition-colors relative py-1 text-text-secondary hover:text-text-primary"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right CTA Actions */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href={navActions.signIn.href}
            className="text-xs font-semibold px-4 py-2 transition-colors text-text-secondary hover:text-text-primary"
          >
            {navActions.signIn.label}
          </Link>
          <Link
            href={navActions.getStarted.href}
            className="btn-primary text-xs py-2 px-4 shadow-subtle inline-flex items-center gap-1.5"
          >
            <span>{navActions.getStarted.label}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="md:hidden p-2 rounded-lg transition-colors text-text-primary hover:bg-paper"
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="md:hidden px-6 py-6 shadow-xl animate-fade-in bg-warm-white border-b border-canvas-border">
          <nav className="flex flex-col gap-4 text-base font-medium mb-6 text-text-secondary">
            {navigationItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className="transition-colors py-1 hover:text-text-primary"
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div className="flex flex-col gap-3 pt-4 border-t border-canvas-border">
            <Link
              href={navActions.signIn.href}
              onClick={() => setMobileMenuOpen(false)}
              className="text-center py-2 text-sm font-semibold transition-colors text-text-secondary hover:text-text-primary"
            >
              {navActions.signIn.label}
            </Link>
            <Link
              href={navActions.getStarted.href}
              onClick={() => setMobileMenuOpen(false)}
              className="btn-primary text-center py-2.5 text-sm shadow-subflex items-center justify-center gap-2"
            >
              <span>{navActions.getStarted.label}</span>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </header>
  );
};
