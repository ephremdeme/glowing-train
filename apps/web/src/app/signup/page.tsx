'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
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
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
        <p className="text-muted-foreground">Create an account with email or continue directly with Google.</p>
        <p className="text-sm text-muted-foreground">
          Already registered?{' '}
          <Link href={`/login?next=${encodeURIComponent(nextPath)}` as Route} className="text-primary hover:underline">
            Go to login
          </Link>
        </p>
      </div>
      <SignupForm nextPath={nextPath} />
    </div>
  );
}
