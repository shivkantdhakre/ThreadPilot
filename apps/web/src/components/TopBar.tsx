'use client';

import React, { useState, useEffect } from 'react';
import { Bell, Menu } from 'lucide-react';
import { apiClient } from '../lib/api-client';
import { NotificationDropdown } from './NotificationDropdown';
import { useDashboardLayout } from '../context/DashboardLayoutContext';

interface TopBarProps {
  title: string;
  subtitle?: string;
  onMenuToggle?: () => void;
  actions?: React.ReactNode;
}

export function TopBar({ title, subtitle, onMenuToggle, actions }: TopBarProps) {
  const { toggleMobileNav } = useDashboardLayout();
  const handleToggle = onMenuToggle || toggleMobileNav;
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
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-canvas-border bg-white/95 px-5 sm:px-8 backdrop-blur-md">
      <div className="flex items-center gap-3">
        <button
          onClick={handleToggle}
          className="lg:hidden p-1.5 rounded-lg border border-canvas-border text-text-secondary hover:text-text-primary hover:bg-soft-gray transition-colors"
          aria-label="Toggle navigation menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div>
          <h1 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-text-muted hidden sm:block">{subtitle}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        {actions}

        {/* System Online Status Badge */}
        <div
          className={`flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium transition-all ${
            isSystemOnline === null
              ? 'border-canvas-border bg-soft-gray text-text-muted'
              : isSystemOnline
              ? 'border-lime-200 bg-lime-50 text-lime-800'
              : 'border-rose-200 bg-rose-50 text-rose-800'
          }`}
          title={isSystemOnline ? 'Backend microservices & database active' : 'Backend connection unavailable'}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isSystemOnline === null
                ? 'bg-text-muted/40'
                : isSystemOnline
                ? 'bg-lime-500'
                : 'bg-rose-500'
            }`}
          />
          <span className="hidden md:inline font-mono text-[11px]">
            {isSystemOnline === null ? 'Connecting...' : isSystemOnline ? 'System Online' : 'System Offline'}
          </span>
        </div>

        {/* Notification Bell & Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsNotificationsOpen((prev) => !prev)}
            className={`relative rounded-xl border p-2 transition-all duration-150 ${
              isNotificationsOpen
                ? 'border-coral-300 bg-coral-50 text-coral-600 ring-2 ring-coral-500/15'
                : 'border-canvas-border bg-white text-text-secondary hover:border-canvas-border-muted hover:bg-soft-gray hover:text-text-primary'
            }`}
            title="Notifications"
            aria-label="Toggle notifications menu"
            aria-expanded={isNotificationsOpen}
          >
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -right-1 -top-1 flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-coral-500 text-[10px] font-bold text-white shadow-sm">
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

export default TopBar;
