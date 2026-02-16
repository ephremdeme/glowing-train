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
    <div className="rounded-2xl border border-border/50 bg-white p-6 shadow-lg sm:p-8">
      <h3 className="mb-5 text-xl font-semibold text-foreground">Create quote</h3>

      <form className="grid gap-5" onSubmit={onSubmit}>
        {/* ── Network toggle ── */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Network
          </span>
          <div className="flex rounded-xl border border-border/60 bg-slate-50/60 p-0.5">
            {(['base', 'solana'] as const).map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setForm((prev) => ({ ...prev, chain: c }))}
                className={`rounded-lg px-3.5 py-2 text-xs font-semibold capitalize transition-all ${
                  form.chain === c
                    ? 'bg-white text-foreground shadow-sm'
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
          <label htmlFor="sendAmountUsd" className="mb-2.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            You pay
          </label>
          <div className="rounded-xl border border-border/60 bg-slate-50/60 p-4 transition-colors focus-within:border-primary/30 focus-within:bg-white">
            <div className="flex items-center justify-between gap-3">
              <input
                id="sendAmountUsd"
                type="number"
                className="w-full min-w-0 bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                min={1}
                max={2000}
                step={0.01}
                value={form.sendAmountUsd}
                onChange={(event) => handleUsdChange(Number(event.target.value))}
                placeholder="100.00"
              />
              {/* Currency dropdown with icon */}
              <div className="relative shrink-0">
                {form.token === 'USDC' ? (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full text-blue-500 pointer-events-none">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fillOpacity="0.2"/>
                      <path d="M12.83 15.93H11.17V15H10.5C9.67 15 9 14.33 9 13.5V10.5C9 9.67 9.67 9 10.5 9H13V8H9V6.07H10.67V5H13.33V5.93H14C14.83 5.93 15.5 6.6 15.5 7.43V10.43C15.5 11.27 14.83 11.93 14 11.93H11.5V13H15.5V15.93H12.83V15.93ZM10.5 11.93H13.5V10H10.5V11.93ZM11 7V9H14V7.43C14 7.2 13.8 7 13.57 7H11Z" />
                    </svg>
                  </div>
                ) : (
                  <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full text-emerald-500 pointer-events-none">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM12 20C7.59 20 4 16.41 4 12C4 7.59 7.59 4 12 4C16.41 4 20 7.59 20 12C20 16.41 16.41 20 12 20Z" fillOpacity="0.2"/>
                      <path d="M10.5 7H14.5V17H10.5V7ZM7 7H18V5H7V7Z" transform="translate(0, 1) scale(0.9) translate(1,0)" />
                    </svg>
                  </div>
                )}
                <select
                  aria-label="Select currency"
                  className="h-10 shrink-0 appearance-none rounded-full border border-border/60 bg-white pl-10 pr-8 text-sm font-semibold text-foreground shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                  value={form.token}
                  onChange={(e) => setForm((prev) => ({ ...prev, token: e.target.value as 'USDC' | 'USDT' }))}
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
                >
                  <option value="USDC">USDC</option>
                  <option value="USDT">USDT</option>
                </select>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">USD · Max $2,000 per transfer</p>
          </div>
        </div>

        {/* Rate badge */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-1.5 shadow-sm">
            <ArrowDownUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">1 USD = {form.fxRateUsdToEtb.toFixed(2)} ETB</span>
          </div>
        </div>

        {/* ── THEY RECEIVE ── */}
        <div>
          <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            They receive
          </span>
          <div className="rounded-xl border border-border/60 bg-slate-50/60 p-4 transition-colors focus-within:border-primary/30 focus-within:bg-white">
            <div className="flex items-center justify-between gap-3">
              <input
                type="number"
                className="w-full min-w-0 bg-transparent text-2xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                min={0}
                step={1}
                value={Math.round(preview.recipientAmountEtb)}
                onChange={(event) => handleEtbChange(Number(event.target.value) || 0)}
                placeholder="13,860"
              />
              <div className="flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-2 shadow-sm">
                <div className="relative h-5 w-5 overflow-hidden rounded-full border border-border/20">
                  <svg viewBox="0 0 1200 600" className="h-full w-full object-cover">
                    <rect width="1200" height="200" fill="#078930"/>
                    <rect y="200" width="1200" height="200" fill="#FCDD09"/>
                    <rect y="400" width="1200" height="200" fill="#DA121A"/>
                    <circle cx="600" cy="300" r="200" fill="#0F47AF"/>
                    <path d="M600 300L650 450L500 350H700L550 450L600 300Z" fill="#FCDD09" transform="scale(0.8) translate(150, 50)" opacity="0.8"/>
                  </svg>
                </div>
                <span className="text-sm font-semibold text-foreground">ETB</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">ETB · Bank payout</p>
          </div>
        </div>

        {/* Payment method */}
        <div>
          <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Payment method
          </span>
          <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-slate-50/60 px-4 py-3">
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
        <div className="rounded-xl border border-border/60 bg-slate-50/40 px-4 py-3">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total fee quote</p>
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
