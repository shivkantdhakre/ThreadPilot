'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BrainCircuit,
  Sparkles,
  ArrowRight,
  TrendingUp,
  History,
  Zap,
  CheckCircle2,
  Clock,
  RefreshCw,
  Lightbulb,
  Sliders,
  Layers,
  Check,
  X,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { MetricCard } from '../../../components/ui/MetricCard';
import { ThreadPilotLoader } from '../../../components/ui/ThreadPilotLoader';

export default function LearningPage() {
  const router = useRouter();
  const [learningProfile, setLearningProfile] = useState<any>(null);
  const [insights, setInsights] = useState<any[]>([]);
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [profileRes, insightsRes, recsRes] = await Promise.allSettled([
        apiClient.get<any>('/analytics/learning'),
        apiClient.get<any>('/analytics/insights?isActive=true'),
        apiClient.get<any>('/recommendations?status=EXPOSED'),
      ]);

      if (profileRes.status === 'fulfilled') setLearningProfile(profileRes.value);
      if (insightsRes.status === 'fulfilled') {
        const data = Array.isArray(insightsRes.value)
          ? insightsRes.value
          : insightsRes.value?.data || [];
        setInsights(data);
      }
      if (recsRes.status === 'fulfilled') {
        const data = Array.isArray(recsRes.value)
          ? recsRes.value
          : recsRes.value?.data || [];
        setRecommendations(data);
      }
    } catch (err) {
      console.error('Failed to load learning data', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleAccept = async (exposureId: string) => {
    setActionLoadingId(exposureId);
    try {
      const res = await apiClient.post<any>(`/recommendations/${exposureId}/accept`);
      if (res?.draft?.id) {
        router.push(`/create?draftId=${res.draft.id}`);
      } else {
        await loadData();
      }
    } catch (err) {
      console.error('Failed to accept recommendation', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDismiss = async (exposureId: string) => {
    setActionLoadingId(exposureId);
    try {
      await apiClient.post<any>(`/recommendations/${exposureId}/dismiss`);
      await loadData();
    } catch (err) {
      console.error('Failed to dismiss recommendation', err);
    } finally {
      setActionLoadingId(null);
    }
  };

  const profile = learningProfile?.profile;
  const weights = learningProfile?.weights || [];

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Intelligence & Learning Engine"
        subtitle="Empirical performance insights, longitudinally decayed weights, and closed-loop recommendations"
        actions={
          <button
            onClick={loadData}
            disabled={isLoading}
            className="p-2 rounded-xl border border-canvas-border bg-white text-text-secondary hover:text-text-primary transition-colors shadow-subtle"
            title="Refresh learning engine"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin text-coral-500' : ''}`} />
          </button>
        }
      />

      <div className="p-6 sm:p-8 max-w-7xl mx-auto space-y-8">
        {/* Top Summary Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            label="Analytics Revision"
            value={`Rev ${profile?.analyticsRevisionAtComputation ?? 1}`}
            meta="Monotonic state machine version"
            icon={BrainCircuit}
            accent="violet"
          />

          <MetricCard
            label="Active Insights"
            value={insights.length}
            meta="Evidence-gated statistical hypotheses"
            icon={Lightbulb}
            accent="coral"
          />

          <MetricCard
            label="Learned Dimension Weights"
            value={weights.length}
            meta="30-day temporal exponential decay"
            icon={Sliders}
            accent="cyan"
          />

          <MetricCard
            label="Candidate Recommendations"
            value={recommendations.length}
            meta="Exploitation + exploration queue"
            icon={Sparkles}
            accent="lime"
          />
        </div>

        {/* Section: Candidate Recommendations with 1-Click Action */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Recommended Content Directions
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Dynamic ideas derived from your highest-signal empirical evidence and under-sampled exploration slots
              </p>
            </div>
            <span className="badge-lime text-[10px] font-bold">Closed-Loop Ready</span>
          </div>

          {isLoading ? (
            <div className="py-12 flex justify-center">
              <ThreadPilotLoader />
            </div>
          ) : recommendations.length === 0 ? (
            <div className="card-base p-8 text-center space-y-2">
              <Sparkles className="h-8 w-8 text-text-secondary mx-auto" />
              <p className="text-sm font-semibold text-text-primary">No pending recommendations</p>
              <p className="text-xs text-text-secondary max-w-md mx-auto">
                All generated recommendations have been processed or your pending budget is currently clear. Publish posts and run aggregation to synthesize new candidates.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recommendations.map((rec) => {
                const idea = rec.contentIdea;
                const isExploration = rec.provenanceType === 'EXPLORATION';
                return (
                  <div
                    key={rec.id}
                    className="card-base p-5 flex flex-col justify-between space-y-4 border border-canvas-border hover:shadow-subtle transition-all"
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isExploration ? 'badge-cyan' : 'badge-coral'
                          }`}
                        >
                          {isExploration ? 'EXPLORATION' : 'EXPLOITATION'}
                        </span>
                        <span className="text-[11px] font-semibold text-text-secondary">
                          Score: {((idea?.predictedScore ?? 0.5) * 100).toFixed(0)}%
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-text-primary font-display">
                        {idea?.topic ? `Topic: ${idea.topic}` : 'Strategic Content Opportunity'}
                      </h4>

                      <p className="text-xs text-text-secondary leading-relaxed line-clamp-3">
                        {idea?.suggestedPrompt || 'Recommended content candidate based on performance models.'}
                      </p>

                      {rec.insight && (
                        <div className="text-[11px] p-2 rounded-lg bg-canvas-subtle text-text-secondary">
                          <span className="font-semibold text-text-primary">Evidence:</span>{' '}
                          {rec.insight.observation}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-canvas-border">
                      <button
                        onClick={() => handleDismiss(rec.id)}
                        disabled={actionLoadingId === rec.id}
                        className="px-3 py-1.5 text-xs text-text-secondary hover:text-coral-600 rounded-lg hover:bg-canvas-subtle transition-colors flex items-center gap-1"
                      >
                        <X className="h-3.5 w-3.5" />
                        Dismiss
                      </button>

                      <button
                        onClick={() => handleAccept(rec.id)}
                        disabled={actionLoadingId === rec.id}
                        className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1"
                      >
                        {actionLoadingId === rec.id ? (
                          <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Check className="h-3.5 w-3.5" />
                        )}
                        Accept & Draft
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Section: Live Synthesized Insights */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Synthesized Statistical Insights
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Directional and High-Signal empirical associations extracted from your historical posts
              </p>
            </div>
            <span className="badge-violet text-[10px]">BH-FDR Verified</span>
          </div>

          {insights.length === 0 ? (
            <div className="card-base p-6 text-center text-xs text-text-secondary">
              No active insights yet. Accumulate posts and trigger aggregation to synthesize statistically verified patterns.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {insights.map((ins) => (
                <div key={ins.id} className="card-base p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-text-primary uppercase tracking-wider">
                      {ins.dimension}: {ins.dimensionValue}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        ins.evidenceGrade === 'HIGH_SIGNAL' ? 'badge-lime' : 'badge-coral'
                      }`}
                    >
                      {ins.evidenceGrade}
                    </span>
                  </div>

                  <p className="text-xs text-text-primary font-medium leading-relaxed">
                    {ins.observation}
                  </p>

                  <p className="text-xs text-text-secondary leading-relaxed">
                    {ins.recommendation}
                  </p>

                  <div className="pt-2 border-t border-canvas-border flex items-center justify-between text-[11px] text-text-secondary">
                    <span>
                      Delta:{' '}
                      <span className="font-semibold text-lime-600">
                        {ins.percentDelta ? `+${ins.percentDelta.toFixed(1)}%` : '—'}
                      </span>
                    </span>
                    <span>
                      p={ins.welchPValue != null ? ins.welchPValue.toFixed(3) : '—'} · FDR{' '}
                      {ins.passesFDR ? 'PASS' : 'FAIL'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Section: Learned Dimension Weights */}
        <div className="card-base p-6 sm:p-7 space-y-6">
          <div className="flex items-center justify-between border-b border-canvas-border pb-4">
            <div>
              <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
                Active Learned Dimension Weights
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Longitudinally aggregated weights with 30-day half-life decay
              </p>
            </div>
            <span className="badge-cyan text-[10px]">T_24H Benchmark</span>
          </div>

          {weights.length === 0 ? (
            <div className="py-8 text-center text-text-secondary text-xs">
              No learned dimension weights recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-canvas-border text-text-secondary font-semibold">
                    <th className="pb-3 font-medium">Dimension</th>
                    <th className="pb-3 font-medium">Value</th>
                    <th className="pb-3 font-medium">Decayed Weight</th>
                    <th className="pb-3 font-medium">Raw Weight</th>
                    <th className="pb-3 font-medium">Sample Size</th>
                    <th className="pb-3 font-medium">Evidence Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-canvas-border/50">
                  {weights.map((w: any) => (
                    <tr key={w.id} className="hover:bg-canvas-subtle/50 transition-colors">
                      <td className="py-3 font-semibold text-text-primary">{w.dimension}</td>
                      <td className="py-3 text-text-primary font-medium">{w.dimensionValue}</td>
                      <td className="py-3 font-bold text-lime-600">{w.decayedWeight.toFixed(2)}</td>
                      <td className="py-3 text-text-secondary">{w.rawWeight.toFixed(2)}</td>
                      <td className="py-3 text-text-secondary">{w.totalSampleSize}</td>
                      <td className="py-3">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            w.highestEvidenceGrade === 'HIGH_SIGNAL' ? 'badge-lime' : 'badge-coral'
                          }`}
                        >
                          {w.highestEvidenceGrade}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
