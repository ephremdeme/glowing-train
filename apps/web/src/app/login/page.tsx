'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground">Sign in to continue with your latest transfer setup.</p>
        <p className="text-sm text-muted-foreground">
          Need an account?{' '}
          <Link href={`/signup?next=${encodeURIComponent(nextPath)}` as Route} className="text-primary hover:underline">
            Create one now
          </Link>
        </p>
      </div>
      <LoginForm prefillEmail={email} nextPath={nextPath} />
    </div>
  );
}
