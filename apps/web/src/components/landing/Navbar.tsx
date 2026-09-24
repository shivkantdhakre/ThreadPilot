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
          ? 'bg-ivory/85 backdrop-blur-md border-b border-black/[0.06] shadow-sm py-3'
          : mobileMenuOpen
          ? 'bg-[#0D1018]/95 backdrop-blur-md py-4'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 sm:px-10 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3">
          <Logo size="md" theme={isScrolled ? 'light' : 'dark'} />
        </Link>

        {/* Center Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8 text-sm font-medium">
          {navigationItems.map((item) => (
            <a
              key={item.label}
              href={item.href}
              className={`transition-colors relative py-1 ${
                isScrolled
                  ? 'text-[#525252] hover:text-[#151515]'
                  : 'text-white/75 hover:text-white'
              }`}
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Right CTA Actions */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            href={navActions.signIn.href}
            className={`text-xs font-semibold px-4 py-2 transition-colors ${
              isScrolled
                ? 'text-[#525252] hover:text-[#151515]'
                : 'text-white/80 hover:text-white'
            }`}
          >
            {navActions.signIn.label}
          </Link>
          <Link
            href={navActions.getStarted.href}
            className="btn-primary text-xs py-2 px-4 shadow-sm inline-flex items-center gap-1.5"
          >
            <span>{navActions.getStarted.label}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Mobile Hamburger Button */}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`md:hidden p-2 rounded-lg transition-colors ${
            isScrolled
              ? 'text-[#151515] hover:bg-black/5'
              : 'text-white hover:bg-white/10'
          }`}
          aria-label="Toggle Navigation Menu"
        >
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div
          className={`md:hidden px-6 py-6 shadow-xl animate-fade-in ${
            isScrolled
              ? 'bg-ivory border-b border-black/10'
              : 'bg-[#0D1018] border-b border-white/10'
          }`}
        >
          <nav
            className={`flex flex-col gap-4 text-base font-medium mb-6 ${
              isScrolled ? 'text-[#525252]' : 'text-white/80'
            }`}
          >
            {navigationItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`transition-colors py-1 ${
                  isScrolled ? 'hover:text-[#151515]' : 'hover:text-white'
                }`}
              >
                {item.label}
              </a>
            ))}
          </nav>
          <div
            className={`flex flex-col gap-3 pt-4 border-t ${
              isScrolled ? 'border-black/10' : 'border-white/10'
            }`}
          >
            <Link
              href={navActions.signIn.href}
              onClick={() => setMobileMenuOpen(false)}
              className={`text-center py-2 text-sm font-semibold transition-colors ${
                isScrolled
                  ? 'text-[#525252] hover:text-[#151515]'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              {navActions.signIn.label}
            </Link>
            <Link
              href={navActions.getStarted.href}
              onClick={() => setMobileMenuOpen(false)}
              className="btn-primary text-center py-2.5 text-sm shadow-sm flex items-center justify-center gap-2"
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
