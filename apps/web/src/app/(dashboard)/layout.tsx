'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Sidebar } from '../../components/Sidebar';
import Logo from '../../components/ui/Logo';
import { DashboardLayoutProvider, useDashboardLayout } from '../../context/DashboardLayoutContext';

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { isMobileNavOpen, closeMobileNav } = useDashboardLayout();

  return (
    <div className="min-h-screen bg-warm-white text-text-primary selection:bg-coral-500/20 selection:text-coral-600">
      <Sidebar mobileOpen={isMobileNavOpen} onCloseMobile={closeMobileNav} />
      <div className="flex flex-col min-h-screen lg:pl-64 transition-all duration-200">
        <main className="flex-1 pb-16">{children}</main>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-warm-white">
        <div className="flex flex-col items-center gap-3">
          <Logo size="md" theme="light" />
          <div className="flex items-center gap-2 mt-2 text-xs text-text-muted font-medium">
            <Loader2 className="h-4 w-4 animate-spin text-coral-500" />
            <span>Connecting workspace telemetry...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <DashboardLayoutProvider>
      <DashboardShell>{children}</DashboardShell>
    </DashboardLayoutProvider>
  );
}
