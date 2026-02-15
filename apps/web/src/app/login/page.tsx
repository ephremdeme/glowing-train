'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sparkles } from 'lucide-react';
import { LoginForm } from '@/components/auth/login-form';
import { readAccessToken } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';
  const nextPath = searchParams.get('next') ?? '/quote';

  useEffect(() => {
    if (readAccessToken()) {
      router.replace(nextPath as Route);
    }
  }, [nextPath, router]);

  return (
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
      <section className="neon-surface neon-section hidden rounded-[1.8rem] p-8 lg:grid">
        <div className="grid gap-5">
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/30 bg-primary/15 px-3 py-1 text-xs uppercase tracking-[0.15em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Secure Sender Access
          </div>
          <h1 className="text-4xl font-semibold">Welcome back</h1>
          <p className="text-sm text-muted-foreground">
            Pick up where you left off. Your quote, transfer details, and status pages stay in sync across sessions.
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>Continue with password or Google.</p>
            <p>Transfers remain non-custodial and security-gated.</p>
            <p>Recipient payout remains ETB bank rail in MVP.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-2 lg:hidden">
          <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
          <p className="text-muted-foreground">Sign in to continue with your latest transfer setup.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Need an account?{' '}
          <Link href={`/signup?next=${encodeURIComponent(nextPath)}` as Route} className="text-primary hover:underline">
            Create one now
          </Link>
        </p>
        <LoginForm prefillEmail={email} nextPath={nextPath} />
      </section>
    </div>
  );
}
