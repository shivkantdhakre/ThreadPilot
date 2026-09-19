'use client';

import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown, Minus, Tag, BookOpen } from 'lucide-react';
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
      <div className="rounded-2xl border border-white/10 bg-slate-900/40 p-8 text-center backdrop-blur-xl">
        <BookOpen className="h-8 w-8 text-white/30 mx-auto mb-2" />
        <p className="text-sm text-white/70 font-medium">No Style Examples Extracted Yet</p>
        <p className="text-xs text-white/40 mt-1">
          Connect your Threads account and run Voice Training to extract high-performing examples.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-900/80 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-sm font-bold text-white tracking-tight">
            Learned Style Examples & Few-Shot Memory
          </h3>
          <p className="text-xs text-white/50">
            Rate examples to steer future AI content. Downvoted examples are automatically excluded from generation.
          </p>
        </div>
        <span className="text-xs text-white/40">{items.length} examples</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((ex) => {
          const isLiked = ex.userRating === 1;
          const isDisliked = ex.userRating === -1;

          return (
            <div
              key={ex.id}
              className={`flex flex-col justify-between rounded-xl border p-4 transition-all ${
                isDisliked
                  ? 'border-rose-500/20 bg-rose-500/[0.02] opacity-60'
                  : isLiked
                  ? 'border-emerald-500/30 bg-emerald-500/[0.04]'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ex.topic && (
                      <span className="flex items-center gap-1 rounded bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/70">
                        <Tag className="h-2.5 w-2.5" />
                        {ex.topic}
                      </span>
                    )}
                    {ex.format && (
                      <span className="rounded bg-brand-500/10 px-2 py-0.5 text-[10px] font-medium text-brand-300 border border-brand-500/20">
                        {ex.format}
                      </span>
                    )}
                  </div>

                  {isDisliked && (
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                      Excluded from Generation
                    </span>
                  )}
                  {isLiked && (
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                      Preferred Style
                    </span>
                  )}
                </div>

                <p className="text-xs leading-relaxed text-white/90 whitespace-pre-wrap mb-4 font-sans">
                  {ex.text}
                </p>
              </div>

              {/* Rating Controls */}
              <div className="flex items-center justify-between border-t border-white/5 pt-3 mt-auto">
                <span className="text-[10px] text-white/40">Steer style:</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleRate(ex.id, isLiked ? 0 : 1)}
                    disabled={loadingId === ex.id}
                    title="Emphasize this style pattern"
                    className={`rounded p-1.5 transition-colors ${
                      isLiked
                        ? 'bg-emerald-500 text-white'
                        : 'text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleRate(ex.id, isDisliked ? 0 : -1)}
                    disabled={loadingId === ex.id}
                    title="Exclude this style from generation"
                    className={`rounded p-1.5 transition-colors ${
                      isDisliked
                        ? 'bg-rose-500 text-white'
                        : 'text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" />
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
