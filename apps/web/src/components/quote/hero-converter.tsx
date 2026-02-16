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
          <div className="rounded-xl border border-border/60 bg-slate-50/60 p-4 transition-colors focus-within:border-primary/30 focus-within:bg-white">
            <div className="flex items-center justify-between gap-3">
              <input
                id="landingSendUsd"
                aria-label="You send (USD)"
                className="w-full min-w-0 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
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
              {/* Currency dropdown inline */}
              <select
                aria-label="Select currency"
                className="h-10 shrink-0 appearance-none rounded-full border border-border/60 bg-white px-4 pr-8 text-sm font-semibold text-foreground shadow-sm focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
                value={form.token}
                onChange={(e) => setForm((prev) => ({ ...prev, token: e.target.value as 'USDC' | 'USDT' }))}
                style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' fill='none' stroke='%236B7280' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center' }}
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">USD · Max $2,000</p>
          </div>
        </div>

        {/* ── Rate badge ── */}
        <div className="flex items-center justify-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-white px-4 py-1.5 shadow-sm">
            <ArrowDownUp className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-semibold text-foreground">
              1 USD = {estimate.fxRateUsdToEtb.toFixed(2)} ETB
            </span>
          </div>
        </div>

        {/* ── YOU RECEIVE ── */}
        <div>
          <span className="mb-2.5 block text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            You receive
          </span>
          <div className="rounded-xl border border-border/60 bg-slate-50/60 p-4 transition-colors focus-within:border-primary/30 focus-within:bg-white">
            <div className="flex items-center justify-between gap-3">
              <input
                aria-label="They receive (ETB)"
                className="w-full min-w-0 bg-transparent text-3xl font-bold text-foreground placeholder:text-muted-foreground/40 focus:outline-none"
                type="number"
                min={0}
                step={1}
                value={editingField === 'etb' ? estimate.recipientAmountEtb : estimate.recipientAmountEtb || ''}
                placeholder="13,860"
                onFocus={() => setState((prev) => ({ ...prev, highlightedField: 'receive' }))}
                onBlur={() => setState((prev) => ({ ...prev, highlightedField: null }))}
                onChange={(event) => handleEtbChange(Number(event.target.value) || 0)}
              />
              <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-white px-4 py-2 shadow-sm">
                <div className="flex h-5 w-5 items-center justify-center rounded-full bg-green-100 text-[9px] font-bold text-green-700">₿</div>
                <span className="text-sm font-semibold text-foreground">ETB</span>
              </div>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Ethiopian Birr · Bank payout</p>
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
