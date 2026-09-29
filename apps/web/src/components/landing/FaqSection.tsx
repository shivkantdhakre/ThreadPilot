'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, HelpCircle, ArrowRight, ShieldCheck, BookOpen, MessageSquare } from 'lucide-react';

interface FaqItem {
  id: string;
  category: 'security' | 'voice' | 'limits' | 'queue';
  question: string;
  answer: string;
  highlightChips?: string[];
}

const faqs: FaqItem[] = [
  {
    id: '1',
    category: 'security',
    question: 'How does ThreadPilot connect to my Threads account?',
    answer:
      'ThreadPilot uses official Meta Graph API OAuth 2.0 authorization. You authenticate directly through Meta, granting granular permission to publish threads and read post insights. We never store or ask for your password, and all authorization tokens are encrypted at rest with AES-256 GCM in our cryptographic vault.',
    highlightChips: ['Meta OAuth 2.0', 'AES-256 GCM Vault', 'Zero Password Storage'],
  },
  {
    id: '2',
    category: 'limits',
    question: 'How does ThreadPilot handle the 500-character Threads limit?',
    answer:
      'Our Content Studio features deterministic character counting and platform boundary validation. When an idea exceeds 500 characters, ThreadPilot provides intelligent thread-splitting suggestions that divide thoughts at natural syntactic breakpoints rather than truncating mid-sentence.',
    highlightChips: ['500-Char Bounds', 'Syntactic Splitting', 'Zero Truncation'],
  },
  {
    id: '3',
    category: 'voice',
    question: 'How does the AI learn my personal writing voice?',
    answer:
      'Unlike generic chatbots that rely on repetitive prompts, ThreadPilot decomposes your historical high-performing posts across 8 dimensions: sentence cadence, vocabulary complexity, technical depth, hook punchiness, and formatting density. It uses these stylistic vectors as few-shot prompt context.',
    highlightChips: ['8D Vector Profiling', 'Few-Shot Ingestion', 'Zero Generic Templates'],
  },
  {
    id: '4',
    category: 'queue',
    question: 'What happens if a scheduled post fails to publish?',
    answer:
      'Publishing tasks are processed through a distributed BullMQ transaction outbox with worker lease tokens. If Meta\'s servers experience a transient outage or network rate-limit, the job is automatically retried with exponential backoff rather than lost. Real-time telemetry alerts appear in your dashboard.',
    highlightChips: ['BullMQ Outbox', 'Exponential Backoff', 'Lease Token Safety'],
  },
  {
    id: '5',
    category: 'queue',
    question: 'Can I edit or cancel a post once it is in the queue?',
    answer:
      'Yes. You can edit any queued draft, change the scheduled dispatch window, or cancel the schedule directly from the Publishing Calendar or Queue management view right up until the exact execution timestamp.',
    highlightChips: ['Real-Time Editing', 'Queue Cancellation', 'Calendar Controls'],
  },
  {
    id: '6',
    category: 'security',
    question: 'Is ThreadPilot compliant with Meta\'s platform policies?',
    answer:
      'Yes. We operate strictly within official Meta Graph API endpoints and rate bounds. ThreadPilot is designed as an assistant for authentic creators and developers to think and publish in public, with strict safeguards against spamming or unauthorized scraping.',
    highlightChips: ['Meta Policy Compliant', 'Rate-Limit Safe', 'Authentic Creator Focus'],
  },
];

export const FaqSection: React.FC = () => {
  const [openId, setOpenId] = useState<string | null>('1');
  const [activeCategory, setActiveCategory] = useState<string>('all');

  const filteredFaqs =
    activeCategory === 'all'
      ? faqs
      : faqs.filter((faq) => faq.category === activeCategory);

  const toggleFaq = (id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  };

  return (
    <section id="faq" className="relative z-10 bg-warm-white py-24 px-6 border-b border-canvas-border overflow-hidden">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-60px' }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-2xl mx-auto mb-12"
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-coral-600 bg-coral-500/10 px-3.5 py-1 rounded-full border border-coral-500/20 mb-3.5 font-mono">
            <HelpCircle className="h-3.5 w-3.5 text-coral-600" />
            <span>Frequently Asked Questions</span>
          </span>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-text-primary tracking-tight font-display mb-4">
            Clear answers to common questions.
          </h2>
          <p className="text-base text-text-secondary leading-relaxed font-sans">
            Everything you need to know about ThreadPilot's architecture, security, and publishing capabilities.
          </p>
        </motion.div>

        {/* Category Filter Pills */}
        <div className="flex flex-wrap items-center justify-center gap-2 mb-10">
          {[
            { id: 'all', label: 'All Architecture' },
            { id: 'security', label: 'Security & Meta API' },
            { id: 'limits', label: '500-Char Bounds' },
            { id: 'voice', label: 'Voice Calibration' },
            { id: 'queue', label: 'Queue & Reliability' },
          ].map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`text-xs px-3.5 py-1.5 rounded-full font-medium transition-all ${
                activeCategory === cat.id
                  ? 'bg-coral-500 text-white font-semibold shadow-xs'
                  : 'bg-white border border-canvas-border text-text-secondary hover:bg-paper hover:text-text-primary'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Clean Accordion List */}
        <div className="space-y-3.5">
          {filteredFaqs.map((faq, idx) => {
            const isOpen = openId === faq.id;
            return (
              <motion.div
                key={faq.id}
                layout
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: idx * 0.05 }}
                className={`rounded-2xl border transition-all duration-200 overflow-hidden bg-white ${
                  isOpen
                    ? 'border-coral-500/40 shadow-card ring-2 ring-coral-500/10'
                    : 'border-canvas-border hover:border-canvas-border-muted shadow-2xs'
                }`}
              >
                <button
                  onClick={() => toggleFaq(faq.id)}
                  className="w-full py-5 px-6 text-left flex items-center justify-between gap-4 focus:outline-none cursor-pointer group"
                  aria-expanded={isOpen}
                >
                  <div className="flex items-center gap-3.5">
                    <span className="text-xs font-mono font-bold text-coral-600/70 shrink-0">
                      0{faq.id}
                    </span>
                    <span className={`text-sm sm:text-base font-bold transition-colors font-display ${isOpen ? 'text-coral-600' : 'text-text-primary group-hover:text-coral-600'}`}>
                      {faq.question}
                    </span>
                  </div>

                  <div
                    className={`h-7 w-7 rounded-full flex items-center justify-center shrink-0 border transition-all duration-200 ${
                      isOpen
                        ? 'bg-coral-500 text-white border-coral-500 rotate-45 shadow-xs'
                        : 'bg-paper border-canvas-border text-text-muted group-hover:border-coral-300 group-hover:text-coral-600'
                    }`}
                  >
                    <Plus className="h-4 w-4" />
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="content"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <div className="px-6 pb-6 pt-1 text-xs sm:text-sm text-text-secondary leading-relaxed border-t border-canvas-border/50">
                        <p className="mb-4">{faq.answer}</p>

                        {/* Technical Chip Highlights */}
                        {faq.highlightChips && (
                          <div className="flex flex-wrap gap-2 pt-2 border-t border-canvas-border/40">
                            {faq.highlightChips.map((chip) => (
                              <span
                                key={chip}
                                className="inline-flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-coral-50 text-coral-700 border border-coral-200/60"
                              >
                                <span className="h-1 w-1 rounded-full bg-coral-500" />
                                {chip}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom Support Prompt */}
        <div className="mt-12 p-6 rounded-2xl bg-paper/60 border border-canvas-border flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-coral-500/10 text-coral-600 flex items-center justify-center shrink-0">
              <MessageSquare className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-text-primary">Still have technical questions?</h4>
              <p className="text-xs text-text-secondary">Read our complete system specifications or reach out directly.</p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <a
              href="#product"
              className="btn-secondary text-xs py-2 px-4 inline-flex items-center gap-1.5 shadow-2xs"
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>Architecture Docs</span>
            </a>
            <a
              href="/register"
              className="btn-primary text-xs py-2 px-4 inline-flex items-center gap-1.5 shadow-2xs"
            >
              <span>Get Started</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};

