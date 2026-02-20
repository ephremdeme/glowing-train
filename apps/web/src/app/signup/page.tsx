'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { SignupForm } from '@/components/auth/signup-form';
import { exchangeAccessToken, readAccessToken } from '@/lib/session';

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
    async function bootstrap(): Promise<void> {
      if (readAccessToken()) {
        router.replace(nextPath as Route);
        return;
      }

      try {
        await exchangeAccessToken();
        router.replace(nextPath as Route);
      } catch {
        // No active cookie session; stay on signup page.
      }
    }

    void bootstrap();
  }, [nextPath, router]);

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center py-12 sm:px-6 lg:px-8 relative">
      {/* Ambient glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute right-1/3 top-1/4 h-96 w-96 rounded-full bg-primary/[0.04] blur-[150px]" />
        <div className="absolute left-1/4 bottom-1/3 h-72 w-72 rounded-full bg-emerald-500/[0.03] blur-[120px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        className="relative sm:mx-auto sm:w-full sm:max-w-md"
      >
        <Link href={'/' as Route} className="flex justify-center mb-8 group">
          <div className="flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-sm font-bold text-white shadow-lg shadow-amber-500/20 transition-transform group-hover:scale-105">
              CP
            </span>
            <span className="text-xl font-bold text-foreground tracking-tight">CryptoPay</span>
          </div>
        </Link>
        <h2 className="mt-2 text-center text-2xl font-bold tracking-tight text-foreground">
          Create an account
        </h2>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Join thousands sending money home securely.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
        className="relative mt-8 sm:mx-auto sm:w-full sm:max-w-[400px]"
      >
        <div className="rounded-2xl border border-border/30 bg-card/50 px-6 py-10 shadow-card backdrop-blur-xl sm:px-10">
          <SignupForm nextPath={nextPath} />

          <p className="mt-8 text-center text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link
              href={`/login?next=${encodeURIComponent(nextPath)}` as Route}
              className="font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground/40">
          © {new Date().getFullYear()} CryptoPay. Secure & Compliant.
        </p>
      </motion.div>
    </div>
  );
}
