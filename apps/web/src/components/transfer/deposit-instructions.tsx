'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { Copy, ExternalLink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { TransferSummary } from '@/lib/contracts';
import { getWalletDeepLinkPresets } from '@/lib/wallet-deeplinks';

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export function DepositInstructions({ transfer, onMessage }: { transfer: TransferSummary; onMessage: (message: string) => void }) {
  const presets = getWalletDeepLinkPresets({
    chain: transfer.quote.chain,
    token: transfer.quote.token,
    to: transfer.depositAddress,
    amountUsd: transfer.quote.sendAmountUsd
  });

  async function copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      onMessage('Copied to clipboard.');
    } catch {
      onMessage('Clipboard copy failed.');
    }
  }

  return (
    <Card className="border-primary/35">
      <CardHeader>
        <CardTitle className="text-xl">Deposit instructions</CardTitle>
        <CardDescription>Send from your own wallet. No custodial key handling.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-2 rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{transfer.quote.chain.toUpperCase()}</Badge>
            <Badge variant="secondary">{transfer.quote.token}</Badge>
            <Badge variant="outline">{transfer.status}</Badge>
          </div>
          <p>
            <strong>Transfer:</strong> {transfer.transferId}
          </p>
          <p>
            <strong>Amount:</strong> {currencyUsd(transfer.quote.sendAmountUsd)}
          </p>
          <p>
            <strong>Deposit address:</strong> <span className="break-all">{transfer.depositAddress}</span>
          </p>
          <p>
            <strong>Quote expiry:</strong> {new Date(transfer.quote.expiresAt).toLocaleString()}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => copy(transfer.depositAddress)}>
            <Copy className="mr-2 h-4 w-4" />
            Copy address
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              copy(
                `Network: ${transfer.quote.chain}\nToken: ${transfer.quote.token}\nAddress: ${transfer.depositAddress}\nAmountUSD: ${transfer.quote.sendAmountUsd}`
              )
            }
          >
            <Copy className="mr-2 h-4 w-4" />
            Copy full details
          </Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {presets.map((preset) => (
            <Button asChild variant="secondary" key={preset.id}>
              <a href={preset.href} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {preset.label}
              </a>
            </Button>
          ))}
        </div>

        <Alert>
          <AlertTitle>Payout rail</AlertTitle>
          <AlertDescription>
            Ethiopia side payout is ETB via bank rail in MVP. Target payout SLA is about 10 minutes after funding confirmation.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href={`/transfers/${transfer.transferId}` as Route}>Track transfer status</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href={`/receipts/${transfer.transferId}` as Route}>Open printable receipt</Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
