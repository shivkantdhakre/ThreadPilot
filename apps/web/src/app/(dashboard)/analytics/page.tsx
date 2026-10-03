"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Sparkles,
  RefreshCw,
  Flame,
  ShieldCheck,
  CheckCircle2,
  Zap,
  ArrowRight,
  Database,
  Activity,
  XCircle,
  ShieldAlert,
  X,
} from "lucide-react";
import { TopBar } from "../../../components/TopBar";
import { apiClient } from "../../../lib/api-client";
import { MetricCard } from "../../../components/ui/MetricCard";
import { ThreadPilotLoader } from "../../../components/ui/ThreadPilotLoader";

const DIMENSIONS = [
  { key: "PUBLISH_HOUR_UTC", label: "Publish Hour" },
  { key: "PUBLISH_DAY_OF_WEEK", label: "Day of Week" },
  { key: "POST_LENGTH_BUCKET", label: "Post Length" },
  { key: "MEDIA_TYPE", label: "Media Type" },
  { key: "TOPIC", label: "Topic" },
  { key: "FORMAT", label: "Format" },
];

function formatDimensionValue(dim: string, val: string): string {
  if (!val) return "—";
  if (dim === "PUBLISH_HOUR_UTC") {
    const h = parseInt(val, 10);
    if (!isNaN(h)) {
      const ampm = h >= 12 ? "PM" : "AM";
      const h12 = h % 12 || 12;
      return `${String(h).padStart(2, "0")}:00 UTC (${h12} ${ampm})`;
    }
  }
  if (dim === "PUBLISH_DAY_OF_WEEK") {
    const days = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];
    const d = parseInt(val, 10);
    return days[d] ?? val;
  }
  if (dim === "POST_LENGTH_BUCKET") {
    if (val === "SHORT") return "Short (<100 chars)";
    if (val === "MEDIUM") return "Medium (100–280 chars)";
    if (val === "LONG") return "Long (>280 chars)";
  }
  if (dim === "MEDIA_TYPE") {
    if (val === "TEXT_POST" || val === "TEXT") return "Text Post";
    if (val === "IMAGE") return "Image Post";
    if (val === "VIDEO") return "Video Post";
  }
  return val;
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<any>(null);
  const [aggregates, setAggregates] = useState<any[]>([]);
  const [pipelineStatus, setPipelineStatus] = useState<any>(null);
  const [selectedDimension, setSelectedDimension] =
    useState<string>("PUBLISH_HOUR_UTC");
  const [isLoading, setIsLoading] = useState(true);
  const [isBackfilling, setIsBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<any>(null);
  const [isPermissionBannerDismissed, setIsPermissionBannerDismissed] =
    useState(false);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [overviewRes, aggRes, pipelineRes, accountsRes] =
        await Promise.allSettled([
          apiClient.get<any>("/analytics/overview"),
          apiClient.get<any>(
            `/analytics/aggregates?dimension=${selectedDimension}`,
          ),
          apiClient.get<any>("/analytics/pipeline-status"),
          apiClient.get<{ accounts: any[] }>("/threads-auth/status"),
        ]);

      if (overviewRes.status === "fulfilled") setOverview(overviewRes.value);
      else
        setError(
          (overviewRes.reason as Error)?.message ||
            "Failed to load analytics overview",
        );

      if (aggRes.status === "fulfilled") {
        const data = Array.isArray(aggRes.value)
          ? aggRes.value
          : aggRes.value?.data || [];
        setAggregates(data);
      }

      if (pipelineRes.status === "fulfilled")
        setPipelineStatus(pipelineRes.value);
      if (accountsRes.status === "fulfilled") {
        setAccount(accountsRes.value.accounts?.[0] ?? null);
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load analytics data");
    } finally {
      setIsLoading(false);
    }
  }, [selectedDimension]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleBackfill = async () => {
    if (!account) {
      setBackfillResult(
        "No connected Threads account found. Please connect your account first.",
      );
      return;
    }
    setIsBackfilling(true);
    setBackfillResult(null);
    try {
      const res = await apiClient.post<any>("/analytics/backfill", {
        socialAccountId: account.id,
        limit: 500,
      });
      setBackfillResult(
        res.message || `Backfilled ${res.backfilledCount} posts.`,
      );
      setTimeout(() => loadData(), 2000);
    } catch (err: any) {
      setBackfillResult(`Backfill failed: ${err?.message || "Unknown error"}`);
    } finally {
      setIsBackfilling(false);
    }
  };

  const totals = overview?.totals || {};
  const averages = overview?.averages || {};
  const health = overview?.observationHealth || {};
  const windows = overview?.optimalWindows;

  const isDataEmpty = !overview || (totals.views === 0 && totals.likes === 0);
  const hasIngestedPosts = (pipelineStatus?.ingestedPostCount ?? 0) > 0;
  const hasPublishedPosts = (pipelineStatus?.publishedPostCount ?? 0) > 0;
  const unbackfilledCount =
    pipelineStatus?.unbackfilledPostCount ??
    Math.max(
      0,
      (pipelineStatus?.ingestedPostCount ?? 0) -
        (pipelineStatus?.publishedPostCount ?? 0),
    );
  const postsMissingObsCount = pipelineStatus?.postsMissingObsCount ?? 0;
  const needsSync =
    unbackfilledCount > 0 ||
    postsMissingObsCount > 0 ||
    (pipelineStatus?.metricCount ?? 0) === 0;
  const isMissingPermission =
    Boolean(pipelineStatus?.missingInsightsPermission) &&
    !isPermissionBannerDismissed &&
    (pipelineStatus?.metricCount ?? 0) === 0;

  const pipelineStage =
    !hasIngestedPosts && !hasPublishedPosts
      ? "no_ingestion"
      : needsSync && (pipelineStatus?.metricCount ?? 0) === 0
        ? "needs_sync"
        : (pipelineStatus?.metricCount ?? 0) === 0
          ? "pending_sync"
          : (pipelineStatus?.aggregateCount ?? 0) === 0
            ? "pending_aggregation"
            : "ready";

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
            <RefreshCw
              className={`h-4 w-4 ${isLoading ? "animate-spin text-coral-500" : ""}`}
            />
          </button>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {isMissingPermission && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start justify-between gap-3 shadow-subtle">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Threads Insights Permission Required
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Your connected Threads account needs the{" "}
                  <code>threads_manage_insights</code> scope to retrieve view
                  counts and post engagement metrics from Meta.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/connect"
                className="btn-secondary text-xs py-1.5 px-3 whitespace-nowrap"
              >
                Reconnect with Insights
              </Link>
              <button
                type="button"
                onClick={() => setIsPermissionBannerDismissed(true)}
                className="p-1.5 rounded-lg text-amber-700/70 hover:text-amber-900 hover:bg-amber-100 transition-colors"
                title="Dismiss warning"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-700">
                Analytics API Error
              </p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
              <p className="text-xs text-rose-500 mt-1">
                Check that the API server is running and your workspace is
                properly connected.
              </p>
            </div>
          </div>
        )}

        {!isLoading && isDataEmpty && !error && (
          <div className="rounded-2xl border border-canvas-border bg-white p-6 shadow-subtle">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-amber-50 border border-amber-200/60 flex items-center justify-center text-amber-600 shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-bold text-text-primary tracking-tight font-display">
                  Analytics Pipeline Calibrating
                </h3>
                <p className="text-xs text-text-secondary mt-1 leading-relaxed">
                  {pipelineStage === "no_ingestion"
                    ? "No historical posts found. Run voice model ingestion first to import your Threads posts."
                    : pipelineStage === "needs_sync"
                      ? `Found ${pipelineStatus?.ingestedPostCount ?? 0} ingested posts. Click "Sync Analytics" to register them for tracking and fetch their engagement metrics.`
                      : pipelineStage === "pending_sync"
                        ? `${pipelineStatus?.publishedPostCount ?? 0} posts registered. Waiting for analytics sync worker (${pipelineStatus?.pendingObsCount ?? 0} observations pending).`
                        : pipelineStage === "pending_aggregation"
                          ? "Metrics captured. Running statistical aggregation and insight generation..."
                          : "Analytics pipeline is ready."}
                </p>

                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    {
                      label: "Posts Ingested",
                      value: pipelineStatus?.ingestedPostCount ?? 0,
                      done: hasIngestedPosts,
                    },
                    {
                      label: "Analytics Tracked",
                      value: pipelineStatus?.publishedPostCount ?? 0,
                      done: hasPublishedPosts,
                    },
                    {
                      label: "Metrics Captured",
                      value: pipelineStatus?.metricCount ?? 0,
                      done: (pipelineStatus?.metricCount ?? 0) > 0,
                    },
                    {
                      label: "Aggregates Ready",
                      value: pipelineStatus?.aggregateCount ?? 0,
                      done: (pipelineStatus?.aggregateCount ?? 0) > 0,
                    },
                  ].map((step) => (
                    <div
                      key={step.label}
                      className={`rounded-lg border p-3 text-center ${step.done ? "border-lime-200 bg-lime-50" : "border-canvas-border bg-canvas-subtle"}`}
                    >
                      <div
                        className={`text-lg font-bold font-mono ${step.done ? "text-lime-700" : "text-text-muted"}`}
                      >
                        {step.value}
                      </div>
                      <div className="text-[10px] font-medium text-text-muted mt-0.5">
                        {step.label}
                      </div>
                      {step.done && (
                        <CheckCircle2 className="h-3 w-3 text-lime-500 mx-auto mt-1" />
                      )}
                    </div>
                  ))}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  {pipelineStage === "no_ingestion" && (
                    <Link
                      href="/profile"
                      className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                      <span>Train Voice Model</span>
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}

                  {(needsSync ||
                    pipelineStage === "needs_sync" ||
                    unbackfilledCount > 0 ||
                    (pipelineStatus?.metricCount ?? 0) === 0) && (
                    <button
                      onClick={handleBackfill}
                      disabled={isBackfilling}
                      className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5"
                    >
                      {isBackfilling ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Zap className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {isBackfilling
                          ? "Syncing All Posts..."
                          : unbackfilledCount > 0
                            ? `Sync Analytics for All Posts (${unbackfilledCount} unsynced)`
                            : "Sync Analytics for All Posts"}
                      </span>
                    </button>
                  )}

                  {(pipelineStage === "pending_sync" ||
                    pipelineStage === "pending_aggregation") && (
                    <div className="flex items-center gap-2 text-xs text-text-secondary">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-cyan-500" />
                      <span>
                        Workers processing. Data will appear within a few
                        minutes.
                      </span>
                    </div>
                  )}

                  {pipelineStage !== "no_ingestion" && (
                    <button
                      onClick={loadData}
                      className="btn-secondary text-xs py-2 px-3 inline-flex items-center gap-1.5"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>Refresh</span>
                    </button>
                  )}
                </div>

                {backfillResult && (
                  <div
                    className={`mt-3 rounded-lg border p-3 text-xs ${backfillResult.includes("failed") ? "border-rose-200 bg-rose-50 text-rose-700" : "border-lime-200 bg-lime-50 text-lime-700"}`}
                  >
                    {backfillResult}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {!isLoading &&
          !isDataEmpty &&
          hasIngestedPosts &&
          (pipelineStatus?.ingestedPostCount ?? 0) >
            (pipelineStatus?.publishedPostCount ?? 0) && (
            <div className="rounded-xl border border-canvas-border bg-amber-50/50 p-4 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <Database className="h-4 w-4 text-amber-600 shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-text-primary">
                    {(pipelineStatus?.ingestedPostCount ?? 0) -
                      (pipelineStatus?.publishedPostCount ?? 0)}{" "}
                    more historical posts available
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Sync remaining posts to expand analytics coverage.
                  </p>
                </div>
              </div>
              <button
                onClick={handleBackfill}
                disabled={isBackfilling}
                className="btn-secondary text-xs py-1.5 px-3 inline-flex items-center gap-1.5 shrink-0"
              >
                {isBackfilling ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Zap className="h-3 w-3" />
                )}
                <span>{isBackfilling ? "Syncing..." : "Sync More Posts"}</span>
              </button>
            </div>
          )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Total Platform Views"
            value={totals.views ? totals.views.toLocaleString() : "0"}
            meta={`${overview?.publishedPostsCount || 0} published posts tracked`}
            icon={TrendingUp}
            accent="cyan"
          />
          <MetricCard
            label="Average Engagement Rate"
            value={
              averages.engagementRateByViews
                ? `${averages.engagementRateByViews.toFixed(2)}%`
                : "0.00%"
            }
            meta="Computed across captured observation windows"
            icon={Flame}
            accent="coral"
          />
          <MetricCard
            label="Total Audience Reach"
            value={
              totals.reach
                ? totals.reach.toLocaleString()
                : totals.views
                  ? totals.views.toLocaleString()
                  : "0"
            }
            meta={`${totals.likes || 0} likes · ${totals.replies || 0} replies`}
            icon={BarChart3}
            accent="violet"
          />
          <MetricCard
            label="Observation Sync Health"
            value={
              health.captured ? `${health.captured} Captured` : "0 Captured"
            }
            meta={`${health.scheduled || 0} pending · ${health.missed || 0} missed`}
            icon={ShieldCheck}
            accent="lime"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="card-base p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-canvas-border pb-3">
              <h3 className="text-sm font-bold text-text-primary font-display flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-coral-500" />
                Learned Optimal Parameters
              </h3>
              <span className="badge-coral text-[10px]">
                {windows?.isEmpirical ? "Early Signal" : "High Signal"}
              </span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Top Performing Topic", value: windows?.bestTopic },
                { label: "Top Performing Format", value: windows?.bestFormat },
                {
                  label: "Best Publishing Hour (UTC)",
                  value:
                    windows?.bestHourUtc != null
                      ? `${windows.bestHourUtc}:00 UTC (${windows.bestHourUtc % 12 || 12} ${windows.bestHourUtc >= 12 ? "PM" : "AM"})`
                      : null,
                },
                {
                  label: "Best Publishing Day",
                  value:
                    windows?.bestDay != null
                      ? [
                          "Sunday",
                          "Monday",
                          "Tuesday",
                          "Wednesday",
                          "Thursday",
                          "Friday",
                          "Saturday",
                        ][windows.bestDay]
                      : null,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between text-xs py-1 border-b border-canvas-border/50 last:border-0"
                >
                  <span className="text-text-secondary">{item.label}</span>
                  <span className="font-semibold text-text-primary">
                    {item.value || "Calibrating..."}
                  </span>
                </div>
              ))}
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
              {[
                {
                  label: "CAPTURED",
                  value: health.captured || 0,
                  color: "text-lime-600",
                  sub: "Terminal Success",
                },
                {
                  label: "PENDING",
                  value: health.pending || 0,
                  color: "text-text-secondary",
                  sub: "Due for pickup",
                },
                {
                  label: "PROCESSING",
                  value: health.processing || 0,
                  color: "text-cyan-600",
                  sub: "Active lease",
                },
                {
                  label: "MISSED",
                  value: health.missed || 0,
                  color: "text-text-secondary",
                  sub: "Window expired",
                },
                {
                  label: "RATE_LIMITED",
                  value: health.rateLimited || 0,
                  color: "text-amber-600",
                  sub: "Cooling down",
                },
                {
                  label: "FAILED",
                  value: health.failed || 0,
                  color: "text-coral-600",
                  sub: "Retry queued",
                },
              ].map((s) => (
                <div
                  key={s.label}
                  className="p-3 rounded-xl bg-canvas-subtle border border-canvas-border"
                >
                  <div className="text-[11px] text-text-secondary font-medium">
                    {s.label}
                  </div>
                  <div className="text-xl font-bold text-text-primary mt-1">
                    {s.value}
                  </div>
                  <div className={`text-[10px] mt-0.5 ${s.color}`}>{s.sub}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card-base p-6 sm:p-7 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-canvas-border pb-4">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Multi-Dimensional Performance Cohorts
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Independent-group CTEs with Welch t-test &amp;
                Benjamini-Hochberg FDR correction
              </p>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {DIMENSIONS.map((dim) => (
                <button
                  key={dim.key}
                  onClick={() => setSelectedDimension(dim.key)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    selectedDimension === dim.key
                      ? "bg-ink-900 text-white"
                      : "bg-canvas-subtle text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {dim.label}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <ThreadPilotLoader />
            </div>
          ) : aggregates.length === 0 ? (
            <div className="py-12 text-center space-y-3">
              <BarChart3 className="h-8 w-8 text-text-muted mx-auto" />
              <p className="text-sm font-semibold text-text-primary">
                No performance cohorts yet
              </p>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                {pipelineStage === "no_ingestion"
                  ? "Run ingestion to import your historical posts, then sync analytics to populate cohort data."
                  : pipelineStage === "needs_sync"
                    ? 'Use "Sync Analytics from Ingested Posts" above to register your posts for tracking.'
                    : `Aggregation worker will compute cohorts after metrics are captured for ${selectedDimension} dimension.`}
              </p>
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
                      <tr
                        key={row.id}
                        className="hover:bg-canvas-subtle/50 transition-colors"
                      >
                        <td className="py-3 font-semibold text-text-primary">
                          {formatDimensionValue(
                            selectedDimension,
                            row.dimensionValue,
                          )}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.sampleSize} posts
                        </td>
                        <td className="py-3 font-medium text-text-primary">
                          {row.subjectAvgEngagementByViews != null
                            ? `${row.subjectAvgEngagementByViews.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.complementAvgEngagement != null
                            ? `${row.complementAvgEngagement.toFixed(2)}%`
                            : "—"}
                        </td>
                        <td className="py-3 font-medium">
                          {row.percentDelta != null ? (
                            <span
                              className={
                                isPositive ? "text-lime-600" : "text-coral-600"
                              }
                            >
                              {isPositive ? "+" : ""}
                              {row.percentDelta.toFixed(1)}%
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.cohensD != null ? row.cohensD.toFixed(2) : "—"}
                        </td>
                        <td className="py-3 text-text-secondary">
                          {row.welchPValue != null
                            ? row.welchPValue < 0.001
                              ? "<0.001"
                              : row.welchPValue.toFixed(3)
                            : "—"}
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
