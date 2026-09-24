export interface NavItem {
  label: string;
  href: string;
}

export const navigationItems: NavItem[] = [
  { label: 'Product', href: '#product' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Features', href: '#features' },
  { label: 'Intelligence', href: '#intelligence' },
  { label: 'Analytics', href: '#analytics' },
  { label: 'Pricing', href: '#pricing' },
];

export const navActions = {
  signIn: { label: 'Sign In', href: '/login' as const },
  getStarted: { label: 'Get Started', href: '/register' as const },
};
