'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';

function ThreadsCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [message, setMessage] = useState('Connecting your Threads account...');

  useEffect(() => {
    const socialAccountId = searchParams.get('socialAccountId');
    const username = searchParams.get('username');

    if (socialAccountId) {
      setStatus('success');
      setMessage(`Connected @${username || 'threads_user'}! Redirecting to Accounts...`);
      apiClient.post('/ingestion/start', { isInitial: true, socialAccountId }).catch(() => {});
      setTimeout(() => {
        router.push('/connect');
      }, 1800);
      return;
    }

    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code || !state) {
      setStatus('error');
      setMessage('Missing OAuth parameters in redirect URL.');
      return;
    }

    async function exchangeToken() {
      try {
        const res = await apiClient.get<{ success: boolean; username: string }>(
          `/threads-auth/callback?code=${encodeURIComponent(code!)}&state=${encodeURIComponent(state!)}`,
        );

        setStatus('success');
        setMessage(`Connected @${res.username}! Redirecting to Accounts...`);

        // Automatically trigger initial ingestion
        await apiClient.post('/ingestion/start', { isInitial: true });

        setTimeout(() => {
          router.push('/connect');
        }, 1800);
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Failed to exchange authorization code with Threads.');
      }
    }

    exchangeToken();
  }, [searchParams, router]);

  return (
    <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-900/80 p-8 text-center backdrop-blur-xl">
      {status === 'processing' && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-brand-400 mx-auto mb-4" />
          <h2 className="text-base font-bold text-white mb-2">Connecting to Threads</h2>
          <p className="text-xs text-white/50">{message}</p>
        </>
      )}

      {status === 'success' && (
        <>
          <CheckCircle2 className="h-10 w-10 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-base font-bold text-white mb-2">Account Linked!</h2>
          <p className="text-xs text-emerald-300">{message}</p>
        </>
      )}

      {status === 'error' && (
        <>
          <AlertCircle className="h-10 w-10 text-rose-400 mx-auto mb-4" />
          <h2 className="text-base font-bold text-white mb-2">Connection Failed</h2>
          <p className="text-xs text-rose-300 mb-4">{message}</p>
          <button
            onClick={() => router.push('/connect')}
            className="btn-primary w-full py-2 text-xs"
          >
            Back to Accounts
          </button>
        </>
      )}
    </div>
  );
}

export default function ThreadsCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-slate-950">
      <Suspense
        fallback={
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-400 mx-auto mb-3" />
            <p className="text-xs text-white/50">Processing authorization...</p>
          </div>
        }
      >
        <ThreadsCallbackContent />
      </Suspense>
    </div>
  );
}
