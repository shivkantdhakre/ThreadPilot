'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Tag, BookOpen, Loader2 } from 'lucide-react';
import { StyleExampleDto } from '@threadpilot/types';
import { apiClient } from '../../lib/api-client';

interface StyleExamplesListProps {
  examples: StyleExampleDto[];
  onRate?: (exampleId: string, rating: number) => void;
}

export function StyleExamplesList({ examples, onRate }: StyleExamplesListProps) {
  const [items, setItems] = useState<StyleExampleDto[]>(examples);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  React.useEffect(() => {
    setItems(examples);
  }, [examples]);

  const handleRate = async (exampleId: string, rating: number) => {
    try {
      setLoadingId(exampleId);
      await apiClient.patch(`/profile/style/examples/${exampleId}/rating`, { rating });
      setItems((prev) =>
        prev.map((it) => (it.id === exampleId ? { ...it, userRating: rating } : it)),
      );
      onRate?.(exampleId, rating);
    } catch (err) {
      console.error('Failed to rate example', err);
    } finally {
      setLoadingId(null);
    }
  };

  if (items.length === 0) {
    return (
      <div className="card-base p-8 text-center space-y-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-canvas-border bg-soft-gray text-text-muted mx-auto mb-2">
          <BookOpen className="h-5 w-5" />
        </div>
        <p className="text-xs font-bold text-text-primary">No Style Examples Extracted Yet</p>
        <p className="text-[11px] text-text-muted max-w-sm mx-auto">
          Connect your Threads profile and run Voice Training above to extract high-signal writing examples.
        </p>
      </div>
    );
  }

  return (
    <div className="card-base p-6 sm:p-7 space-y-5">
      <div className="flex items-center justify-between border-b border-canvas-border pb-4">
        <div>
          <h3 className="text-base font-bold text-text-primary tracking-tight font-display">
            Learned Style Anchors & Few-Shot Memory
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Rate examples to steer future AI content. Downvoted examples are automatically excluded from generation context.
          </p>
        </div>
        <span className="badge-neutral text-xs font-mono">{items.length} examples</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((ex) => {
          const isLiked = ex.userRating === 1;
          const isDisliked = ex.userRating === -1;
          const isLoadingThis = loadingId === ex.id;

          return (
            <div
              key={ex.id}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-all duration-200 ${
                isDisliked
                  ? 'border-rose-200 bg-rose-50/40 opacity-70'
                  : isLiked
                  ? 'border-lime-200 bg-lime-50/40 shadow-subtle'
                  : 'border-canvas-border bg-paper/60 hover:border-canvas-border-muted'
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ex.topic && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[10px] font-semibold text-text-secondary border border-canvas-border">
                        <Tag className="h-2.5 w-2.5" />
                        {ex.topic}
                      </span>
                    )}
                    {ex.format && (
                      <span className="badge-coral text-[10px]">
                        {ex.format}
                      </span>
                    )}
                  </div>

                  {isDisliked && (
                    <span className="text-[10px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-full border border-rose-200">
                      Excluded
                    </span>
                  )}
                  {isLiked && (
                    <span className="text-[10px] font-bold text-lime-800 bg-lime-100 px-2 py-0.5 rounded-full border border-lime-200">
                      Anchor
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm text-text-primary leading-relaxed font-sans line-clamp-4 whitespace-pre-wrap">
                  "{ex.text}"
                </p>
              </div>

              {/* Voting controls */}
              <div className="pt-3 mt-3 border-t border-canvas-border flex items-center justify-between text-xs">
                <span className="text-[11px] font-mono text-text-muted">
                  {ex.text.length} chars
                </span>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRate(ex.id, isLiked ? 0 : 1)}
                    disabled={isLoadingThis}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      isLiked
                        ? 'bg-lime-200 text-lime-900 border border-lime-300'
                        : 'border border-canvas-border bg-white text-text-secondary hover:text-lime-700 hover:bg-lime-50'
                    }`}
                    title="Good example of personal voice"
                  >
                    <ThumbsUp className="h-3 w-3" />
                    <span>Anchor</span>
                  </button>

                  <button
                    onClick={() => handleRate(ex.id, isDisliked ? 0 : -1)}
                    disabled={isLoadingThis}
                    className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                      isDisliked
                        ? 'bg-rose-200 text-rose-900 border border-rose-300'
                        : 'border border-canvas-border bg-white text-text-secondary hover:text-rose-700 hover:bg-rose-50'
                    }`}
                    title="Exclude this style from future generations"
                  >
                    <ThumbsDown className="h-3 w-3" />
                    <span>Exclude</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default StyleExamplesList;
