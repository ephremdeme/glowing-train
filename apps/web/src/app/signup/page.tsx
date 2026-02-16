'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { SignupForm } from '@/components/auth/signup-form';
import { readAccessToken } from '@/lib/session';
import { Shield, Zap, Lock } from 'lucide-react';

export default function SignupPage() {
  return (
    <Suspense>
      <SignupPageContent />
    </Suspense>
  );
}

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get('next') ?? '/quote';

  useEffect(() => {
    if (readAccessToken()) {
      router.replace(nextPath as Route);
    }
  }, [nextPath, router]);

  return (
    <div className="-mx-4 -mt-8 flex min-h-[calc(100vh-4rem)] sm:-mx-6 lg:-mx-8">
      {/* Left branding panel */}
      <div className="hidden w-[45%] flex-shrink-0 bg-gradient-to-br from-primary via-indigo-600 to-indigo-700 p-12 lg:flex lg:flex-col lg:justify-between">
        <div>
          <Link href={'/' as Route} className="inline-flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/20 text-xs font-bold text-white backdrop-blur-sm">
              CP
            </span>
            <span className="text-base font-semibold text-white">CryptoPay</span>
          </Link>
        </div>

        <div className="space-y-8">
          <div>
            <h2 className="mb-3 text-3xl font-bold leading-tight text-white">
              Start sending money
              <br />
              <span className="text-indigo-200">home today.</span>
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-indigo-200">
              Join thousands who trust CryptoPay to send crypto and deliver Ethiopian Birr directly to bank accounts.
            </p>
          </div>

          <div className="grid gap-4">
            {[
              { icon: Shield, text: 'Non-custodial — your keys, your crypto' },
              { icon: Zap, text: '~10 minute bank payouts' },
              { icon: Lock, text: 'KYC verified & fully compliant' }
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-sm">
                    <Icon className="h-4 w-4 text-white" />
                  </div>
                  <span className="text-sm text-indigo-100">{item.text}</span>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-xs text-indigo-300">
          © {new Date().getFullYear()} CryptoPay. All rights reserved.
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 sm:px-12 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          {/* Mobile logo */}
          <div className="mb-8 lg:hidden">
            <Link href={'/' as Route} className="inline-flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
                CP
              </span>
              <span className="text-sm font-semibold text-foreground">CryptoPay</span>
            </Link>
          </div>

          <div className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Create your account
            </h1>
            <p className="mt-2 text-base text-muted-foreground">
              Set up your account to start sending money home.
            </p>
          </div>

          <SignupForm nextPath={nextPath} />

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href={`/login?next=${encodeURIComponent(nextPath)}` as Route} className="font-semibold text-primary hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
