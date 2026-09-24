'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Wifi, WifiOff } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { NotificationDropdown } from './NotificationDropdown';

export function TopBar({ title }: { title: string }) {
  const [isSystemOnline, setIsSystemOnline] = useState<boolean | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/[0.08] bg-[#0B0B0F]/85 px-8 backdrop-blur-xl">
      <div className="flex items-center gap-3">
        <h1 className="text-base sm:text-lg font-bold text-white tracking-tight font-display">{title}</h1>
      </div>

      <div className="flex items-center gap-3">
        {/* System Online Badge */}
        <div
          className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
            isSystemOnline === null
              ? 'border-white/10 bg-white/5 text-white/50'
              : isSystemOnline
              ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
              : 'border-rose-500/30 bg-rose-500/10 text-rose-400'
          }`}
          title={isSystemOnline ? 'Backend microservices & database active' : 'Backend connection unavailable'}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isSystemOnline === null
                ? 'bg-white/30'
                : isSystemOnline
                ? 'bg-emerald-400 animate-pulse'
                : 'bg-rose-500'
            }`}
          />
          <span className="hidden sm:inline">
            {isSystemOnline === null ? 'Connecting...' : isSystemOnline ? 'System Online' : 'System Offline'}
          </span>
        </div>

        {/* Notification Bell & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className={`relative rounded-xl border p-2 transition-all duration-200 ${
              isNotificationsOpen
                ? 'border-coral-500/50 bg-coral-500/15 text-white ring-2 ring-coral-500/25 shadow-glow'
                : 'border-white/10 bg-ink-850 text-white/70 hover:border-white/20 hover:bg-ink-800 hover:text-white'
            }`}
            title="Notifications"
            aria-label="Toggle notifications menu"
            aria-expanded={isNotificationsOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-coral-500 text-[10px] font-bold text-white shadow-glow">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationDropdown
            isOpen={isNotificationsOpen}
            onClose={() => setIsNotificationsOpen(false)}
            unreadCount={unreadCount}
            onUnreadCountChange={setUnreadCount}
          />
        </div>
      </div>
    </header>
  );
}
