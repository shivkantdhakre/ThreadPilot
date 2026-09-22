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
    <div>
      <TopBar title="Connected Accounts" />

      <div className="p-8 max-w-4xl mx-auto space-y-8">
        <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-5 mb-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-purple-500 to-indigo-500 text-white shadow-md">
                <Share2 className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white tracking-tight">
                  Meta Threads Integration
                </h3>
                <p className="text-xs text-white/50">
                  Direct OAuth connection using PKCE and encrypted token storage
                </p>
              </div>
            </div>

            {accounts.length === 0 && (
              <button
                onClick={handleConnect}
                disabled={isConnecting}
                className="btn-primary flex items-center gap-2 text-xs py-2.5 px-4"
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
            <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
              <AlertCircle className="h-8 w-8 text-white/30 mx-auto mb-2" />
              <p className="text-sm font-medium text-white/70">No Threads Account Connected</p>
              <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
                Authorize ThreadPilot to read your past posts to train your personalized AI voice
                and verify publication boundaries.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {accounts.map((acc) => (
                <div
                  key={acc.id}
                  className="rounded-xl border border-white/10 bg-black/40 p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 font-bold text-white text-sm shadow-md">
                        {acc.username.slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-white">@{acc.username}</span>
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Connected
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-white/40 mt-1">
                          <span>Linked on {new Date(acc.connectedAt).toLocaleDateString()}</span>
                          <span>•</span>
                          <span className="text-brand-300 font-medium bg-brand-500/10 border border-brand-500/20 rounded px-1.5 py-0.5 text-[11px]">
                            {totalIngested !== null ? `${totalIngested} Posts Synced` : 'Checking sync...'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleSyncIngestion(acc.id)}
                        disabled={syncingId === acc.id}
                        className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <RefreshCw
                          className={`h-3 w-3 ${syncingId === acc.id ? 'animate-spin text-brand-400' : ''}`}
                        />
                        <span>{syncingId === acc.id ? 'Syncing...' : 'Sync Posts'}</span>
                      </button>
                      <button
                        onClick={() => handleDisconnect(acc.id)}
                        className="rounded-lg border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-300 hover:bg-rose-500/20 flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="h-3 w-3" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  </div>

                  {syncMessage && (
                    <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 p-3 text-xs text-brand-200 flex items-center gap-2.5">
                      {syncingId === acc.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-brand-400 shrink-0" />
                      ) : (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                      )}
                      <span>{syncMessage}</span>
                    </div>
                  )}

                  <div className="border-t border-white/5 pt-3 flex items-center justify-between text-[11px] text-white/40">
                    <span>Platform: Meta Threads Graph API</span>
                    <span>Note: Newly created posts on Threads can take 2–5 minutes to propagate to Meta&apos;s API.</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Security & Scopes Information */}
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6 backdrop-blur-xl">
          <div className="flex items-center gap-2.5 mb-3">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h4 className="text-sm font-semibold text-white">
              Enterprise Security & Least-Privilege Scopes
            </h4>
          </div>
          <p className="text-xs text-white/60 leading-relaxed mb-4">
            ThreadPilot adheres strictly to Phase 1 least-privilege access rules. Tokens are
            encrypted at rest via AES-256-GCM with key versioning. ThreadPilot only requests{' '}
            <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-brand-300">
              threads_basic
            </code>{' '}
            in Phase 1.
          </p>
        </div>
      </div>
    </div>
  );
}
