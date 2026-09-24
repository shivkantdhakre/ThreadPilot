export interface IntelligenceNode {
  step: string;
  name: string;
  desc: string;
  accent: string;
}

export const intelligenceData = {
  eyebrow: 'CONTINUOUS IMPROVEMENT',
  headline: 'A self-improving content system.',
  subtext:
    'Every post teaches ThreadPilot something new. Your content, audience reactions and engagement data flow into a continuous learning loop — so your future content keeps getting better.',
  ctaText: 'See How It Works',
  nodes: [
    { step: '1', name: 'Threads', desc: 'Your content lives on Threads', accent: '#FF7048' },
    { step: '2', name: 'Analytics', desc: 'Real engagement data', accent: '#00ADB5' },
    { step: '3', name: 'Learning', desc: 'Identifies high-signal patterns', accent: '#8B5CF6' },
    { step: '4', name: 'Personal Profile', desc: 'Refines your voice model', accent: '#A855F7' },
    { step: '5', name: 'Content Generation', desc: 'Drafts higher-impact posts', accent: '#FF5722' },
    { step: '6', name: 'Publishing', desc: 'Dispatches at peak time slots', accent: '#84CC16' },
  ] as IntelligenceNode[],
  metrics: [
    { value: '+38%', label: 'Engagement rate improvement' },
    { value: '2.4×', label: 'Better consistency over time' },
  ],
  handwrittenNote: 'The more you post, the smarter it gets.',
};
