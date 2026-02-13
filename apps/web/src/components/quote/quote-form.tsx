'use client';

import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { DollarSign } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { readApiMessage } from '@/lib/client-api';
import type { QuoteSummary } from '@/lib/contracts';

interface QuoteFormProps {
  token: string;
  initialQuote?: QuoteSummary | null;
  onQuoteCreated: (quote: QuoteSummary) => void;
  disabled?: boolean;
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

export function QuoteForm({ token, initialQuote, onQuoteCreated, disabled }: QuoteFormProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
      recipientAmountEtb,
      netUsd: form.sendAmountUsd - form.feeUsd
    };
  }, [form]);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
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
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Create quote</CardTitle>
        <CardDescription>Lock chain/token route and payout estimate before transfer.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="chain">Chain</Label>
              <select
                id="chain"
                className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm"
                value={form.chain}
                onChange={(event) => setForm((prev) => ({ ...prev, chain: event.target.value as 'base' | 'solana' }))}
              >
                <option value="base">Base</option>
                <option value="solana">Solana</option>
              </select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="token">Token</Label>
              <select
                id="token"
                className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm"
                value={form.token}
                onChange={(event) => setForm((prev) => ({ ...prev, token: event.target.value as 'USDC' | 'USDT' }))}
              >
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="sendAmountUsd">Send amount USD</Label>
              <Input
                id="sendAmountUsd"
                type="number"
                min={1}
                max={2000}
                step={0.01}
                value={form.sendAmountUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, sendAmountUsd: Number(event.target.value) }))}
              />
              <p className="text-xs text-muted-foreground">MVP cap is $2,000 per transfer.</p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="feeUsd">Fee USD</Label>
              <Input
                id="feeUsd"
                type="number"
                min={0}
                step={0.01}
                value={form.feeUsd}
                onChange={(event) => setForm((prev) => ({ ...prev, feeUsd: Number(event.target.value) }))}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="fxRateUsdToEtb">FX rate USD to ETB</Label>
            <Input
              id="fxRateUsdToEtb"
              type="number"
              min={1}
              step={0.0001}
              value={form.fxRateUsdToEtb}
              onChange={(event) => setForm((prev) => ({ ...prev, fxRateUsdToEtb: Number(event.target.value) }))}
            />
          </div>

          <Button type="submit" disabled={busy || disabled || form.sendAmountUsd <= 0 || form.sendAmountUsd > 2000}>
            {busy ? 'Locking quote...' : 'Lock quote'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="grid gap-2 text-sm text-muted-foreground">
        <p className="inline-flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" />
          Net send USD: <strong className="text-foreground">{preview.netUsd.toFixed(2)}</strong>
        </p>
        <p>
          Estimated recipient amount: <strong className="text-foreground">{currencyEtb(preview.recipientAmountEtb)}</strong>
        </p>
        {message ? (
          <Alert>
            <AlertTitle>Quote update</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardFooter>
    </Card>
  );
}
