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
      <div className="rounded-3xl border border-white/[0.08] bg-ink-850 p-10 text-center backdrop-blur-xl shadow-card-elevated">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/30 mx-auto mb-3">
          <BookOpen className="h-6 w-6" />
        </div>
        <p className="text-sm text-white/80 font-bold">No Style Examples Extracted Yet</p>
        <p className="text-xs text-white/40 mt-1 max-w-sm mx-auto">
          Connect your Threads account and run Voice Training to extract high-performing examples.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-white/[0.08] bg-[#111116] p-6 sm:p-7 backdrop-blur-xl shadow-card-elevated">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-white tracking-tight font-display">
            Learned Style Examples & Few-Shot Memory
          </h3>
          <p className="text-xs text-white/50 mt-0.5">
            Rate examples to steer future AI content. Downvoted examples are automatically excluded from generation.
          </p>
        </div>
        <span className="badge-neutral text-xs font-mono">{items.length} examples</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {items.map((ex) => {
          const isLiked = ex.userRating === 1;
          const isDisliked = ex.userRating === -1;

          return (
            <div
              key={ex.id}
              className={`flex flex-col justify-between rounded-2xl border p-5 transition-all duration-200 ${
                isDisliked
                  ? 'border-rose-500/30 bg-rose-500/[0.03] opacity-60'
                  : isLiked
                  ? 'border-lime-500/30 bg-lime-500/[0.03]'
                  : 'border-white/[0.06] bg-ink-900/80 hover:border-white/15'
              }`}
            >
              <div>
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {ex.topic && (
                      <span className="flex items-center gap-1 rounded-full bg-white/5 px-2.5 py-0.5 text-[10px] font-semibold text-white/70 border border-white/5">
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
                    <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
                      Excluded from Memory
                    </span>
                  )}
                  {isLiked && (
                    <span className="text-[10px] font-bold text-lime-400 bg-lime-500/10 px-2 py-0.5 rounded-full border border-lime-500/20">
                      High-Priority Exemplar
                    </span>
                  )}
                </div>

                <p className="text-xs sm:text-sm leading-relaxed text-white/90 whitespace-pre-wrap mb-4 font-sans">
                  {ex.text}
                </p>
              </div>

              {/* Rating Controls */}
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 mt-auto">
                <span className="text-[11px] text-white/40">Steer style archetype:</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleRate(ex.id, isLiked ? 0 : 1)}
                    disabled={loadingId === ex.id}
                    title="Emphasize this style pattern"
                    className={`rounded-lg p-2 transition-colors ${
                      isLiked
                        ? 'bg-lime-500 text-ink-950 font-bold'
                        : 'text-white/40 hover:bg-white/10 hover:text-white'
                    }`}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleRate(ex.id, isDisliked ? 0 : -1)}
                    disabled={loadingId === ex.id}
                    title="Exclude this style from generation"
                    className={`rounded-lg p-2 transition-colors ${
                      isDisliked
                        ? 'bg-rose-500 text-white font-bold'
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
