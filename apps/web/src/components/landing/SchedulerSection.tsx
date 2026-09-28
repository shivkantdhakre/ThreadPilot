'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Calendar, Clock, ArrowRight, CheckCircle2 } from 'lucide-react';
import { schedulerData } from '../../data/threadpilot/scheduler';

export const SchedulerSection: React.FC = () => {
  const [selectedDay, setSelectedDay] = useState<number>(15);

  const activeEvent = schedulerData.sampleCalendarDays.find(
    (d) => d.day === selectedDay && d.hasEvent
  );

  return (
    <section id="scheduler" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3 py-1 rounded-full border border-coral-500/20 mb-3">
            {schedulerData.eyebrow}
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            {schedulerData.headline}
          </h2>
          <p className="text-base text-text-secondary leading-relaxed">
            {schedulerData.subtext}
          </p>
        </div>

        {/* Content Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Calendar Grid (8 cols) */}
          <div className="lg:col-span-8 rounded-3xl border border-canvas-border bg-paper/70 p-6 sm:p-8 shadow-subtle">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-canvas-border">
              <div>
                <h3 className="text-base font-bold text-text-primary">September 2026</h3>
                <span className="text-xs text-text-muted">Queue Timeline • Automated Dispatch</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
                  UTC & Local Timezone Aligned
                </span>
              </div>
            </div>

            {/* Days of Week Header */}
            <div className="grid grid-cols-7 gap-2 mb-2 text-center text-xs font-bold uppercase tracking-wider text-text-muted">
              <span>Sun</span>
              <span>Mon</span>
              <span>Tue</span>
              <span>Wed</span>
              <span>Thu</span>
              <span>Fri</span>
              <span>Sat</span>
            </div>

            {/* Calendar Days Matrix */}
            <div className="grid grid-cols-7 gap-2">
              {schedulerData.sampleCalendarDays.map((d) => {
                const isSelected = selectedDay === d.day;
                return (
                  <button
                    key={d.day}
                    onClick={() => setSelectedDay(d.day)}
                    className={`h-16 sm:h-20 rounded-xl p-2 text-left flex flex-col justify-between border transition-all ${
                      isSelected
                        ? 'border-coral-500 bg-white shadow-card ring-2 ring-coral-500/20'
                        : 'border-canvas-border/60 bg-white/70 hover:bg-white hover:border-canvas-border'
                    }`}
                  >
                    <span className={`text-xs font-bold ${isSelected ? 'text-coral-600' : 'text-text-primary'}`}>
                      {d.day}
                    </span>

                    {d.hasEvent && (
                      <div className="w-full truncate">
                        <span className="inline-block w-full text-[10px] font-semibold truncate rounded px-1.5 py-0.5 bg-coral-50 text-coral-700 border border-coral-200">
                          {d.time}
                        </span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Active Selected Day Event Card */}
            {activeEvent && (
              <div className="mt-5 p-4 rounded-xl border border-coral-500/20 bg-coral-50/50 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="p-2 rounded-lg bg-coral-500/10 text-coral-600">
                    <Calendar className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-xs font-bold text-text-primary">{activeEvent.title}</div>
                    <div className="text-[11px] text-text-muted">Scheduled for {activeEvent.time} • Automatic Meta Publish</div>
                  </div>
                </div>
                <span className="text-[10px] uppercase font-bold text-coral-700 bg-coral-100 px-2.5 py-1 rounded-full">
                  {activeEvent.status}
                </span>
              </div>
            )}
          </div>

          {/* Right Recommendation Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-3xl border border-canvas-border bg-paper/70 p-6 shadow-subtle">
              <div className="flex items-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-coral-600" />
                <h3 className="text-sm font-bold text-text-primary">Best Time to Post</h3>
              </div>
              <p className="text-xs text-text-secondary leading-relaxed mb-6">
                Calculated from historical follower reply spikes to maximize natural organic discovery.
              </p>

              <div className="space-y-3">
                {schedulerData.bestTimes.map((item) => (
                  <div
                    key={item.period}
                    className="p-3.5 rounded-xl border border-canvas-border/80 bg-white flex items-center justify-between"
                  >
                    <div>
                      <div className="text-xs font-bold text-text-primary">{item.period}</div>
                      <div className="text-xs text-text-muted mt-0.5">{item.timeSlot}</div>
                    </div>
                    <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200">
                      {item.tag}
                    </span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t border-canvas-border">
                <Link
                  href="/schedules"
                  className="w-full btn-secondary text-xs py-2.5 px-4 text-center justify-center flex items-center gap-1.5"
                >
                  <span>Open Full Calendar</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
