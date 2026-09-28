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

    // Contextual routing
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
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-lime-200 bg-lime-50 text-lime-700">
            <CheckCircle2 className="h-4 w-4" />
          </div>
        );
      case 'POST_FAILED':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-rose-200 bg-rose-50 text-rose-700">
            <AlertCircle className="h-4 w-4" />
          </div>
        );
      case 'STYLE_TRAINED':
      case 'STYLE_UPDATED':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-700">
            <Sparkles className="h-4 w-4" />
          </div>
        );
      case 'TOKEN_EXPIRING':
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700">
            <Clock className="h-4 w-4" />
          </div>
        );
      default:
        return (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-coral-200 bg-coral-50 text-coral-600">
            <Bell className="h-4 w-4" />
          </div>
        );
    }
  };

  return (
    <div
      ref={dropdownRef}
      className="absolute right-0 top-12 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-2xl border border-canvas-border bg-white shadow-dropdown animate-fade-in overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-canvas-border px-5 py-3.5 bg-paper/60">
        <div className="flex items-center gap-2">
          <h2 className="text-xs font-bold text-text-primary uppercase tracking-wider">Notifications</h2>
          {unreadCount > 0 && (
            <span className="badge-coral text-[10px] py-0.5">
              {unreadCount} new
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAll}
              className="flex items-center gap-1 text-[11px] font-semibold text-coral-600 hover:text-coral-700 transition-colors p-1"
              title="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Mark all read</span>
            </button>
          )}

          <button
            onClick={() => fetchNotifications()}
            disabled={isLoading}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
            title="Refresh"
            aria-label="Refresh notifications"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-soft-gray transition-colors"
            title="Close"
            aria-label="Close notifications menu"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-canvas-border px-5 py-2 bg-white gap-2 text-xs">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filter === 'all'
              ? 'bg-soft-gray text-text-primary font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          All ({notifications.length})
        </button>
        <button
          onClick={() => setFilter('unread')}
          className={`px-2.5 py-1 rounded-lg font-medium transition-colors ${
            filter === 'unread'
              ? 'bg-coral-50 text-coral-700 font-semibold'
              : 'text-text-muted hover:text-text-primary'
          }`}
        >
          Unread ({unreadCount})
        </button>
      </div>

      {/* Notification List */}
      <div className="max-h-[380px] overflow-y-auto divide-y divide-canvas-border">
        {isLoading && notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-text-muted space-y-2">
            <RefreshCw className="h-5 w-5 animate-spin text-coral-500" />
            <span className="text-xs">Loading notifications...</span>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="h-10 w-10 rounded-xl bg-soft-gray flex items-center justify-center text-text-muted mb-2">
              <Inbox className="h-5 w-5" />
            </div>
            <p className="text-xs font-semibold text-text-primary">
              {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
            </p>
            <p className="text-[11px] text-text-muted mt-1 max-w-xs">
              {filter === 'unread'
                ? "You're caught up! Check 'All' for past notifications."
                : 'System alerts, publish events, and voice retraining updates will appear here.'}
            </p>
          </div>
        ) : (
          filteredNotifications.map((item) => (
            <div
              key={item.id}
              onClick={() => handleNotificationClick(item)}
              className={`group flex items-start gap-3 p-4 transition-colors cursor-pointer text-left ${
                item.read ? 'bg-white hover:bg-soft-gray/50' : 'bg-coral-50/20 hover:bg-coral-50/40'
              }`}
            >
              {renderIcon(item.type)}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-xs font-semibold truncate ${
                      item.read ? 'text-text-primary' : 'text-text-primary font-bold'
                    }`}
                  >
                    {item.title}
                  </span>
                  <span className="text-[10px] text-text-muted shrink-0 font-mono">
                    {formatRelativeTime(item.createdAt)}
                  </span>
                </div>

                <p className="text-xs text-text-secondary mt-0.5 line-clamp-2 leading-relaxed">
                  {item.body}
                </p>

                <div className="flex items-center gap-2 mt-2">
                  {!item.read && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleMarkAsRead(item);
                      }}
                      className="text-[10px] font-semibold text-coral-600 hover:text-coral-700 transition-colors"
                    >
                      Mark as read
                    </button>
                  )}
                  {item.entityType && (
                    <span className="text-[10px] text-text-muted flex items-center gap-0.5 group-hover:text-coral-600 transition-colors">
                      View details <ExternalLink className="h-2.5 w-2.5 inline" />
                    </span>
                  )}
                </div>
              </div>

              {!item.read && (
                <span className="h-2 w-2 rounded-full bg-coral-500 shrink-0 mt-1" />
              )}
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-canvas-border px-5 py-2.5 bg-paper/60 text-center">
        <span className="text-[10px] text-text-muted font-mono">
          Real-time Event Outbox • ThreadPilot Engine
        </span>
      </div>
    </div>
  );
}

export default NotificationDropdown;
