'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BarChart3,
  TrendingUp,
  Clock,
  Sparkles,
  Layers,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Calendar,
  PenSquare,
  HelpCircle,
  Lightbulb,
  CheckCircle2,
  AlertTriangle,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { MetricCard } from '../../../components/ui/MetricCard';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [aggregates, setAggregates] = useState<any[]>([]);
  const [selectedDimension, setSelectedDimension] = useState<string>('TOPIC');
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [overviewRes, aggRes] = await Promise.allSettled([
        apiClient.get<any>('/analytics/overview'),
        apiClient.get<any>(`/analytics/aggregates?dimension=${selectedDimension}`),
      ]);

      if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value);
      if (aggRes.status === 'fulfilled') {
        const data = Array.isArray(aggRes.value)
          ? aggRes.value
          : aggRes.value?.data || [];
        setAggregates(data);
      }
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [selectedDimension]);

  const totals = overview?.totals || {};
  const averages = overview?.averages || {};
  const health = overview?.observationHealth || {};
  const windows = overview?.optimalWindows;

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Performance Analytics & Telemetry"
        subtitle="Empirical measurement of platform engagement, observation windows, and dimensional cohorts"
        actions={
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary transition-colors shadow-subtle"
            title="Refresh analytics"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
          </button>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Platform Views"
            value={totals.views ? totals.views.toLocaleString() : '0'}
            meta={`${overview?.publishedPostsCount || 0} published posts tracked`}
            icon={TrendingUp}
            accent="cyan"
          />

          <MetricCard
            label="Average Engagement Rate"
            value={
              averages.engagementRateByViews
                ? `${averages.engagementRateByViews.toFixed(2)}%`
                : '0.00%'
            }
            meta="Computed across captured observation windows"
            icon={Flame}
            accent="coral"
          />

          <MetricCard
            label="Total Audience Reach"
            value={totals.reach ? totals.reach.toLocaleString() : totals.views ? totals.views.toLocaleString() : '0'}
            meta={`${totals.likes || 0} likes · ${totals.replies || 0} replies`}
            icon={BarChart3}
            accent="violet"
          />

          <MetricCard
            label="Observation Sync Health"
            value={
              health.captured
                ? `${health.captured} Captured`
                : '0 Captured'
            }
            meta={`${health.pending || 0} pending · ${health.missed || 0} missed`}
            icon={ShieldCheck}
            accent="lime"
          />
        </div>

        {/* Section: Optimal Windows & Pipeline Health */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-base p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <h3 className="text-sm font-bold text-text-primary font-display flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-coral-500" />
                Learned Optimal Parameters
              </h3>
              <span className="badge-coral text-[10px]">Empirical</span>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs py-1 border-b border-canvas-border/50">
                <span className="text-text-secondary">Top Performing Topic</span>
                <span className="font-semibold text-text-primary">
                  {windows?.bestTopic || 'Calibrating...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-canvas-border/50">
                <span className="text-text-secondary">Top Performing Format</span>
                <span className="font-semibold text-text-primary">
                  {windows?.bestFormat || 'Calibrating...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1 border-b border-canvas-border/50">
                <span className="text-text-secondary">Best Publishing Hour (UTC)</span>
                <span className="font-semibold text-text-primary">
                  {windows?.bestHourUtc !== null && windows?.bestHourUtc !== undefined
                    ? `${windows.bestHourUtc}:00 UTC`
                    : 'Calibrating...'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs py-1">
                <span className="text-text-secondary">Best Publishing Day</span>
                <span className="font-semibold text-text-primary">
                  {windows?.bestDay !== null && windows?.bestDay !== undefined
                    ? ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][windows.bestDay]
                    : 'Calibrating...'}
                </span>
              </div>
            </div>
          </div>

          <div className="card-base p-6 space-y-4 lg:col-span-2">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <h3 className="text-sm font-bold text-text-primary font-display flex items-center gap-2">
                <Clock className="h-4 w-4 text-cyan-600" />
                Observation FSM Telemetry
              </h3>
              <span className="badge-cyan text-[10px]">Strict CAS Fenced</span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">CAPTURED</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.captured || 0}</div>
                <div className="text-[10px] text-lime-600 mt-0.5">Terminal Success</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">PENDING</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.pending || 0}</div>
                <div className="text-[10px] text-text-secondary mt-0.5">Due for pickup</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">PROCESSING</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.processing || 0}</div>
                <div className="text-[10px] text-cyan-600 mt-0.5">Active lease</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">MISSED</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.missed || 0}</div>
                <div className="text-[10px] text-text-secondary mt-0.5">Window expired</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">RATE_LIMITED</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.rateLimited || 0}</div>
                <div className="text-[10px] text-amber-600 mt-0.5">Cooling down</div>
              </div>
              <div className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border">
                <div className="text-[11px] text-text-secondary font-medium">FAILED</div>
                <div className="text-xl font-bold text-text-primary mt-1">{health.failed || 0}</div>
                <div className="text-[10px] text-coral-600 mt-0.5">Retry queued</div>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Multi-Dimensional Performance Aggregates */}
        <div className="card-base p-6 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-canvas-border pb-4">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Multi-Dimensional Performance Cohorts
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Independent-group CTEs with Welch t-test & Benjamini-Hochberg FDR correction
              </p>
            </div>

            <div className="flex items-center gap-2">
              {['TOPIC', 'FORMAT', 'HOOK_STYLE'].map((dim) => (
                <button
                  key={dim}
                  onClick={() => setSelectedDimension(dim)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    selectedDimension === dim
                      ? 'bg-ink-900 text-white'
                      : 'bg-canvas-subtle text-text-secondary hover:text-text-primary'
                  }`}
                >
                  {dim}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <ThreadPilotLoader />
            </div>
          ) : aggregates.length === 0 ? (
            <div className="py-12 text-center text-text-secondary text-sm">
              No performance aggregates computed yet for {selectedDimension}. Run ingestion and aggregation worker to populate empirical cohorts.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-canvas-border text-text-secondary font-semibold">
                    <th className="pb-3 font-medium">Dimension Value</th>
                    <th className="pb-3 font-medium">Sample Size</th>
                    <th className="pb-3 font-medium">Avg Engagement</th>
                    <th className="pb-3 font-medium">Control Baseline</th>
                    <th className="pb-3 font-medium">Observed Delta</th>
                    <th className="pb-3 font-medium">Cohen&apos;s d</th>
                    <th className="pb-3 font-medium">Welch p-value</th>
                    <th className="pb-3 font-medium">BH-FDR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border/50">
                  {aggregates.map((row: any) => {
                    const isPositive = (row.absoluteDelta ?? 0) >= 0;
                    return (
                      <tr key={row.id} className="hover:bg-canvas-subtle/50 transition-colors">
                        <td className="py-3 font-semibold text-text-primary">
                          {row.dimensionValue}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.sampleSize} posts
                        </td>
                        <td className="py-3 font-medium text-text-primary">
                          {row.subjectAvgEngagementByViews != null
                            ? `${row.subjectAvgEngagementByViews.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.complementAvgEngagement != null
                            ? `${row.complementAvgEngagement.toFixed(2)}%`
                            : '—'}
                        </td>
                        <td className="py-3 font-medium">
                          {row.percentDelta != null ? (
                            <span className={isPositive ? 'text-lime-600' : 'text-coral-600'}>
                              {isPositive ? '+' : ''}
                              {row.percentDelta.toFixed(1)}%
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.cohensD != null ? row.cohensD.toFixed(2) : '—'}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.welchPValue != null
                            ? row.welchPValue < 0.001
                              ? '<0.001'
                              : row.welchPValue.toFixed(3)
                            : '—'}
                        </td>
                        <td className="py-3">
                          {row.passesFDR ? (
                            <span className="badge-lime text-[10px] font-bold">
                              PASS (q={(row.qValue ?? 0).toFixed(2)})
                            </span>
                          ) : (
                            <span className="badge-gray text-[10px]">
                              q={(row.qValue ?? 1).toFixed(2)}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
