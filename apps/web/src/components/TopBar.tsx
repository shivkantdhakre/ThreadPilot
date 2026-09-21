'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Sparkles, RefreshCw } from 'lucide-react';
import { apiClient } from '../lib/api-client';

export function TopBar({ title }: { title: string }) {
  const [isSystemOnline, setIsSystemOnline] = useState<boolean | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await apiClient.get<{ unreadCount: number }>('/notifications?unreadOnly=true');
        setUnreadCount(res.unreadCount ?? 0);
      } catch {}
    }

    async function checkHealth() {
      try {
        const res = await apiClient.get<{ status?: string }>('/health', { skipAuth: true });
        setIsSystemOnline(res.status === 'ok');
      } catch {
        setIsSystemOnline(false);
      }
    }

    fetchNotifications();
    checkHealth();
    const interval = setInterval(checkHealth, 20_000);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-slate-950/60 px-8 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            isSystemOnline === null
              ? 'border-white/10 bg-white/5 text-white/50'
              : isSystemOnline
              ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
          title={isSystemOnline ? 'Backend services & database active' : 'Backend connection unavailable'}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isSystemOnline === null
                ? 'bg-white/30'
                : isSystemOnline
                ? 'bg-emerald-500 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
          {isSystemOnline === null ? 'Connecting...' : isSystemOnline ? 'System Online' : 'System Offline'}
        </div>

        <button
          className="relative rounded-lg border border-white/10 bg-white/5 p-2 text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          title="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-brand-500 text-[10px] font-bold text-white">
              {unreadCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}
