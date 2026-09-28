'use client';

import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Plus,
  ShieldAlert,
  Globe,
} from 'lucide-react';
import { ScheduledPostItem } from './ScheduleCard';

export interface CalendarGridProps {
  posts: ScheduledPostItem[];
  onSelectPost: (post: ScheduledPostItem) => void;
  onDayClick?: ((date: Date) => void) | undefined;
}

import {
  getDateKeyInTimezone,
  formatTimeInTimezone,
} from '../../lib/schedule-utils';
export { getDateKeyInTimezone, formatTimeInTimezone };

export function CalendarGrid({ posts, onSelectPost, onDayClick }: CalendarGridProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [useLocalTimezone, setUseLocalTimezone] = useState(false);

  const viewerTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  const startDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
  const totalDays = lastDayOfMonth.getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const postsByDate: Record<string, ScheduledPostItem[]> = useMemo(() => {
    const acc: Record<string, ScheduledPostItem[]> = {};
    posts.forEach((p) => {
      const tzToUse = useLocalTimezone ? viewerTimezone : p.timezone || 'UTC';
      const key = getDateKeyInTimezone(p.scheduledAt, tzToUse);
      if (!acc[key]) acc[key] = [];
      acc[key].push(p);
    });
    return acc;
  }, [posts, useLocalTimezone, viewerTimezone]);

  const monthLabel = currentDate.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const days = [];
  for (let i = 0; i < startDayOfWeek; i++) {
    days.push({ isCurrentMonth: false, dayNum: null, dateKey: null, dateObj: null });
  }
  for (let day = 1; day <= totalDays; day++) {
    const dateObj = new Date(year, month, day);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    days.push({ isCurrentMonth: true, dayNum: day, dateKey, dateObj });
  }
  while (days.length % 7 !== 0) {
    days.push({ isCurrentMonth: false, dayNum: null, dateKey: null, dateObj: null });
  }

  const todayStr = useMemo(() => {
    return getDateKeyInTimezone(new Date().toISOString(), viewerTimezone);
  }, [viewerTimezone]);

  const getStatusDotColor = (status: string) => {
    switch (status) {
      case 'SCHEDULED':
        return 'bg-cyan-500';
      case 'PUBLISHED':
        return 'bg-lime-500';
      case 'AUTH_REQUIRED':
        return 'bg-amber-500';
      case 'RECOVERY_REQUIRED':
        return 'bg-violet-600 animate-pulse';
      case 'QUOTA_BLOCKED':
        return 'bg-amber-500';
      case 'FAILED_RETRYABLE':
        return 'bg-rose-500';
      case 'FAILED_PERMANENT':
        return 'bg-rose-600';
      default:
        return 'bg-text-muted';
    }
  };

  return (
    <div className="card-base p-6 sm:p-7 space-y-4">
      {/* Calendar Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-canvas-border pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
            {monthLabel}
          </h2>
          <button
            onClick={handleToday}
            className="rounded-xl border border-canvas-border bg-white px-3 py-1 text-xs font-semibold text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors shadow-subtle"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timezone Switcher */}
          <div className="flex items-center gap-2 rounded-xl border border-canvas-border bg-paper px-3 py-1.5 text-xs">
            <Globe className="h-3.5 w-3.5 text-coral-600" />
            <span className="text-text-muted text-[11px] font-semibold">Timezone:</span>
            <button
              onClick={() => setUseLocalTimezone(!useLocalTimezone)}
              className="font-semibold text-text-primary hover:text-coral-600 transition-colors underline-offset-2 hover:underline"
              title="Toggle between target schedule timezone and browser local timezone"
            >
              {useLocalTimezone ? `Local (${viewerTimezone})` : 'Target Schedule TZ'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="rounded-xl border border-canvas-border bg-white p-2 text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              title="Previous Month"
              aria-label="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="rounded-xl border border-canvas-border bg-white p-2 text-text-secondary hover:bg-soft-gray hover:text-text-primary transition-colors"
              title="Next Month"
              aria-label="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Names */}
      <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider text-text-muted">
        <div className="py-2">Sun</div>
        <div className="py-2">Mon</div>
        <div className="py-2">Tue</div>
        <div className="py-2">Wed</div>
        <div className="py-2">Thu</div>
        <div className="py-2">Fri</div>
        <div className="py-2">Sat</div>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-px bg-canvas-border rounded-xl overflow-hidden border border-canvas-border">
        {days.map((cell, idx) => {
          if (!cell.isCurrentMonth || !cell.dateKey) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[110px] bg-soft-gray/40 p-2 text-text-muted/20 select-none"
              />
            );
          }

          const dayPosts = postsByDate[cell.dateKey] || [];
          const isToday = cell.dateKey === todayStr;

          return (
            <div
              key={cell.dateKey}
              onClick={() => onDayClick?.(cell.dateObj!)}
              className={`group relative min-h-[110px] bg-white p-2 sm:p-2.5 transition-colors hover:bg-paper/80 cursor-pointer flex flex-col justify-between ${
                isToday ? 'bg-coral-50/20 ring-2 ring-inset ring-coral-400' : ''
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isToday
                      ? 'bg-coral-500 text-white shadow-sm'
                      : 'text-text-secondary group-hover:text-text-primary'
                  }`}
                >
                  {cell.dayNum}
                </span>

                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-coral-600">
                  <Plus className="h-3.5 w-3.5" />
                </span>
              </div>

              {/* Day Posts List */}
              <div className="mt-1 space-y-1 overflow-y-auto max-h-[72px] pr-1">
                {dayPosts.map((post) => {
                  const tz = useLocalTimezone ? viewerTimezone : post.timezone || 'UTC';
                  const postTime = formatTimeInTimezone(post.scheduledAt, tz);

                  return (
                    <button
                      key={post.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectPost(post);
                      }}
                      className={`w-full text-left truncate rounded-lg px-2 py-1 text-[10px] transition-all flex items-center gap-1.5 ${
                        post.status === 'RECOVERY_REQUIRED'
                          ? 'bg-violet-50 text-violet-800 border border-violet-200 font-bold'
                          : post.status === 'AUTH_REQUIRED'
                          ? 'bg-amber-50 text-amber-800 border border-amber-200 font-bold'
                          : post.status === 'PUBLISHED'
                          ? 'bg-lime-50 text-lime-800 border border-lime-200'
                          : 'bg-soft-gray text-text-primary hover:bg-canvas-border border border-canvas-border'
                      }`}
                      title={`${post.contentSnapshot?.body || 'Post'}\nScheduled: ${postTime} (${tz})`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDotColor(
                          post.status,
                        )}`}
                      />
                      <span className="font-mono text-text-muted">{postTime}</span>
                      <span className="truncate">{post.contentSnapshot?.body || 'Post'}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarGrid;
