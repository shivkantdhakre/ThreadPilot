import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '../hooks/useAuth';

export const metadata: Metadata = {
  title: 'ThreadPilot — Personal Social AI Platform for Threads',
  description: 'AI-powered personal social-media operating system for Meta Threads',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased selection:bg-brand-500 selection:text-white">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
