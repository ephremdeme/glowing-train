'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, ExternalLink, ShieldAlert } from 'lucide-react';
import { BasePayPanel } from '@/components/transfer/base-pay-panel';
import { PaymentMethodTabs } from '@/components/transfer/payment-method-tabs';
import { QrDeposit } from '@/components/transfer/qr-deposit';
import { SolanaPayPanel } from '@/components/transfer/solana-pay-panel';
import { CopyRow } from '@/components/ui/copy-row';
import { CountdownTimer } from '@/components/ui/countdown-timer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { currencyEtb } from '@/lib/format';
import { getWalletDeepLinkPresets } from '@/lib/wallet-deeplinks';
import { walletMode } from '@/lib/wallet/evm';
import type { TransferSummary } from '@/lib/contracts';

interface DepositInstructionsProps {
  transfer: TransferSummary;
}

export function DepositInstructions({ transfer }: DepositInstructionsProps) {
  const { quote } = transfer;
  const walletPresets =
    quote.chain === 'base'
      ? getWalletDeepLinkPresets({
        chain: quote.chain,
        token: quote.token,
        to: transfer.depositAddress,
        amountUsd: quote.sendAmountUsd
      })
      : [];

  const isMock = walletMode() === 'mock';

  return (
    <Card className="overflow-hidden border-primary/20">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-xl">Deposit instructions</CardTitle>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            {quote.chain.toUpperCase()}
          </Badge>
          <Badge variant="outline" className="border-secondary/30 bg-secondary/10 text-secondary">
            {quote.token}
          </Badge>
        </div>
        <CardDescription>
          {quote.chain === 'base'
            ? 'Send the exact amount to the deposit address below, or pay directly from your connected wallet.'
            : 'Use your Solana wallet to pay for this transfer. We will confirm the payment automatically.'}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-5">
        {/* Amount */}
        <div className="grid gap-1.5 rounded-2xl border border-accent/25 bg-accent/5 p-5">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Send amount</p>
          <p className="text-3xl font-bold text-accent">
            {quote.sendAmountUsd} {quote.token}
          </p>
          <p className="text-sm text-muted-foreground">
            Recipient gets ≈ {currencyEtb(quote.recipientAmountEtb)}
          </p>
        </div>

        {/* Deposit address */}
        <CopyRow label={quote.chain === 'base' ? 'Deposit address' : 'Treasury token account'} value={transfer.depositAddress} />
        <p className="text-xs text-muted-foreground">
          {quote.chain === 'base'
            ? 'This unique deposit address was generated for this transfer.'
            : 'This is the collector treasury account used by the Solana payment flow for this transfer.'}
        </p>

        {/* Network + token */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyRow label="Network" value={quote.chain} />
          <CopyRow label="Token" value={quote.token} />
        </div>

        {/* Expiry countdown */}
        <CountdownTimer expiresAt={quote.expiresAt} />

        {/* Payment methods — tabbed for mobile */}
        <PaymentMethodTabs>
          {{
            qr: (
              <QrDeposit
                chain={quote.chain}
                depositAddress={transfer.depositAddress}
                token={quote.token}
                amountUsd={quote.sendAmountUsd}
              />
            ),
            wallet: (
              <div className="grid gap-3">
                {quote.chain === 'solana' && !isMock ? <SolanaPayPanel transfer={transfer} /> : null}
                {quote.chain === 'base' && !isMock ? <BasePayPanel transfer={transfer} /> : null}
                {isMock ? <p className="text-sm text-muted-foreground">Wallet payments disabled in mock mode.</p> : null}
              </div>
            ),
            manual: (
              <div className="grid gap-3">
                <CopyRow label={quote.chain === 'base' ? 'Deposit address' : 'Treasury token account'} value={transfer.depositAddress} />
                <p className="text-xs text-muted-foreground">
                  Copy the address above and paste it in your wallet app to send {quote.token} on {quote.chain.toUpperCase()}.
                </p>
                <div className="flex flex-wrap gap-2">
                  {walletPresets.map((preset) => (
                    <Button asChild variant="outline" size="sm" key={preset.id}>
                      <Link href={preset.href as Route} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="mr-2 h-3.5 w-3.5" />
                        {preset.label}
                      </Link>
                    </Button>
                  ))}
                </div>
              </div>
            ),
          }}
        </PaymentMethodTabs>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {transfer.transferId ? (
            <Button asChild>
              <Link href={`/transfers/${transfer.transferId}` as Route}>
                Track transfer status
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
