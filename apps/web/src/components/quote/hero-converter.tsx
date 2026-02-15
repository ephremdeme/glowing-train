'use client';

import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { readApiMessage } from '@/lib/client-api';
import type { LandingEstimateInput, LandingEstimateResult, QuoteSummary, QuoteWidgetVisualState } from '@/lib/contracts';
import { patchFlowDraft } from '@/lib/flow-state';
import { readAccessToken } from '@/lib/session';

const USDC_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDC_ETB_RATE ?? 140);
const USDT_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDT_ETB_RATE ?? 140);
const FEE_USD = Number(process.env.NEXT_PUBLIC_LANDING_FEE_USD ?? 1);

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
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

interface HeroConverterProps {
  hasSession: boolean;
  onMessage: (message: string | null) => void;
}

export function HeroConverter({ hasSession, onMessage }: HeroConverterProps) {
  const router = useRouter();
  const [state, setState] = useState<QuoteWidgetVisualState>({
    busy: false,
    highlightedField: null
  });
  const [form, setForm] = useState<LandingEstimateInput>({
    chain: 'base',
    token: 'USDC',
    sendAmountUsd: 100
  });

  const estimate = useMemo(() => estimateQuote(form), [form]);

  async function lockRealQuote(): Promise<void> {
    onMessage(null);

    if (form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000) {
      onMessage('Amount must be between $1 and $2,000.');
      return;
    }

    setState((prev) => ({ ...prev, busy: true }));
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
        onMessage(readApiMessage(payload, 'Could not lock quote right now.'));
        return;
      }

      patchFlowDraft({ quote: payload, transfer: null });
      const authenticated = hasSession || Boolean(readAccessToken());
      if (authenticated) {
        router.push('/transfer' as Route);
      } else {
        router.push('/signup?next=%2Ftransfer' as Route);
      }
    } finally {
      setState((prev) => ({ ...prev, busy: false }));
    }
  }

  return (
    <div className="neon-surface animate-fade-up rounded-[2rem] p-6 md:p-7">
      <div className="grid gap-5">
        <div className="grid gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Quote your transfer</p>
          <p className="text-sm text-muted-foreground">Indicative now, lock real quote instantly.</p>
        </div>

        <div className="grid gap-3 rounded-3xl border border-primary/25 bg-[#0c153a] p-4">
          <label className="grid gap-2" htmlFor="landingSendUsd">
            <span className="text-xs uppercase tracking-[0.16em] text-muted-foreground">You pay</span>
            <div
              className={`rounded-2xl border bg-[#101d48] p-3 transition ${
                state.highlightedField === 'send' ? 'border-primary/70 shadow-glow' : 'border-border/80'
              }`}
            >
              <input
                id="landingSendUsd"
                aria-label="You send (USD)"
                className="w-full bg-transparent text-3xl font-semibold text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                type="number"
                min={1}
                max={2000}
                step={0.01}
                value={form.sendAmountUsd}
                onFocus={() => setState((prev) => ({ ...prev, highlightedField: 'send' }))}
                onBlur={() => setState((prev) => ({ ...prev, highlightedField: null }))}
                onChange={(event) => setForm((prev) => ({ ...prev, sendAmountUsd: Number(event.target.value) || 0 }))}
              />
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, token: 'USDC' }))}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    form.token === 'USDC' ? 'bg-primary/25 text-primary' : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  USDC
                </button>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, token: 'USDT' }))}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                    form.token === 'USDT' ? 'bg-primary/25 text-primary' : 'bg-muted/60 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  USDT
                </button>
              </div>
            </div>
          </label>

          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-accent/35 bg-accent/10 px-4 py-2 text-sm font-semibold text-accent animate-pulse-glow">
            <ArrowRightLeft className="h-4 w-4" />
            1 USD = {estimate.fxRateUsdToEtb.toFixed(2)} ETB
          </div>

          <div
            className={`rounded-2xl border bg-[#101d48] p-3 transition ${
              state.highlightedField === 'receive' ? 'border-primary/70 shadow-glow' : 'border-border/80'
            }`}
          >
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">You receive</p>
            <p className="mt-2 text-3xl font-semibold text-foreground">
              {estimate.recipientAmountEtb.toLocaleString('en-US', { maximumFractionDigits: 2 })}
            </p>
            <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">ETB bank payout</p>
          </div>

          <div className="grid gap-2 rounded-2xl border border-border/70 bg-[#0e173e] p-4 text-sm">
            <p className="font-semibold text-foreground">Total fee quote</p>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Processing fee</span>
              <span>{currencyUsd(estimate.feeUsd)}</span>
            </div>
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Network</span>
              <span>{form.chain.toUpperCase()}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={lockRealQuote}
            disabled={state.busy || form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000}
            className="min-w-[170px]"
          >
            {state.busy ? 'Locking quote...' : 'Lock real quote'}
          </Button>
          <Badge variant="outline" className="border-amber-300/35 bg-amber-300/12 text-amber-100">
            Cap: $2,000
          </Badge>
          <div className="inline-flex rounded-full border border-border/80 bg-muted/60 p-1">
            {(['base', 'solana'] as const).map((chain) => (
              <button
                type="button"
                key={chain}
                onClick={() => setForm((prev) => ({ ...prev, chain }))}
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                  form.chain === chain ? 'bg-primary/25 text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {chain}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
