'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { ArrowDownUp, Building2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readApiMessage } from '@/lib/client-api';
import type { QuoteSummary } from '@/lib/contracts';

interface QuoteFormProps {
  token: string;
  initialQuote?: QuoteSummary | null;
  onQuoteCreated: (quote: QuoteSummary) => void;
  disabled?: boolean;
  isAuthenticated?: boolean;
}

export function QuoteForm({ token, initialQuote, onQuoteCreated, disabled, isAuthenticated = true }: QuoteFormProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'usd' | 'etb'>('usd');
  const [form, setForm] = useState({
    chain: initialQuote?.chain ?? ('base' as 'base' | 'solana'),
    token: initialQuote?.token ?? ('USDC' as 'USDC' | 'USDT'),
    sendAmountUsd: initialQuote?.sendAmountUsd ?? 100,
    feeUsd: initialQuote?.feeUsd ?? 1,
    fxRateUsdToEtb: initialQuote?.fxRateUsdToEtb ?? 140,
    expiresInSeconds: 300
  });

  const preview = useMemo(() => {
    const recipientAmountEtb = (form.sendAmountUsd - form.feeUsd) * form.fxRateUsdToEtb;
    return {
      recipientAmountEtb: Math.max(recipientAmountEtb, 0),
      netUsd: form.sendAmountUsd - form.feeUsd
    };
  }, [form]);

  function handleUsdChange(value: number) {
    setEditingField('usd');
    setForm((prev) => ({ ...prev, sendAmountUsd: value }));
  }

  function handleEtbChange(etbValue: number) {
    setEditingField('etb');
    const rate = form.fxRateUsdToEtb;
    const usdAmount = rate > 0 ? Number((etbValue / rate + form.feeUsd).toFixed(2)) : 0;
    setForm((prev) => ({ ...prev, sendAmountUsd: Math.min(usdAmount, 2000) }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!isAuthenticated) {
      router.push('/login?next=/quote' as Route);
      return;
    }

    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/quotes', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(form)
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | QuoteSummary
        | { error?: { message?: string } };

      if (!response.ok || !('quoteId' in payload)) {
        setMessage(readApiMessage(payload, 'Could not create quote.'));
        return;
      }

      setMessage('Quote locked. Continue to transfer setup.');
      onQuoteCreated(payload);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border/50 bg-card p-6 shadow-lg sm:p-8">
      <h3 className="mb-5 text-xl font-semibold tracking-[-0.015em] text-foreground">Create quote</h3>

      <form className="grid gap-5" onSubmit={onSubmit}>
        {/* ── Network toggle ── */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Network
          </span>
          <div className="flex rounded-xl border border-border/60 bg-muted/60 p-0.5">
            {(['base', 'solana'] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((prev) => ({ ...prev, chain: c }))}
                className={`rounded-lg px-3.5 py-2 text-xs font-medium capitalize transition-all ${form.chain === c
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                  }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        {/* ── YOU PAY ── */}
        <div>
          <label htmlFor="sendAmountUsd" className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            You pay
          </label>
          <div className="rounded-xl bg-muted/50 p-4 transition-colors focus-within:bg-muted focus-within:ring-0 focus-within:outline-none focus-within:border-transparent focus-within:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <input
                id="sendAmountUsd"
                type="number"
                className="w-full min-w-0 border-none bg-transparent text-3xl font-semibold tracking-[-0.015em] text-foreground placeholder:text-muted-foreground/30 shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none"
                min={1}
                max={2000}
                step={0.01}
                value={form.sendAmountUsd || ''}
                onChange={(event) => handleUsdChange(Number(event.target.value))}
                placeholder="0"
              />

              {/* Currency Pill Selector */}
              <div className="relative shrink-0">
                <div className="flex items-center gap-2 rounded-full bg-foreground py-2 pl-2 pr-4 text-background shadow-md transition-transform hover:scale-105">
                  {form.token === 'USDC' ? (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500 text-white">
                      <span className="text-[10px] font-semibold">$</span>
                    </div>
                  ) : (
                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <span className="text-[10px] font-semibold">T</span>
                    </div>
                  )}
                  <span className="text-sm font-semibold">{form.token}</span>
                  <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="opacity-60">
                    <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <select
                  aria-label="Select currency"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  value={form.token}
                  onChange={(e) => setForm((prev) => ({ ...prev, token: e.target.value as 'USDC' | 'USDT' }))}
                >
                  <option value="USDC">USDC</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground/60">USD · Max $2,000 per transfer</p>
          </div>
        </div>

        {/* Rate badge */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
            <ArrowDownUp className="h-3 w-3" />
            <span>1 USD = {form.fxRateUsdToEtb.toFixed(2)} ETB</span>
          </div>
        </div>

        {/* ── THEY RECEIVE ── */}
        <div>
          <span className="mb-1 block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">
            They receive
          </span>
          <div className="group rounded-3xl bg-muted/80 p-5 transition-colors focus-within:bg-muted focus-within:ring-0 focus-within:outline-none focus-within:border-transparent focus-within:shadow-none">
            <div className="flex items-center justify-between gap-3">
              <input
                type="number"
                className="w-full min-w-0 border-none bg-transparent text-3xl font-semibold tracking-[-0.015em] text-foreground placeholder:text-muted-foreground/30 shadow-none focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-inner-spin-button]:appearance-none"
                min={0}
                step={1}
                value={Math.round(preview.recipientAmountEtb) || ''}
                onChange={(event) => handleEtbChange(Number(event.target.value))}
                placeholder="0"
              />

              {/* ETB Pill Badge */}
              <div className="flex shrink-0 items-center gap-2 rounded-full bg-background py-2 pl-2 pr-4 text-foreground shadow-sm">
                <div className="relative h-6 w-6 overflow-hidden rounded-full shadow-sm">
                  <svg viewBox="0 0 1200 600" className="h-full w-full object-cover">
                    <rect width="1200" height="200" fill="#078930" />
                    <rect y="200" width="1200" height="200" fill="#FCDD09" />
                    <rect y="400" width="1200" height="200" fill="#DA121A" />
                    <circle cx="600" cy="300" r="200" fill="#0F47AF" />
                    <path d="M600 300L650 450L500 350H700L550 450L600 300Z" fill="#FCDD09" transform="scale(0.8) translate(150, 50)" opacity="0.9" />
                  </svg>
                </div>
                <span className="text-sm font-semibold">ETB</span>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground/60">ETB · Bank payout</p>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <span className="mb-2.5 block text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
            Payment method
          </span>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-muted/40 px-4 py-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">Bank transfer</p>
              <p className="text-xs text-muted-foreground">Direct to Ethiopian bank account</p>
            </div>
          </div>
        </div>

        {/* Fee breakdown */}
        <div className="rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Total fee quote</p>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Processing fees
                <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
              </span>
              <span className="text-sm font-medium text-foreground">${form.feeUsd.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Estimated on-chain fees
                <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
              </span>
              <span className="text-sm font-medium text-foreground">$0.00</span>
            </div>
          </div>
        </div>

        <Button
          type="submit"
          size="lg"
          disabled={busy || disabled || form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000}
          className="mt-1"
        >
          {!isAuthenticated ? 'Sign in to lock quote' : busy ? 'Locking quote...' : 'Lock quote'}
        </Button>
      </form>

      {message ? (
        <Alert className="mt-5">
          <AlertTitle>Quote update</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
