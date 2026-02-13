'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { SignupForm } from '@/components/auth/signup-form';
import { readAccessToken } from '@/lib/session';

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    if (readAccessToken()) {
      router.replace('/quote' as Route);
    }
  }, [router]);

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Create account</h1>
        <p className="text-muted-foreground">Register as a sender, then sign in to continue the remittance flow.</p>
        <p className="text-sm text-muted-foreground">
          Already registered?{' '}
          <Link href={'/login' as Route} className="text-primary hover:underline">
            Go to login
          </Link>
        </p>
      </div>
      <SignupForm />
    </div>
  );
}
