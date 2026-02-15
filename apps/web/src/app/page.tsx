'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Landmark, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { EtbPayoutScene } from '@/components/illustrations/etb-payout-scene';
import { FundWalletScene } from '@/components/illustrations/fund-wallet-scene';
import { HeroConverter } from '@/components/quote/hero-converter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { startGoogleOAuth } from '@/lib/client-api';
import { readAccessToken } from '@/lib/session';

export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(readAccessToken()));
  }, []);

  async function continueWithGoogle(): Promise<void> {
    setMessage(null);
    setGoogleBusy(true);
    try {
      const result = await startGoogleOAuth('/quote');
      if (!result.ok) {
        setMessage(result.message);
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="grid gap-8">
      <section className="neon-section overflow-hidden rounded-[2rem] border border-primary/20 bg-hero-grid p-6 shadow-panel md:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.06fr_0.94fr] lg:items-start">
          <div className="grid gap-6">
            <Badge className="w-fit border-primary/40 bg-primary/15 text-primary">Crypto-funded, non-custodial remittance</Badge>
            <h1 className="max-w-3xl text-balance text-4xl font-semibold leading-tight text-foreground md:text-6xl">
              Convert stablecoins to ETB payouts in minutes.
            </h1>
            <p className="max-w-2xl text-base text-slate-100/85 md:text-lg">
              Support family with a faster transfer flow: you send from your own wallet, recipient gets ETB through bank payout rails.
            </p>
            <p className="max-w-2xl text-sm text-slate-200/70">
              Built for trust: no key custody, sender and receiver verification, and payout tracking from funding to delivery.
            </p>

            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-200/70">
              <span>Transfer cap: $2,000</span>
              <span>•</span>
              <span>Bank payout first</span>
              <span>•</span>
              <span>Telebirr behind feature flag</span>
            </div>

            <div className="flex flex-wrap gap-3">
              {hasSession ? (
                <Button asChild size="lg">
                  <Link href={'/quote' as Route}>
                    Continue
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              ) : (
                <>
                  <Button asChild size="lg">
                    <Link href={'/signup?next=%2Fquote' as Route}>
                      Create account
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="lg">
                    <Link href={'/login?next=%2Fquote' as Route}>Sign in</Link>
                  </Button>
                  <Button variant="outline" size="lg" onClick={continueWithGoogle} disabled={googleBusy}>
                    {googleBusy ? 'Connecting...' : 'Continue with Google'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <HeroConverter hasSession={hasSession} onMessage={setMessage} />
        </div>
      </section>

      {message ? (
        <Alert>
          <AlertTitle>Update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card className="lift-hover overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Wallet className="h-5 w-5 text-primary" />
              You fund from your wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <FundWalletScene className="h-auto w-full rounded-2xl border border-border/60 bg-[#0b1334] p-2" />
            <p className="text-sm text-muted-foreground">
              Keep full control of keys and signing. We only show the destination route and monitor funding confirmations offshore.
            </p>
          </CardContent>
        </Card>

        <Card className="lift-hover overflow-hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Landmark className="h-5 w-5 text-accent" />
              Recipient receives ETB
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <EtbPayoutScene className="h-auto w-full rounded-2xl border border-border/60 bg-[#0b1334] p-2" />
            <p className="text-sm text-muted-foreground">
              Ethiopia-side operations stay crypto-free. Payout executes through legal bank rails with a target of about 10 minutes after confirmation.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="lift-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Compliance first
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sender and receiver verification must pass before transfer creation.
          </CardContent>
        </Card>

        <Card className="lift-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-secondary" />
              Built for clarity
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            See quote terms, deposit instructions, and payout status in one clean flow.
          </CardContent>
        </Card>

        <Card className="lift-hover">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Supported routes
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">USDC/USDT on Base and Solana for funding, ETB bank payout for recipients.</CardContent>
        </Card>
      </section>

      {!hasSession ? (
        <section className="neon-surface neon-section flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] p-6">
          <div className="grid gap-2">
            <p className="text-lg font-semibold">Ready to test your first quote?</p>
            <p className="text-sm text-muted-foreground">Create an account or continue with Google and lock a real quote in seconds.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={'/signup?next=%2Fquote' as Route}>Start account setup</Link>
            </Button>
            <Button variant="outline" onClick={continueWithGoogle} disabled={googleBusy}>
              {googleBusy ? 'Connecting...' : 'Continue with Google'}
            </Button>
          </div>
        </section>
      ) : (
        <section className="neon-surface neon-section flex flex-wrap items-center justify-between gap-4 rounded-[1.75rem] p-6">
          <div className="grid gap-2">
            <p className="text-lg font-semibold">Your account is ready.</p>
            <p className="text-sm text-muted-foreground">Lock a quote and continue to transfer when you are ready.</p>
          </div>
          <Button onClick={() => router.push('/quote' as Route)}>Go to quote</Button>
        </section>
      )}
    </div>
  );
}
