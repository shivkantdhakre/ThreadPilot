export interface PricingTier {
  id: string;
  name: string;
  badge?: string;
  badgeAccent?: string;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
  features: string[];
  ctaLabel: string;
  popular?: boolean;
}

export const pricingData = {
  eyebrow: 'SIMPLE, TRANSPARENT PRICING',
  headline: 'Start free. Grow at your pace.',
  subtext:
    'Get started with a free tier. Upgrade whenever you need autonomous scheduling and deeper personalization.',
  discountBadge: 'Save 20%',
  plans: [
    {
      id: 'free',
      name: 'Free',
      monthlyPrice: 0,
      yearlyPrice: 0,
      description: 'For individuals exploring personal Threads creation.',
      features: [
        'Basic AI generation',
        '10 scheduled posts / month',
        'Core analytics overview',
        'Manual approval workflow',
        'Community support',
      ],
      ctaLabel: 'Get Started',
      popular: false,
    },
    {
      id: 'pro',
      name: 'Pro',
      badge: 'Most Popular',
      badgeAccent: 'coral',
      monthlyPrice: 9,
      yearlyPrice: 7,
      description: 'For creators, developers and active professionals.',
      features: [
        'Advanced content generator',
        'Unlimited queue scheduling',
        'Personal voice profiling',
        'Audience engagement insights',
        'Timezone-aware dispatch',
        'Priority support',
      ],
      ctaLabel: 'Start Pro Free',
      popular: true,
    },
    {
      id: 'team',
      name: 'Team',
      monthlyPrice: 29,
      yearlyPrice: 23,
      description: 'For growing teams and multi-brand operators.',
      features: [
        'Everything in Pro',
        'Team collaboration seats',
        'Shared content library',
        'Advanced analytics export',
        'Dedicated queue workers',
      ],
      ctaLabel: 'Contact Sales',
      popular: false,
    },
  ] as PricingTier[],
};
