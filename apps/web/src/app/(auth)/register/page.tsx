'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AtSign, Loader2, ArrowRight, Lock, Mail, Building } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [workspaceName, setWorkspaceName] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password || !workspaceName) return;

    setError('');
    setIsLoading(true);
    try {
      await register(email, password, workspaceName);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Registration failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-radial-gradient">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-tr from-brand-600 to-indigo-500 shadow-xl shadow-brand-500/25 mb-4">
            <AtSign className="h-6 w-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create your Workspace</h1>
          <p className="text-sm text-white/50 mt-1">Start growing on Threads with personal AI agent automation</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-8 shadow-2xl backdrop-blur-xl">
          {error && (
            <div className="mb-5 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Workspace Name</label>
              <div className="relative">
                <Building className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                <input
                  type="text"
                  required
                  value={workspaceName}
                  onChange={(e) => setWorkspaceName(e.target.value)}
                  placeholder="My Brand or Personal"
                  className="input-base pl-9"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Email Address</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="founder@example.com"
                  className="input-base pl-9"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/70 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 h-4 w-4 text-white/30" />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="input-base pl-9"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="btn-primary w-full py-2.5 mt-2 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <span>Create Account</span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 text-center text-xs text-white/40">
            Already have an account?{' '}
            <Link href="/login" className="font-semibold text-brand-400 hover:text-brand-300">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
