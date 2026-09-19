import { apiClient } from './api-client';

export interface JobProgressEvent {
  requestId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETE' | 'FAILED';
  progress: number;
  progressMessage: string;
  resultEntityType?: string | null;
  resultEntityId?: string | null;
  error?: string | null;
}

export function subscribeJobProgress(
  requestId: string,
  onEvent: (event: JobProgressEvent) => void,
  onComplete?: () => void,
  onError?: (err: Error) => void,
): () => void {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
  const url = `${baseUrl}/jobs/${requestId}/stream`;

  // Use native EventSource with custom event handling or fetch stream
  // Since EventSource doesn't support custom headers directly, we can pass token via query or use fetch-based SSE
  const controller = new AbortController();

  (async () => {
    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiClient.token}`,
          'x-workspace-id': apiClient.workspaceId || '',
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`Failed to connect to progress stream: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const block of lines) {
          const dataLine = block.split('\n').find((l) => l.startsWith('data:'));
          if (dataLine) {
            try {
              const rawData = dataLine.replace(/^data:\s*/, '');
              const event = JSON.parse(rawData) as JobProgressEvent;
              onEvent(event);

              if (event.status === 'COMPLETE' || event.status === 'FAILED' || event.progress === 100) {
                onComplete?.();
                return;
              }
            } catch (parseErr) {
              console.warn('Failed to parse SSE data', parseErr);
            }
          }
        }
      }

      onComplete?.();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        onError?.(err instanceof Error ? err : new Error(String(err)));
      }
    }
  })();

  return () => {
    controller.abort();
  };
}
