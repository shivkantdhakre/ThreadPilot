'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  PenSquare,
  Calendar,
  ListOrdered,
  Layers,
  BarChart3,
  MessageSquare,
  BrainCircuit,
  Sparkles,
  Settings,
  LogOut,
  ChevronDown,
  Check,
  Share2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Logo from './ui/Logo';

export interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export function Sidebar({ mobileOpen = false, onCloseMobile }: { mobileOpen?: boolean; onCloseMobile?: () => void }) {
  const pathname = usePathname();
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false);

  const mainNavigation: NavItem[] = [
    { name: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Create', href: '/create', icon: PenSquare },
    { name: 'Calendar', href: '/schedules', icon: Calendar },
    { name: 'Queue', href: '/queue', icon: ListOrdered },
    { name: 'Posts', href: '/posts', icon: Layers },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Replies', href: '/replies', icon: MessageSquare },
    { name: 'Learning', href: '/learning', icon: BrainCircuit },
    { name: 'Profile', href: '/profile', icon: Sparkles },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  const sidebarContent = (
    <aside className="flex h-full w-64 flex-col border-r border-canvas-border bg-[#FBF9F5] text-text-primary">
      {/* Brand Header */}
      <div className="flex h-16 items-center justify-between border-b border-canvas-border px-5 bg-white">
        <Link
          href="/dashboard"
          className="flex items-center"
          onClick={() => onCloseMobile?.()}
        >
          <Logo size="md" theme="light" />
        </Link>
      </div>

      {/* Workspace Selector */}
      <div className="border-b border-canvas-border px-3.5 py-3 bg-white/70">
        <div className="relative">
          <button
            onClick={() => setIsWorkspaceMenuOpen((prev) => !prev)}
            className="flex w-full items-center justify-between rounded-xl border border-canvas-border bg-white px-3 py-2 text-left text-xs transition-all hover:border-canvas-border-muted hover:bg-paper"
            aria-expanded={isWorkspaceMenuOpen}
            aria-label="Select workspace"
          >
            <div className="truncate pr-2">
              <div className="text-[10px] uppercase font-bold tracking-wider text-text-muted">Workspace</div>
              <div className="font-semibold text-text-primary truncate text-xs">{workspace?.name ?? 'Personal'}</div>
            </div>
            <ChevronDown
              className={`h-3.5 w-3.5 text-text-muted transition-transform duration-200 ${
                isWorkspaceMenuOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          <AnimatePresence>
            {isWorkspaceMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
                className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-canvas-border bg-white p-1.5 shadow-dropdown z-50"
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
                        ? 'bg-coral-50 text-coral-600 font-semibold'
                        : 'text-text-secondary hover:bg-soft-gray hover:text-text-primary'
                    }`}
                  >
                    <span className="truncate">{w.name}</span>
                    {w.id === workspace?.id && <Check className="h-3.5 w-3.5 text-coral-500 shrink-0" />}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2.5 py-3">
        <div className="px-2.5 pb-1.5 pt-0.5 text-[10px] font-bold uppercase tracking-wider text-text-muted">
          Platform Workspace
        </div>
        {mainNavigation.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== '/dashboard' && pathname?.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href as any}
              onClick={() => onCloseMobile?.()}
              className={`group relative flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-white text-text-primary font-semibold border border-canvas-border shadow-subtle'
                  : 'text-text-secondary hover:bg-white/80 hover:text-text-primary'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <item.icon
                  className={`h-4 w-4 transition-colors ${
                    isActive ? 'text-coral-500' : 'text-text-muted group-hover:text-text-secondary'
                  }`}
                />
                <span className="truncate">{item.name}</span>
              </div>
              {isActive && (
                <div className="h-1.5 w-1.5 rounded-full bg-coral-500" />
              )}
            </Link>
          );
        })}

        {/* Quick Accounts link */}
        <div className="pt-3">
          <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-text-muted">
            Integrations
          </div>
          <Link
            href="/connect"
            onClick={() => onCloseMobile?.()}
            className={`group flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors ${
              pathname === '/connect'
                ? 'bg-white text-text-primary font-semibold border border-canvas-border shadow-subtle'
                : 'text-text-secondary hover:bg-white/80 hover:text-text-primary'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Share2
                className={`h-4 w-4 ${
                  pathname === '/connect' ? 'text-coral-500' : 'text-text-muted group-hover:text-text-secondary'
                }`}
              />
              <span>Accounts</span>
            </div>
          </Link>
        </div>
      </nav>

      {/* User profile & logout */}
      <div className="border-t border-canvas-border p-3 bg-white">
        <div className="flex items-center justify-between rounded-xl bg-soft-gray/80 border border-canvas-border px-3 py-2">
          <div className="truncate pr-2">
            <div className="text-xs font-semibold text-text-primary truncate">{user?.email}</div>
            <div className="text-[10px] text-lime-700 flex items-center gap-1.5 mt-0.5 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-lime-500" />
              Connected
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            aria-label="Log out of ThreadPilot"
            className="rounded-lg p-1.5 text-text-muted hover:bg-white hover:text-coral-600 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <>
      {/* Desktop Fixed Sidebar */}
      <div className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-40 lg:flex lg:w-64">
        {sidebarContent}
      </div>

      {/* Mobile Slide-Over Backdrop & Drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onCloseMobile}
              className="fixed inset-0 bg-text-primary/30 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: -260 }}
              animate={{ x: 0 }}
              exit={{ x: -260 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 w-64 shadow-2xl"
            >
              {sidebarContent}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
export default Sidebar;
