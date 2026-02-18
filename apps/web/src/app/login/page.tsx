'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LoginForm } from '@/components/auth/login-form';
import { readAccessToken } from '@/lib/session';
import { Shield, Zap, Lock } from 'lucide-react';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPageContent />
    </Suspense>
  );
}

function LoginPageContent() {
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
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-12 sm:px-6 lg:px-8 bg-slate-50">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href={'/' as Route} className="flex justify-center mb-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-sm font-bold text-white shadow-lg shadow-primary/20">
              CP
            </span>
            <span className="text-xl font-bold text-foreground tracking-tight">CryptoPay</span>
          </div>
        </Link>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-foreground">
          Welcome back
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Sign in to continue with your transfer.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]">
        <div className="bg-white px-6 py-12 shadow-sm ring-1 ring-gray-900/5 sm:rounded-2xl sm:px-10">
          <LoginForm prefillEmail={email} nextPath={nextPath} />

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href={`/signup?next=${encodeURIComponent(nextPath)}` as Route} className="font-semibold text-primary hover:text-primary/80 hover:underline transition-colors">
              Create one
            </Link>
          </p>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground/60">
           © {new Date().getFullYear()} CryptoPay. Secure & Compliant.
        </p>
      </div>
    </div>
  );
}
