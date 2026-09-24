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

  // Group posts by YYYY-MM-DD based on either Schedule Target Timezone or Viewer Local Timezone
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

  // Build 35 or 42 calendar cells
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
        return 'bg-cyan-400';
      case 'PUBLISHED':
        return 'bg-lime-400';
      case 'AUTH_REQUIRED':
        return 'bg-amber-400';
      case 'RECOVERY_REQUIRED':
        return 'bg-violet-400 animate-ping';
      case 'QUOTA_BLOCKED':
        return 'bg-amber-400';
      case 'FAILED_RETRYABLE':
        return 'bg-rose-400';
      case 'FAILED_PERMANENT':
        return 'bg-rose-500';
      default:
        return 'bg-white/40';
    }
  };

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111116] backdrop-blur-xl p-6 sm:p-7 space-y-4 shadow-card-elevated">
      {/* Calendar Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/[0.08] pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight font-display">{monthLabel}</h2>
          <button
            onClick={handleToday}
            className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-colors"
          >
            Today
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Timezone Switcher */}
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-ink-850 px-3 py-1.5 text-xs">
            <Globe className="h-3.5 w-3.5 text-coral-400" />
            <span className="text-white/40 text-[11px] font-semibold">Timezone:</span>
            <button
              onClick={() => setUseLocalTimezone(!useLocalTimezone)}
              className="font-semibold text-coral-300 hover:text-white transition-colors underline-offset-2 hover:underline"
              title="Toggle between target schedule timezone and browser local timezone"
            >
              {useLocalTimezone ? `Local (${viewerTimezone})` : 'Target Schedule TZ'}
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={handlePrevMonth}
              className="rounded-xl border border-white/10 p-2 text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              title="Previous Month"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={handleNextMonth}
              className="rounded-xl border border-white/10 p-2 text-white/60 hover:bg-white/5 hover:text-white transition-colors"
              title="Next Month"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Weekday Names */}
      <div className="grid grid-cols-7 text-center text-xs font-bold uppercase tracking-wider text-white/40">
        <div className="py-2">Sun</div>
        <div className="py-2">Mon</div>
        <div className="py-2">Tue</div>
        <div className="py-2">Wed</div>
        <div className="py-2">Thu</div>
        <div className="py-2">Fri</div>
        <div className="py-2">Sat</div>
      </div>

      {/* Days Grid */}
      <div className="grid grid-cols-7 gap-px bg-white/[0.08] rounded-2xl overflow-hidden border border-white/[0.08]">
        {days.map((cell, idx) => {
          if (!cell.isCurrentMonth || !cell.dateKey) {
            return (
              <div
                key={`empty-${idx}`}
                className="min-h-[110px] bg-ink-950/60 p-2 text-white/10 select-none"
              />
            );
          }

          const dayPosts = postsByDate[cell.dateKey] || [];
          const isToday = cell.dateKey === todayStr;

          return (
            <div
              key={cell.dateKey}
              onClick={() => onDayClick?.(cell.dateObj!)}
              className={`group relative min-h-[110px] bg-ink-900/95 p-2 sm:p-2.5 transition-colors hover:bg-white/[0.03] cursor-pointer flex flex-col justify-between ${
                isToday ? 'ring-2 ring-inset ring-coral-500/50 bg-coral-500/[0.03]' : ''
              }`}
            >
              {/* Day Header */}
              <div className="flex items-center justify-between">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isToday
                      ? 'bg-coral-500 text-white shadow-glow'
                      : 'text-white/70 group-hover:text-white'
                  }`}
                >
                  {cell.dayNum}
                </span>

                <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white/40 hover:text-white">
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
                          ? 'bg-violet-500/20 text-violet-200 border border-violet-500/40 font-bold'
                          : post.status === 'AUTH_REQUIRED'
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold'
                          : post.status === 'PUBLISHED'
                          ? 'bg-lime-500/10 text-lime-300 hover:bg-lime-500/20'
                          : 'bg-white/5 text-white/80 hover:bg-white/10 hover:text-white'
                      }`}
                      title={`${post.contentSnapshot?.body || 'Post'}\nScheduled: ${postTime} (${tz})`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full shrink-0 ${getStatusDotColor(
                          post.status,
                        )}`}
                      />
                      <span className="font-mono text-white/50">{postTime}</span>
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
