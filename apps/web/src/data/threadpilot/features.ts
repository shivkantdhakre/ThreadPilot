export interface FeatureItem {
  id: string;
  title: string;
  description: string;
  accent: string;
  iconName: string;
  category: 'core' | 'intelligence' | 'operations';
}

export const featuresData = {
  eyebrow: 'POWERFUL FEATURES',
  headline: 'Everything you need to grow on Threads.',
  subtext:
    'Thoughtful tools designed for creators, developers, founders and teams who think in public.',
  features: [
    {
      id: 'ai-generation',
      title: 'AI Content Generation',
      description: 'Create high-quality posts with consistent, authentic voice matching.',
      accent: 'coral',
      iconName: 'sparkles',
      category: 'core',
    },
    {
      id: 'personal-voice',
      title: 'Personal Voice',
      description: 'Learns from your writing patterns to replicate your unique tone.',
      accent: 'purple',
      iconName: 'fingerprint',
      category: 'intelligence',
    },
    {
      id: 'smart-scheduling',
      title: 'Smart Scheduling',
      description: 'Post at the optimal time with data-backed audience recommendations.',
      accent: 'cyan',
      iconName: 'calendar',
      category: 'operations',
    },
    {
      id: 'analytics',
      title: 'Analytics & Insights',
      description: 'Understand reach patterns, engagement velocity, and topic affinity.',
      accent: 'lime',
      iconName: 'bar-chart',
      category: 'intelligence',
    },
    {
      id: 'reply-management',
      title: 'Reply Management',
      description: 'Review high-dwell replies and cultivate deeper community discussions.',
      accent: 'orange',
      iconName: 'message-square',
      category: 'operations',
    },
    {
      id: 'content-library',
      title: 'Content Library',
      description: 'Save, organize, and remix your best-performing thought structures.',
      accent: 'violet',
      iconName: 'folder',
      category: 'core',
    },
    {
      id: 'hook-experiments',
      title: 'Hook Variations',
      description: 'Test multiple opening premises to see which maximizes initial dwell time.',
      accent: 'mint',
      iconName: 'sliders',
      category: 'core',
    },
    {
      id: 'security-control',
      title: 'Security & Control',
      description: 'Official Meta Graph API OAuth with PKCE challenges and granular manual approval.',
      accent: 'emerald',
      iconName: 'shield',
      category: 'operations',
    },
  ] as FeatureItem[],
};
