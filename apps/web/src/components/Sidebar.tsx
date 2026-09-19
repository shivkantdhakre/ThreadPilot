'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  PenSquare,
  Sparkles,
  Share2,
  Settings,
  LogOut,
  ChevronDown,
  AtSign,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export function Sidebar() {
  const pathname = usePathname();
  const { user, workspace, workspaces, switchWorkspace, logout } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Content Studio', href: '/create', icon: PenSquare },
    { name: 'Voice & Profile', href: '/profile', icon: Sparkles },
    { name: 'Accounts', href: '/connect', icon: Share2 },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur-xl">
      {/* Brand */}
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-6">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-brand-600 to-indigo-500 shadow-md shadow-brand-500/20">
          <AtSign className="h-5 w-5 text-white" />
        </div>
        <div>
          <span className="text-base font-bold tracking-tight text-white">ThreadPilot</span>
          <span className="ml-1.5 rounded bg-brand-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-brand-300">
            v1.0
          </span>
        </div>
      </div>

      {/* Workspace Selector */}
      <div className="border-b border-white/10 px-4 py-3">
        <div className="group relative">
          <button className="flex w-full items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-left text-xs transition-colors hover:bg-white/[0.06]">
            <div className="truncate">
              <div className="text-[10px] uppercase tracking-wider text-white/40">Workspace</div>
              <div className="font-semibold text-white/90 truncate">{workspace?.name ?? 'Personal'}</div>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-white/40" />
          </button>
          {workspaces.length > 1 && (
            <div className="absolute left-0 right-0 top-full mt-1 hidden rounded-lg border border-white/10 bg-slate-900 p-1 shadow-xl group-hover:block z-50">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  className={`w-full rounded px-2.5 py-1.5 text-left text-xs transition-colors ${
                    w.id === workspace?.id
                      ? 'bg-brand-500/20 text-brand-300 font-medium'
                      : 'text-white/70 hover:bg-white/5 hover:text-white'
                  }`}
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname?.startsWith(item.href));
          return (
            <Link
              key={item.name}
              href={item.href as any}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150 ${
                isActive
                  ? 'bg-brand-500/15 text-brand-300 shadow-inner border border-brand-500/20'
                  : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <item.icon className={`h-4 w-4 ${isActive ? 'text-brand-400' : 'text-white/40'}`} />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* User info & logout */}
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center justify-between rounded-lg bg-white/[0.02] p-2.5">
          <div className="truncate pr-2">
            <div className="text-xs font-medium text-white/90 truncate">{user?.email}</div>
            <div className="text-[10px] text-emerald-400 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Online
            </div>
          </div>
          <button
            onClick={logout}
            title="Log out"
            className="rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}
