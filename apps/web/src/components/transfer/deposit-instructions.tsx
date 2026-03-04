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

/* ── Chain icon SVGs (inline to avoid extra asset dependencies) ── */

function SolanaIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 397.7 311.7" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <linearGradient id="sol-a" x1="360.879" y1="351.455" x2="141.213" y2="-69.294" gradientUnits="userSpaceOnUse" gradientTransform="matrix(1 0 0 -1 0 314)">
        <stop offset="0" stopColor="#00FFA3" />
        <stop offset="1" stopColor="#DC1FFF" />
      </linearGradient>
      <path d="m64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" fill="url(#sol-a)" />
      <path d="m64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1z" fill="url(#sol-a)" />
      <path d="m333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1z" fill="url(#sol-a)" />
    </svg>
  );
}

function BaseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 111 111" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="55.5" cy="55.5" r="55.5" fill="#0052FF" />
      <path d="M55.4 93.1c20.8 0 37.7-16.8 37.7-37.6 0-20.8-16.9-37.6-37.7-37.6-19.5 0-35.6 14.8-37.5 33.8h49.7v7.5H17.9c2 19.1 18 33.9 37.5 33.9Z" fill="white" />
    </svg>
  );
}

function ChainBadge({ chain }: { chain: string }) {
  const isBase = chain === 'base';
  return (
    <Badge variant="outline" className={`gap-1.5 ${isBase ? 'border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400'}`}>
      {isBase
        ? <BaseIcon className="h-3.5 w-3.5" />
        : <SolanaIcon className="h-3.5 w-3.5" />
      }
      {chain.toUpperCase()}
    </Badge>
  );
}

/* ── Component ── */

interface DepositInstructionsProps {
  transfer: TransferSummary;
  onConfirmed?: () => void;
}

export function DepositInstructions({ transfer, onConfirmed }: DepositInstructionsProps) {
  const { quote } = transfer;
  const isSolanaLegacyRoute = quote.chain === 'solana' && transfer.routeKind === 'solana_program_pay';
  const depositLabel = quote.chain === 'solana' && isSolanaLegacyRoute ? 'Treasury token account' : 'Deposit address';
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
          <ChainBadge chain={quote.chain} />
          <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            {quote.token}
          </Badge>
        </div>
        <CardDescription>
          {quote.chain === 'base'
            ? 'Send the exact amount to the deposit address below, or pay directly from your connected wallet.'
            : isSolanaLegacyRoute
              ? 'Pay from your connected Solana wallet (legacy program-pay) or copy the token account and fund from any wallet.'
              : 'Pay from your Solana wallet directly to this unique transfer address, or copy the address and fund from any wallet.'}
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
        <CopyRow label={depositLabel} value={transfer.depositAddress} />
        <p className="text-xs text-muted-foreground">
          {quote.chain === 'base'
            ? 'This unique deposit address was generated for this transfer.'
            : isSolanaLegacyRoute
              ? 'This is the Solana treasury token account for legacy program-pay routes.'
              : 'This Solana token account is unique to this transfer route.'}
        </p>

        {/* Network + token */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyRow label="Network" value={quote.chain} />
          <CopyRow label="Token" value={quote.token} />
        </div>

        {/* Expiry countdown */}
        <CountdownTimer expiresAt={quote.expiresAt} />

        {/* Safety alert */}
        <Alert className="border-secondary/25 bg-secondary/5">
          <ShieldAlert className="h-4 w-4 text-secondary" />
          <AlertTitle className="text-secondary">Safety check</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Only send <strong>{quote.token}</strong> on the <strong>{quote.chain}</strong> network.
            Sending the wrong token or using the wrong chain may result in lost funds.
          </AlertDescription>
        </Alert>

        {/* Payment methods — tabbed for mobile */}
        <PaymentMethodTabs defaultTab={isSolanaLegacyRoute ? 'wallet' : 'address'}>
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
                {quote.chain === 'solana' && !isMock ? <SolanaPayPanel transfer={transfer} {...(onConfirmed ? { onConfirmed } : {})} /> : null}
                {quote.chain === 'base' && !isMock ? <BasePayPanel transfer={transfer} {...(onConfirmed ? { onConfirmed } : {})} /> : null}
                {isMock ? <p className="text-sm text-muted-foreground">Wallet payments disabled in mock mode.</p> : null}
              </div>
            ),
            address: (
              <div className="grid gap-3">
                <CopyRow label={depositLabel} value={transfer.depositAddress} />
                <Alert className="border-primary/20 bg-primary/5">
                  <AlertTitle className="text-primary">Address funding enabled</AlertTitle>
                  <AlertDescription className="text-xs text-muted-foreground">
                    {isSolanaLegacyRoute
                      ? 'For this legacy Solana route, use Wallet pay for deterministic confirmation.'
                      : 'Send the exact amount and keep this page open. Status updates automatically after chain confirmation.'}
                  </AlertDescription>
                </Alert>
                <p className="text-xs text-muted-foreground">
                  {quote.chain === 'solana'
                    ? isSolanaLegacyRoute
                      ? `Legacy Solana route: wallet pay uses on-chain reference ${transfer.transferId}. Address-only funding may not auto-link on legacy routes.`
                      : `Unique Solana route: copy the address above and send exactly ${quote.sendAmountUsd} ${quote.token}.`
                    : `Copy the address above and send ${quote.sendAmountUsd} ${quote.token} on ${quote.chain.toUpperCase()}.`}
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

        {/* Sticky actions bar — stays visible on mobile scroll */}
        <div className="sticky bottom-0 -mx-6 -mb-6 flex flex-wrap gap-2 border-t border-border/40 bg-background/95 px-6 py-4 backdrop-blur-sm sm:static sm:mx-0 sm:mb-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0 sm:backdrop-blur-0">
          {transfer.transferId ? (
            <Button asChild className="flex-1 sm:flex-initial">
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
