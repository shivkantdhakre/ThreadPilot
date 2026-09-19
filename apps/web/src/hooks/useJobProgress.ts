'use client';

import { useState, useEffect } from 'react';
import { subscribeJobProgress, JobProgressEvent } from '../lib/sse';

export function useJobProgress(requestId: string | null) {
  const [progress, setProgress] = useState<number>(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [status, setStatus] = useState<string>('IDLE');
  const [resultEntityType, setResultEntityType] = useState<string | null>(null);
  const [resultEntityId, setResultEntityId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setProgress(0);
      setProgressMessage('');
      setStatus('IDLE');
      setResultEntityType(null);
      setResultEntityId(null);
      setError(null);
      setIsStreaming(false);
      return;
    }

    setIsStreaming(true);

    const unsubscribe = subscribeJobProgress(
      requestId,
      (event: JobProgressEvent) => {
        setProgress(event.progress);
        setProgressMessage(event.progressMessage);
        setStatus(event.status);
        if (event.resultEntityType) setResultEntityType(event.resultEntityType);
        if (event.resultEntityId) setResultEntityId(event.resultEntityId);
        if (event.error) setError(event.error);
      },
      () => {
        setIsStreaming(false);
      },
      (err) => {
        setError(err.message);
        setIsStreaming(false);
      },
    );

    return () => {
      unsubscribe();
    };
  }, [requestId]);

  return {
    progress,
    progressMessage,
    status,
    resultEntityType,
    resultEntityId,
    error,
    isStreaming,
    isRunning: status === 'RUNNING' || status === 'PENDING',
    isComplete: status === 'COMPLETE' || progress === 100,
    isFailed: status === 'FAILED' || Boolean(error),
  };
}
