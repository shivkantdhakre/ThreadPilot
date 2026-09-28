'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiClient } from '../../../../lib/api-client';

import { ThreadPilotLoader } from '../../../../components/ui/ThreadPilotLoader';

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
    <div className="w-full max-w-sm card-base p-8 text-center shadow-card space-y-4">
      {status === 'processing' && (
        <div className="py-4 space-y-4">
          <div className="flex justify-center">
            <ThreadPilotLoader size="md" message="Exchanging credentials..." />
          </div>
          <div>
            <h2 className="text-base font-bold text-text-primary font-display">Connecting to Threads</h2>
            <p className="text-xs text-text-secondary mt-1">{message}</p>
          </div>
        </div>
      )}

      {status === 'success' && (
        <div className="py-4 space-y-3">
          <CheckCircle2 className="h-10 w-10 text-lime-600 mx-auto" />
          <h2 className="text-base font-bold text-text-primary font-display">Account Linked!</h2>
          <p className="text-xs text-emerald-700 font-medium bg-emerald-50 py-1.5 px-3 rounded-lg border border-emerald-200">
            {message}
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="py-4 space-y-3">
          <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
          <h2 className="text-base font-bold text-text-primary font-display">Connection Failed</h2>
          <p className="text-xs text-rose-700 bg-rose-50 py-2 px-3 rounded-lg border border-rose-200">
            {message}
          </p>
          <button
            onClick={() => router.push('/connect')}
            className="btn-primary w-full py-2.5 text-xs mt-2"
          >
            Back to Accounts
          </button>
        </div>
      )}
    </div>
  );
}

export default function ThreadsCallbackPage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-6 bg-warm-white">
      <Suspense
        fallback={
          <div className="text-center">
            <ThreadPilotLoader size="md" message="Processing authorization..." />
          </div>
        }
      >
        <ThreadsCallbackContent />
      </Suspense>
    </div>
  );
}
