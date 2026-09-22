'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clock,
  Inbox,
  X,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiClient } from '../lib/api-client';

export interface NotificationItem {
  id: string;
  workspaceId: string;
  type: string;
  title: string;
  body: string;
  entityType?: string | null;
  entityId?: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationDropdownProps {
  isOpen: boolean;
  onClose: () => void;
  unreadCount: number;
  onUnreadCountChange: (count: number) => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(diffInSeconds) || diffInSeconds < 0) return 'Just now';
    if (diffInSeconds < 60) return 'Just now';
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return 'Recently';
  }
}

export function NotificationDropdown({
  isOpen,
  onClose,
  unreadCount,
  onUnreadCountChange,
}: NotificationDropdownProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const res = await apiClient.get<{ notifications: NotificationItem[]; unreadCount: number }>(
        '/notifications?limit=30'
      );
      setNotifications(res.notifications ?? []);
      onUnreadCountChange(res.unreadCount ?? 0);
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleMarkAsRead = async (item: NotificationItem) => {
    if (item.read) return;

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    onUnreadCountChange(Math.max(0, unreadCount - 1));

    try {
      await apiClient.patch(`/notifications/${item.id}/read`);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  const handleNotificationClick = async (item: NotificationItem) => {
    await handleMarkAsRead(item);

    // Optional contextual routing
    if (item.entityType === 'POST' || item.type.includes('PUBLISH')) {
      onClose();
      router.push('/schedules');
    } else if (item.entityType === 'STYLE' || item.type.includes('STYLE')) {
      onClose();
      router.push('/profile');
    } else if (item.entityType === 'ACCOUNT' || item.type.includes('TOKEN')) {
      onClose();
      router.push('/connect');
    }
  };

  const handleMarkAllAsRead = async () => {
    if (unreadCount === 0 || isMarkingAll) return;
    setIsMarkingAll(true);

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    onUnreadCountChange(0);

    try {
      await apiClient.post('/notifications/read-all');
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setIsMarkingAll(false);
    }
  };

  if (!isOpen) return null;

  const filteredNotifications = notifications.filter((n) =>
    filter === 'unread' ? !n.read : true
  );

  const renderIcon = (type: string) => {
    switch (type) {
      case 'POST_PUBLISHED':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        );
      case 'POST_FAILED':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-500/20 bg-rose-500/10 text-rose-400">
            <AlertCircle className="h-4 w-4" />
          </div>
        );
      case 'STYLE_TRAINED':
      case 'STYLE_UPDATED':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
            <Sparkles className="h-4 w-4" />
          </div>
        );
      case 'TOKEN_EXPIRING':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400">
            <Clock className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10 text-brand-400">
            <Bell className="h-4 w-4" />
          </div>
        );
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-white/10 bg-slate-900/95 p-0 shadow-2xl shadow-black/80 backdrop-blur-2xl animate-in fade-in slide-in-from-top-2 duration-150"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-white">Notifications</h2>
          {unreadCount > 0 && (
            <span className="rounded-full bg-brand-500/20 border border-brand-500/30 px-2 py-0.5 text-[11px] font-semibold text-brand-300">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAll}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5 text-brand-400" />
              <span>Mark read</span>
            </button>
          )}

          <button
            onClick={fetchNotifications}
            disabled={isLoading}
            className="rounded-md p-1 text-white/50 hover:bg-white/5 hover:text-white transition-colors"
            title="Refresh notifications"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onClose}
            className="rounded-md p-1 text-white/50 hover:bg-white/5 hover:text-white transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 px-4 pt-2">
        <button
          onClick={() => setFilter('all')}
          className={`relative pb-2 px-3 text-xs font-medium transition-colors ${
            filter === 'all' ? 'text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          All
          {filter === 'all' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
          )}
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`relative pb-2 px-3 text-xs font-medium transition-colors ${
            filter === 'unread' ? 'text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          Unread {unreadCount > 0 && `(${unreadCount})`}
          {filter === 'unread' && (
            <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-brand-500 rounded-full" />
          )}
        </button>
      </div>

      {/* Content List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-white/5">
        {isLoading && notifications.length === 0 ? (
          <div className="flex flex-col gap-3 p-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="h-8 w-8 rounded-lg bg-white/5 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-3/4 rounded bg-white/10" />
                  <div className="h-2.5 w-full rounded bg-white/5" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mb-3 shadow-inner">
              <Inbox className="h-6 w-6" />
            </div>
            <p className="text-sm font-medium text-white/80">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-xs text-white/40 mt-1 max-w-[220px]">
              {filter === 'unread'
                ? "You're all caught up with recent updates and events."
                : 'Automated publishing and voice retraining events will appear here.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleNotificationClick(item)}
              className={`group flex items-start gap-3 p-4 transition-colors cursor-pointer hover:bg-white/[0.04] ${
                !item.read ? 'bg-brand-500/[0.03]' : ''
              }`}
            >
              {renderIcon(item.type)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h3
                    className={`text-xs font-semibold truncate ${
                      !item.read ? 'text-white' : 'text-white/70'
                    }`}
                  >
                    {item.title}
                  </h3>
                  <span className="text-[10px] text-white/40 shrink-0">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                <p className="text-xs text-white/50 mt-0.5 line-clamp-2 leading-relaxed">
                  {item.body}
                </p>

                {item.entityType && (
                  <div className="mt-2 flex items-center gap-1 text-[10px] font-medium text-brand-400 group-hover:text-brand-300 transition-colors">
                    <span>View details</span>
                    <ExternalLink className="h-2.5 w-2.5" />
                  </div>
                )}
              </div>

              {!item.read && (
                <div
                  className="h-2 w-2 rounded-full bg-brand-400 shadow-sm shadow-brand-400/50 shrink-0 mt-1"
                  title="Unread"
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-white/10 bg-slate-950/40 px-4 py-2.5 text-[11px] text-white/40">
        <div className="flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>Real-time notifications enabled</span>
        </div>
      </div>
    </div>
  );
}
