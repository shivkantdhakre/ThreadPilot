'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  PenSquare,
  Calendar,
  Sparkles,
  Share2,
  Settings,
  LogOut,
  ChevronDown,
  Check,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Logo from './ui/Logo';

export function Sidebar() {
  const pathname = usePathname();
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Content Studio', href: '/create', icon: PenSquare },
    { name: 'Publishing Calendar', href: '/schedules', icon: Calendar },
    { name: 'Voice & Profile', href: '/profile', icon: Sparkles },
    { name: 'Accounts', href: '/connect', icon: Share2 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/[0.08] bg-[#0E0E13]/95 backdrop-blur-2xl">
      {/* Brand Header */}
      <div className="flex h-16 items-center border-b border-white/[0.08] px-6">
        <Link href="/dashboard" className="flex items-center">
          <Logo size="md" />
        </Link>
      </div>

      {/* Workspace Selector */}
      <div className="border-b border-white/[0.08] px-4 py-3">
        <div className="relative">
          <button
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-white/[0.06] bg-ink-850/80 px-3.5 py-2.5 text-left text-xs transition-all hover:border-white/15 hover:bg-ink-800"
          >
            <div className="truncate pr-2">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">Workspace</div>
              <div className="font-semibold text-white/95 truncate text-xs">{workspace?.name ?? 'Personal'}</div>
            </div>
            <ChevronDown className={`h-3.5 w-3.5 text-white/40 transition-transform duration-200 ${isWorkspaceMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          <AnimatePresence>
            {isWorkspaceMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full mt-1.5 rounded-xl border border-white/10 bg-ink-800 p-1.5 shadow-2xl z-50 backdrop-blur-xl"
              >
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={() => {
                      switchWorkspace(w.id);
                      setIsWorkspaceMenuOpen(false);
                    }}
                    className={`flex items-center justify-between w-full rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                      w.id === workspace?.id
                        ? 'bg-coral-500/15 text-coral-300 font-semibold'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.id === workspace?.id && <Check className="h-3 w-3 text-coral-400 shrink-0" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href as any}
              className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-coral-500/15 text-coral-400 font-semibold border border-coral-500/25 shadow-sm'
                  : 'text-white/60 hover:bg-white/[0.04] hover:text-white'
              }`}
            >
              <item.icon
                className={`h-4 w-4 transition-colors ${
                  isActive ? 'text-coral-400' : 'text-white/40 group-hover:text-white/80'
                }`}
              />
              <span className="truncate">{item.name}</span>
              {isActive && (
                <div className="absolute right-2.5 h-1.5 w-1.5 rounded-full bg-coral-400 shadow-glow" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* User profile & logout */}
      <div className="border-t border-white/[0.08] p-3">
        <div className="flex items-center justify-between rounded-xl bg-ink-850/80 border border-white/[0.06] p-2.5">
          <div className="truncate pr-2">
            <div className="text-xs font-semibold text-white/90 truncate">{user?.email}</div>
            <div className="text-[10px] text-lime-400 flex items-center gap-1.5 mt-0.5 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-400 animate-pulse" />
              Active Session
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="rounded-lg p-2 text-white/40 hover:bg-white/10 hover:text-coral-400 transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
