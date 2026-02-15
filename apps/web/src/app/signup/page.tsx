'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { SignupForm } from '@/components/auth/signup-form';
import { readAccessToken } from '@/lib/session';

export default function SignupPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
          <div className="inline-flex w-fit items-center gap-2 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-xs uppercase tracking-[0.15em] text-accent">
            <ShieldCheck className="h-3.5 w-3.5" />
            Sender Onboarding
          </div>
          <h1 className="text-4xl font-semibold">Create account</h1>
          <p className="text-sm text-muted-foreground">
            Set up your sender profile and continue to a locked quote. If you use Google, you do not need a separate login step.
          </p>
          <div className="grid gap-3 text-sm text-muted-foreground">
            <p>KYC checks are enforced before transfer creation.</p>
            <p>Crypto stays offshore and non-custodial.</p>
            <p>Recipient payout remains ETB bank transfer.</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <div className="grid gap-2 lg:hidden">
          <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
          <p className="text-muted-foreground">Create an account with email or continue directly with Google.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Already registered?{' '}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}` as Route} className="text-primary hover:underline">
            Go to login
          </Link>
        </p>
        <SignupForm nextPath={nextPath} />
      </section>
    </div>
  );
}
