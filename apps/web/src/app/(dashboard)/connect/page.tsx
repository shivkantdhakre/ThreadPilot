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
  const [isLoading, setIsLoading] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const loadStatus = async () => {
    try {
      const res = await apiClient.get<{ accounts: any[] }>('/threads-auth/status');
      setAccounts(res.accounts ?? []);
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
    try {
      await apiClient.post('/ingestion/start', { socialAccountId: accountId, isInitial: false });
      alert('Ingestion job dispatched! Posts are being synchronized.');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSyncingId(null);
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
                  className="rounded-xl border border-white/10 bg-black/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 font-bold text-white text-sm">
                      {acc.username.slice(0, 1).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">@{acc.username}</span>
                        <span className="flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> Connected
                        </span>
                      </div>
                      <p className="text-xs text-white/40 mt-0.5">
                        Linked on {new Date(acc.connectedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleSyncIngestion(acc.id)}
                      disabled={syncingId === acc.id}
                      className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/80 hover:bg-white/10 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${syncingId === acc.id ? 'animate-spin' : ''}`}
                      />
                      <span>Sync Posts</span>
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
