'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AtSign, Sparkles, ArrowRight, ShieldCheck, Zap, Bot } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  return (
    <div className="relative min-h-screen bg-slate-950 flex flex-col justify-between overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/20 rounded-full blur-[140px] pointer-events-none" />

      {/* Nav */}
      <header className="relative z-10 flex h-20 items-center justify-between px-8 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 shadow-md">
            <AtSign className="h-5 w-5 text-white" />
          </div>
          <span className="text-lg font-bold tracking-tight text-white">ThreadPilot</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/login" className="btn-ghost text-xs py-2 px-4">
            Sign In
          </Link>
          <Link href="/register" className="btn-primary text-xs py-2 px-4">
            Get Started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 max-w-4xl mx-auto my-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-500/30 bg-brand-500/10 px-3.5 py-1 text-xs font-semibold text-brand-300 mb-6">
          <Sparkles className="h-3.5 w-3.5" />
          <span>Next-Generation Threads Operating System</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Your personal social presence,{' '}
          <span className="bg-gradient-to-r from-brand-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
            faithfully automated.
          </span>
        </h1>

        <p className="text-base sm:text-lg text-white/60 max-w-2xl mx-auto mb-10 leading-relaxed font-light">
          ThreadPilot learns your writing style, analyzes your past high-performing posts, and drafts
          content that sounds unmistakably like you — verified against strict 500-character constraints.
        </p>

        <div className="flex flex-col sm:flex-row items-center gap-4">
          <Link href="/register" className="btn-primary py-3 px-6 text-sm flex items-center gap-2">
            <span>Start Building on Threads</span>
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/login"
            className="rounded-xl border border-white/10 bg-white/5 py-3 px-6 text-sm font-medium text-white hover:bg-white/10 transition-colors"
          >
            Existing User Login
          </Link>
        </div>

        {/* Feature Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-16 text-left w-full">
          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md">
            <Bot className="h-5 w-5 text-brand-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">Voice Learning Engine</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Extracts 8 distinct stylistic metrics and maintains a persistent semantic vector memory.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md">
            <Zap className="h-5 w-5 text-amber-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">Deterministic Guardrails</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              Pre-validation ensures non-empty, hook-driven content that never exceeds Meta's 500 char ceiling.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 backdrop-blur-md">
            <ShieldCheck className="h-5 w-5 text-emerald-400 mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">Enterprise Security</h3>
            <p className="text-xs text-white/50 leading-relaxed">
              PKCE OAuth, AES-256-GCM encrypted tokens, and full workspace tenant isolation.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-6 text-center text-xs text-white/40">
        ThreadPilot © 2026 • AI Social Operating System
      </footer>
    </div>
  );
}
