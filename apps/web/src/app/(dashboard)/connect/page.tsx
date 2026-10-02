'use client';

import React, { useState, useEffect } from 'react';
import {
  Share2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  RefreshCw,
  Trash2,
  Loader2,
  ShieldCheck,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';
import { MetricCard } from '../../../components/ui/MetricCard';
import { EmptyState } from '../../../components/ui/EmptyState';

export default function ConnectPage() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [totalIngested, setTotalIngested] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const [authRes, ingestRes] = await Promise.allSettled([
        apiClient.get<{ accounts: any[] }>('/threads-auth/status'),
        apiClient.get<{ totalIngested?: number }>('/ingestion/status'),
      ]);

      if (authRes.status === 'fulfilled') {
        setAccounts(authRes.value.accounts ?? []);
      }
      if (ingestRes.status === 'fulfilled') {
        setTotalIngested(ingestRes.value.totalIngested ?? 0);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const res = await apiClient.post<{ authorizationUrl: string }>('/threads-auth/connect');
      if (res.authorizationUrl) {
        window.location.href = res.authorizationUrl;
      }
    } catch (err: any) {
      alert(`Failed to initiate Threads connection: ${err.message}`);
      setIsConnecting(false);
    }
  };

  const handleDisconnect = async (accountId: string) => {
    if (!confirm('Are you sure you want to disconnect this Threads account?')) return;
    try {
      await apiClient.post('/threads-auth/disconnect', { socialAccountId: accountId });
      loadStatus();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSyncIngestion = async (accountId: string) => {
    setSyncingId(accountId);
    const prevCount = totalIngested ?? 0;
    setSyncMessage('Connecting to Threads API to import latest posts...');
    try {
      await apiClient.post('/ingestion/start', { socialAccountId: accountId, isInitial: false });

      let attempts = 0;
      const interval = setInterval(async () => {
        attempts++;
        try {
          const res = await apiClient.get<{ totalIngested?: number; latestJob?: { status: string; progressMessage?: string } }>('/ingestion/status');
          if (res.totalIngested !== undefined) {
            setTotalIngested(res.totalIngested);
          }
          if (res.latestJob?.status === 'COMPLETE' || attempts >= 6) {
            clearInterval(interval);
            setSyncingId(null);
            const currentTotal = res.totalIngested ?? prevCount;
            if (currentTotal > prevCount) {
              setSyncMessage(`Sync complete! Imported ${currentTotal - prevCount} new posts (${currentTotal} total posts indexed).`);
            } else {
              setSyncMessage(`Sync complete! All ${currentTotal} posts are up-to-date with Meta Threads API.`);
            }
            setTimeout(() => setSyncMessage(null), 6000);
          }
        } catch {
          if (attempts >= 6) {
            clearInterval(interval);
            setSyncingId(null);
            setSyncMessage(null);
          }
        }
      }, 2000);
    } catch (err: any) {
      alert(err.message);
      setSyncingId(null);
      setSyncMessage(null);
    }
  };

  return (
    <div className="min-h-screen bg-warm-white">
      <TopBar
        title="Connected Accounts"
        subtitle="Meta Threads OAuth connections and hardware-encrypted token vault"
        actions={
          accounts.length > 0 ? (
            <button
              onClick={handleConnect}
              disabled={isConnecting}
              className="btn-primary text-xs py-2 px-3.5 flex items-center gap-1.5 shadow-subtle"
            >
              {isConnecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              <span>Add Account</span>
            </button>
          ) : undefined
        }
      />

      <div className="p-6 sm:p-8 max-w-5xl mx-auto space-y-8">
        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <MetricCard
            label="Linked Threads Accounts"
            value={accounts.length}
            meta={accounts.length > 0 ? 'OAuth 2.0 active' : 'No account connected'}
            icon={Share2}
            accent="coral"
          />

          <MetricCard
            label="Historical Posts Ingested"
            value={totalIngested ?? 0}
            meta="Indexed for RAG few-shot memory"
            icon={RefreshCw}
            accent="cyan"
          />

          <MetricCard
            label="Encryption Standard"
            value="AES-256"
            meta="Hardware-backed key versioning"
            icon={ShieldCheck}
            accent="lime"
          />
        </div>

        {/* Integration Surface */}
        <div className="card-base p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-canvas-border pb-5">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral-50 border border-coral-200 text-coral-600">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-text-primary tracking-tight font-display">
                  Meta Threads Integration
                </h3>
                <p className="text-xs text-text-muted">
                  Direct OAuth connection using PKCE and hardware-backed encrypted token storage
                </p>
              </div>
            </div>

            {accounts.length === 0 && (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="btn-primary flex items-center gap-2 text-xs py-2.5 px-4 shadow-subtle"
              >
                {isConnecting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-3.5 w-3.5" />
                )}
                <span>Connect Threads Account</span>
              </button>
            )}
          </div>

          {accounts.length === 0 ? (
            <EmptyState
              icon={Share2}
              title="No Threads Account Connected"
              description="Authorize ThreadPilot to read your past posts to train your personalized AI voice and verify publication boundaries."
              actionLabel="Connect Threads Account"
              onAction={handleConnect}
              actionIcon={ExternalLink}
              accent="coral"
            />
          ) : (
            <div className="space-y-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-xl border border-canvas-border bg-paper/60 p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-coral-500 via-lava-orange to-electric-orange font-extrabold text-white text-base shadow-subtle">
                        {acc.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-text-primary">@{acc.username}</span>
                          <span className="badge-lime text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted mt-1 font-mono">
                          <span>Linked on {new Date(acc.connectedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="text-coral-700 font-semibold bg-coral-50 border border-coral-200 rounded-full px-2 py-0.5 text-[10px]">
                            {totalIngested !== null ? `${totalIngested} Posts Synced` : 'Checking sync...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSyncIngestion(acc.id)}
                        disabled={syncingId === acc.id}
                        className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${syncingId === acc.id ? 'animate-spin text-coral-600' : ''}`}
                        />
                        <span>{syncingId === acc.id ? 'Syncing...' : 'Sync Posts'}</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(acc.id)}
                        className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs text-rose-800 hover:bg-rose-100 flex items-center gap-1.5 transition-colors font-medium"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  {syncMessage && (
                    <div className="rounded-xl border border-coral-200 bg-coral-50 p-3 text-xs text-coral-800 flex items-center gap-2 font-medium">
                      {syncingId === acc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-coral-600 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-lime-600 shrink-0" />
                      )}
                      <span>{syncMessage}</span>
                    </div>
                  )}

                  <div className="border-t border-canvas-border pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-text-muted">
                    <span>Platform: Meta Threads Graph API v21.0</span>
                    <span>Newly created posts on Threads can take 2–5 minutes to propagate to Meta's API.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Scopes Information */}
        <div className="card-paper p-6 space-y-2">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded-lg bg-lime-50 border border-lime-200 text-lime-700">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h4 className="text-xs font-bold uppercase tracking-wider text-text-primary">
              Enterprise Security & Least-Privilege Scopes
            </h4>
          </div>
          <p className="text-xs text-text-secondary leading-relaxed font-normal">
            ThreadPilot adheres strictly to least-privilege access rules. Tokens are
            encrypted at rest via AES-256-GCM with key versioning. ThreadPilot requests{' '}
            <code className="rounded-md bg-white border border-canvas-border px-1.5 py-0.5 font-mono text-coral-700 font-semibold">
              threads_basic
            </code>
            ,{' '}
            <code className="rounded-md bg-white border border-canvas-border px-1.5 py-0.5 font-mono text-coral-700 font-semibold">
              threads_content_publish
            </code>
            , and{' '}
            <code className="rounded-md bg-white border border-canvas-border px-1.5 py-0.5 font-mono text-coral-700 font-semibold">
              threads_manage_insights
            </code>{' '}
            to enable autonomous publishing, reply handling, and real-time engagement telemetry.
          </p>
        </div>
      </div>
    </div>
  );
}
