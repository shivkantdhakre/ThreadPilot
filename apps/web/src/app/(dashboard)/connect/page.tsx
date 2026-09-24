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
} from 'lucide-react';
import { TopBar } from '../../../components/TopBar';
import { apiClient } from '../../../lib/api-client';

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

      // Poll ingestion status to update post count in real time
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
    <div className="min-h-screen bg-ink-900">
      <TopBar title="Connected Accounts" />

      <div className="p-6 sm:p-8 max-w-4xl mx-auto space-y-8">
        <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-8 backdrop-blur-xl shadow-card-elevated">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/[0.08] pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-coral-500/10 border border-coral-500/20 text-coral-400">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-white tracking-tight font-display">
                  Meta Threads Integration
                </h3>
                <p className="text-xs text-white/50">
                  Direct OAuth connection using PKCE and hardware-backed encrypted token storage
                </p>
              </div>
            </div>

            {accounts.length === 0 && (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="btn-primary flex items-center gap-2 text-xs py-2.5 px-4 shadow-glow"
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
            <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center bg-ink-950/60">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto mb-3">
                <AlertCircle className="h-6 w-6" />
              </div>
              <p className="text-sm font-bold text-white/80">No Threads Account Connected</p>
              <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto leading-relaxed">
                Authorize ThreadPilot to read your past posts to train your personalized AI voice
                and verify publication boundaries.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-2xl border border-white/[0.06] bg-ink-900/80 p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-coral-500 via-violet-600 to-cyan-500 font-extrabold text-white text-base shadow-md">
                        {acc.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-bold text-white">@{acc.username}</span>
                          <span className="badge-lime text-[10px]">
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/40 mt-1 font-mono">
                          <span>Linked on {new Date(acc.connectedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="text-coral-400 font-semibold bg-coral-500/10 border border-coral-500/20 rounded-full px-2 py-0.5 text-[10px]">
                            {totalIngested !== null ? `${totalIngested} Posts Synced` : 'Checking sync...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSyncIngestion(acc.id)}
                        disabled={syncingId === acc.id}
                        className="btn-secondary text-xs py-1.5 px-3.5 flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${syncingId === acc.id ? 'animate-spin text-coral-400' : ''}`}
                        />
                        <span>{syncingId === acc.id ? 'Syncing...' : 'Sync Posts'}</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(acc.id)}
                        className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 flex items-center gap-1.5 transition-colors font-medium"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  {syncMessage && (
                    <div className="rounded-xl border border-coral-500/30 bg-coral-500/10 p-3 text-xs text-coral-200 flex items-center gap-2.5 animate-fade-in font-medium">
                      {syncingId === acc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-coral-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-lime-400 shrink-0" />
                      )}
                      <span>{syncMessage}</span>
                    </div>
                  )}

                  <div className="border-t border-white/[0.06] pt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-[11px] text-white/40">
                    <span>Platform: Meta Threads Graph API</span>
                    <span>Newly created posts on Threads can take 2–5 minutes to propagate to Meta&apos;s API.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Scopes Information */}
        <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-7 backdrop-blur-xl shadow-card-elevated">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
            <h4 className="text-sm font-bold text-white font-display">
              Enterprise Security & Least-Privilege Scopes
            </h4>
          </div>
          <p className="text-xs text-white/60 leading-relaxed font-normal">
            ThreadPilot adheres strictly to Phase 1 least-privilege access rules. Tokens are
            encrypted at rest via AES-256-GCM with key versioning. ThreadPilot only requests{' '}
            <code className="rounded-md bg-white/10 px-1.5 py-0.5 font-mono text-coral-300 font-semibold">
              threads_basic
            </code>{' '}
            in Phase 1.
          </p>
        </div>
      </div>
    </div>
  );
}
