'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Sparkles, RefreshCw } from 'lucide-react';
import { apiClient } from '../lib/api-client';

export function TopBar({ title }: { title: string }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    async function fetchNotifications() {
      try {
        const res = await apiClient.get<{ unreadCount: number }>('/notifications?unreadOnly=true');
        setUnreadCount(res.unreadCount ?? 0);
      } catch {}
    }
    fetchNotifications();
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-slate-950/60 px-8 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-semibold text-white tracking-tight">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-400">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Worker Active
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
