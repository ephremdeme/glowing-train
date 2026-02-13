'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { normalizeNextPath, readApiMessage, startGoogleOAuth } from '@/lib/client-api';
import type { LandingEstimateInput, LandingEstimateResult, QuoteSummary } from '@/lib/contracts';
import { patchFlowDraft } from '@/lib/flow-state';
import { readAccessToken } from '@/lib/session';

const USDC_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDC_ETB_RATE ?? 140);
const USDT_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDT_ETB_RATE ?? 140);
const FEE_USD = Number(process.env.NEXT_PUBLIC_LANDING_FEE_USD ?? 1);

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

function estimateQuote(input: LandingEstimateInput): LandingEstimateResult {
  const rate = input.token === 'USDC' ? USDC_RATE : USDT_RATE;
  const netUsd = Math.max(input.sendAmountUsd - FEE_USD, 0);
  return {
    feeUsd: FEE_USD,
    netUsd,
    fxRateUsdToEtb: rate,
    recipientAmountEtb: Number((netUsd * rate).toFixed(2))
  };
}

export default function HomePage() {
  const router = useRouter();
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const [form, setForm] = useState<LandingEstimateInput>({
    chain: 'base',
    token: 'USDC',
    sendAmountUsd: 100
  });

  const estimate = useMemo(() => estimateQuote(form), [form]);

  useEffect(() => {
    setHasSession(Boolean(readAccessToken()));
  }, []);

  async function lockRealQuote(): Promise<void> {
    setMessage(null);

    if (form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000) {
      setMessage('Amount must be between $1 and $2,000.');
      return;
    }

    setQuoteBusy(true);
    try {
      const response = await fetch('/api/client/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chain: form.chain,
          token: form.token,
          sendAmountUsd: form.sendAmountUsd,
          feeUsd: estimate.feeUsd,
          fxRateUsdToEtb: estimate.fxRateUsdToEtb,
          expiresInSeconds: 300
        })
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | QuoteSummary
        | { error?: { message?: string } };

      if (!response.ok || !('quoteId' in payload)) {
        setMessage(readApiMessage(payload, 'Could not lock quote right now.'));
        return;
      }

      patchFlowDraft({ quote: payload, transfer: null });
      const authenticated = Boolean(readAccessToken());
      const nextPath = '/transfer';
      if (authenticated) {
        router.push(nextPath as Route);
      } else {
        const loginHint = normalizeNextPath(nextPath, '/transfer');
        router.push(`/signup?next=${encodeURIComponent(loginHint)}` as Route);
      }
    } finally {
      setQuoteBusy(false);
    }
  }

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
      <section className="overflow-hidden rounded-[2.2rem] border border-[#A2D6CF] bg-hero-grid p-8 shadow-panel md:p-12">
        <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
          <div className="grid gap-6">
            <Badge className="w-fit border-0 bg-white/80 text-slate-700">Crypto-funded, non-custodial remittance</Badge>
            <h1 className="text-balance text-4xl font-semibold leading-tight text-slate-900 md:text-6xl">
              Convert stablecoins to ETB payouts in minutes.
            </h1>
            <p className="max-w-2xl text-base text-slate-700 md:text-lg">
              Send USDC or USDT from your own wallet. Recipient gets ETB in a bank account. No custody. No key handling.
            </p>
            <p className="max-w-2xl text-sm italic text-slate-600">
              “Built to make cross-border support feel immediate, transparent, and safe.”
            </p>

            <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-600">
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
                  <Button asChild variant="outline" size="lg" className="border-[#8FBDB5] bg-white/60 text-slate-800 hover:bg-white">
                    <Link href={'/login?next=%2Fquote' as Route}>Sign in</Link>
                  </Button>
                  <Button variant="outline" size="lg" onClick={continueWithGoogle} disabled={googleBusy}>
                    {googleBusy ? 'Connecting...' : 'Continue with Google'}
                  </Button>
                </>
              )}
            </div>
          </div>

          <Card className="border-white/70 bg-white/80 shadow-glow">
            <CardHeader>
              <CardTitle className="text-xl">Quote your transfer</CardTitle>
              <CardDescription>Indicative estimate now. Lock a real quote when ready.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Token</span>
                  <select
                    className="h-11 rounded-2xl border border-input bg-background px-4 text-sm"
                    value={form.token}
                    onChange={(event) => setForm((prev) => ({ ...prev, token: event.target.value as 'USDC' | 'USDT' }))}
                  >
                    <option value="USDC">USDC</option>
                    <option value="USDT">USDT</option>
                  </select>
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-muted-foreground">Chain</span>
                  <select
                    className="h-11 rounded-2xl border border-input bg-background px-4 text-sm"
                    value={form.chain}
                    onChange={(event) => setForm((prev) => ({ ...prev, chain: event.target.value as 'base' | 'solana' }))}
                  >
                    <option value="base">Base</option>
                    <option value="solana">Solana</option>
                  </select>
                </label>
              </div>

              <label className="grid gap-1 text-sm">
                <span className="text-muted-foreground">You send (USD)</span>
                <input
                  className="h-11 rounded-2xl border border-input bg-background px-4 text-sm"
                  type="number"
                  min={1}
                  max={2000}
                  step={0.01}
                  value={form.sendAmountUsd}
                  onChange={(event) => setForm((prev) => ({ ...prev, sendAmountUsd: Number(event.target.value) || 0 }))}
                />
              </label>

              <div className="grid gap-2 rounded-2xl border border-border/70 bg-muted/35 p-4 text-sm">
                <p>
                  <strong>Estimated recipient gets:</strong> {currencyEtb(estimate.recipientAmountEtb)}
                </p>
                <p>
                  <strong>Indicative rate:</strong> 1 USD = {estimate.fxRateUsdToEtb.toFixed(2)} ETB
                </p>
                <p>
                  <strong>Fee:</strong> {currencyUsd(estimate.feeUsd)}
                </p>
                <p className="text-xs text-muted-foreground">Final rate and amount are confirmed once quote is locked.</p>
              </div>

              <Button onClick={lockRealQuote} disabled={quoteBusy || form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000}>
                {quoteBusy ? 'Locking quote...' : 'Lock real quote'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {message ? (
        <Alert>
          <AlertTitle>Update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              You fund from your wallet
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <svg viewBox="0 0 320 120" className="h-24 w-full rounded-xl border border-border/60 bg-background/70 p-2" aria-hidden>
              <rect x="10" y="30" width="110" height="56" rx="10" fill="#dff4ef" stroke="#8ac8bb" />
              <rect x="200" y="30" width="110" height="56" rx="10" fill="#eef7fb" stroke="#8cbfdb" />
              <path d="M128 58h62" stroke="#2f7f9f" strokeWidth="4" strokeLinecap="round" />
              <path d="M176 48l14 10-14 10" fill="none" stroke="#2f7f9f" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <text x="65" y="62" textAnchor="middle" fontSize="12" fill="#24595a">Your Wallet</text>
              <text x="255" y="62" textAnchor="middle" fontSize="12" fill="#25506a">Deposit Address</text>
            </svg>
            <p>Non-custodial by design. You approve and send funds directly from your wallet.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              Recipient receives ETB bank payout
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm text-muted-foreground">
            <svg viewBox="0 0 320 120" className="h-24 w-full rounded-xl border border-border/60 bg-background/70 p-2" aria-hidden>
              <rect x="10" y="32" width="126" height="52" rx="10" fill="#fff3e5" stroke="#e4b27c" />
              <rect x="186" y="20" width="124" height="76" rx="10" fill="#e9f6ee" stroke="#8dc9a0" />
              <path d="M142 58h36" stroke="#4c8a53" strokeWidth="4" strokeLinecap="round" />
              <path d="M168 48l10 10-10 10" fill="none" stroke="#4c8a53" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
              <text x="73" y="62" textAnchor="middle" fontSize="12" fill="#7a4a1f">Offshore Settlement</text>
              <text x="248" y="62" textAnchor="middle" fontSize="12" fill="#2d6f42">ETB Bank Payout</text>
            </svg>
            <p>Ethiopia-side payout remains crypto-free and lands through bank rails in ETB.</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Compliance built in
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sender and receiver KYC checks are enforced before transfers can be created.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Supported networks
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">USDC and USDT on Base and Solana for funding.</CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Landmark className="h-4 w-4 text-primary" />
              Fast payout target
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Target payout SLA is about 10 minutes after confirmation.</CardContent>
        </Card>
      </section>
    </div>
  );
}
