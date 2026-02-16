'use client';

import type { Route } from 'next';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownUp, Building2, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readApiMessage } from '@/lib/client-api';
import type { LandingEstimateInput, LandingEstimateResult, QuoteSummary, QuoteWidgetVisualState } from '@/lib/contracts';
import { patchFlowDraft } from '@/lib/flow-state';
import { readAccessToken } from '@/lib/session';

const USDC_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDC_ETB_RATE ?? 140);
const USDT_RATE = Number(process.env.NEXT_PUBLIC_LANDING_USDT_ETB_RATE ?? 140);
const FEE_USD = Number(process.env.NEXT_PUBLIC_LANDING_FEE_USD ?? 1);

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

function NetworkToggle({
  chain,
  onChange
}: {
  chain: 'base' | 'solana';
  onChange: (chain: 'base' | 'solana') => void;
}) {
  return (
    <div className="flex rounded-xl border border-border/60 bg-slate-50/60 p-0.5">
      {(['base', 'solana'] as const).map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold capitalize transition-all ${
            chain === c
              ? 'bg-white text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
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
  const [editingField, setEditingField] = useState<'usd' | 'etb'>('usd');

  const estimate = useMemo(() => estimateQuote(form), [form]);

  function handleUsdChange(value: number) {
    setEditingField('usd');
    setForm((prev) => ({ ...prev, sendAmountUsd: value }));
  }

  function handleEtbChange(etbValue: number) {
    setEditingField('etb');
    const rate = form.token === 'USDC' ? USDC_RATE : USDT_RATE;
    const usdAmount = rate > 0 ? Number((etbValue / rate + FEE_USD).toFixed(2)) : 0;
    setForm((prev) => ({ ...prev, sendAmountUsd: Math.min(usdAmount, 2000) }));
  }

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
    <div className="rounded-2xl border border-border/50 bg-white p-6 shadow-lg sm:p-8">
      <div className="grid gap-5">
        {/* ── Top network toggle ── */}
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Network
          </span>
          <NetworkToggle
            chain={form.chain}
            onChange={(chain) => setForm((prev) => ({ ...prev, chain }))}
          />
        </div>

        {/* ── YOU PAY ── */}
        <div>
          <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            You pay
          </span>
            <div className="rounded-xl bg-slate-100 p-4 transition-colors focus-within:bg-slate-100 focus-within:ring-0 focus-within:outline-none focus-within:border-transparent focus-within:shadow-none">
              <div className="flex items-center justify-between gap-3">
                <input
                  id="landingSendUsd"
                  aria-label="You send (USD)"
                  className="w-full min-w-0 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 border-none shadow-none [&::-webkit-inner-spin-button]:appearance-none"
                  type="number"
                  min={1}
                  max={2000}
                  step={0.01}
                  value={editingField === 'usd' ? form.sendAmountUsd : form.sendAmountUsd || ''}
                  placeholder="100.00"
                  onFocus={() => setState((prev) => ({ ...prev, highlightedField: 'send' }))}
                  onBlur={() => setState((prev) => ({ ...prev, highlightedField: null }))}
                  onChange={(event) => handleUsdChange(Number(event.target.value) || 0)}
                />
                
                {/* Currency Pill Selector */}
                <div className="relative shrink-0">
                   <div className="flex items-center gap-2 rounded-full bg-slate-900 py-2 pl-2 pr-4 text-white shadow-md transition-transform hover:scale-105">
                      {form.token === 'USDC' ? (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500">
                          <span className="text-[10px] font-bold">$</span>
                        </div>
                      ) : (
                        <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500">
                          <span className="text-[10px] font-bold">T</span>
                        </div>
                      )}
                      <span className="text-sm font-bold">{form.token}</span>
                      <svg width="10" height="6" viewBox="0 0 10 6" fill="none" className="opacity-60">
                        <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
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
              <p className="mt-2 text-xs font-medium text-muted-foreground/60">USD · Max $2,000</p>
            </div>
          </div>

        {/* ── Rate badge ── */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ArrowDownUp className="h-3 w-3" />
            <span>1 USD = {estimate.fxRateUsdToEtb.toFixed(2)} ETB</span>
          </div>
        </div>

        {/* ── YOU RECEIVE ── */}
        <div>
          <span className="mb-1 block text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
            They receive
          </span>
          <div className="group rounded-3xl bg-slate-50 p-5 transition-colors focus-within:bg-slate-100">
            <div className="flex items-center justify-between gap-3">
              <input
                aria-label="They receive (ETB)"
                className="w-full min-w-0 bg-transparent text-4xl font-bold text-foreground placeholder:text-muted-foreground/30 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none"
                type="number"
                min={0}
                step={1}
                value={editingField === 'etb' ? estimate.recipientAmountEtb : estimate.recipientAmountEtb || ''}
                placeholder="13,860"
                onFocus={() => setState((prev) => ({ ...prev, highlightedField: 'receive' }))}
                onBlur={() => setState((prev) => ({ ...prev, highlightedField: null }))}
                onChange={(event) => handleEtbChange(Number(event.target.value) || 0)}
              />
              
              {/* ETB Pill Badge */}
              <div className="flex shrink-0 items-center gap-2 rounded-full bg-slate-200 py-2 pl-2 pr-4 text-slate-700 shadow-sm">
                 <div className="relative h-6 w-6 overflow-hidden rounded-full shadow-sm">
                  <svg viewBox="0 0 1200 600" className="h-full w-full object-cover">
                    <rect width="1200" height="200" fill="#078930"/>
                    <rect y="200" width="1200" height="200" fill="#FCDD09"/>
                    <rect y="400" width="1200" height="200" fill="#DA121A"/>
                    <circle cx="600" cy="300" r="200" fill="#0F47AF"/>
                    <path d="M600 300L650 450L500 350H700L550 450L600 300Z" fill="#FCDD09" transform="scale(0.8) translate(150, 50)" opacity="0.9"/> 
                  </svg>
                </div>
                <span className="text-sm font-bold">ETB</span>
              </div>
            </div>
            <p className="mt-2 text-xs font-medium text-muted-foreground/60">Ethiopian Birr · Direct Bank Deposit</p>
          </div>
        </div>

        {/* ── PAYMENT METHOD ── */}
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

        {/* ── FEE BREAKDOWN ── */}
        <div className="rounded-xl border border-border/60 bg-slate-50/40 px-4 py-3">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">Total fee quote</p>
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                Processing fees
                <Info className="h-3.5 w-3.5 text-muted-foreground/50" />
              </span>
              <span className="text-sm font-medium text-foreground">${estimate.feeUsd.toFixed(2)}</span>
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

        {/* ── Bottom Network + CTA ── */}
        <div className="flex items-center justify-between gap-3">
          <NetworkToggle
            chain={form.chain}
            onChange={(chain) => setForm((prev) => ({ ...prev, chain }))}
          />
          <Button
            onClick={lockRealQuote}
            disabled={state.busy || form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000}
            size="lg"
          >
            {state.busy ? 'Locking...' : 'Get quote'}
          </Button>
        </div>
      </div>
    </div>
  );
}
