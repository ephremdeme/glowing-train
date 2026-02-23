'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import type { Route } from 'next';
import {
  ArrowRight,
  CheckCircle,
  Copy,
  ExternalLink,
  Loader2,
  ShieldAlert
} from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getMintConfig } from '@/lib/solana/remittance-config';
import { getWalletDeepLinkPresets } from '@/lib/wallet-deeplinks';
import {
  submitPayTransaction,
  type SubmitPayTransactionResult
} from '@/lib/solana/remittance-acceptor';
import type { QuoteSummary, TransferSummary } from '@/lib/contracts';
import { walletMode } from '@/lib/wallet/evm';

interface DepositInstructionsProps {
  transfer: TransferSummary;
  quote?: QuoteSummary;
}

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopyError(null);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyError('Copy failed');
      setCopied(false);
    }
  }

  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5">
        <code className="flex-1 truncate text-sm font-mono text-foreground">{value}</code>
        <button
          onClick={copy}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/15 hover:text-primary"
          aria-label={`Copy ${label}`}
        >
          {copied ? <CheckCircle className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {copyError ? <p className="text-xs text-muted-foreground">{copyError}</p> : null}
    </div>
  );
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

function SolanaPayPanel({ transfer }: { transfer: TransferSummary }) {
  const { quote } = transfer;
  const { connection } = useConnection();
  const wallet = useWallet();
  const [externalReference, setExternalReference] = useState(transfer.transferId);
  const [submitting, setSubmitting] = useState(false);
  const [solanaError, setSolanaError] = useState<string | null>(null);
  const [solanaResult, setSolanaResult] = useState<SubmitPayTransactionResult | null>(null);

  useEffect(() => {
    setExternalReference(transfer.transferId);
    setSolanaError(null);
    setSolanaResult(null);
  }, [transfer.transferId]);

  const mintConfigValidation = useMemo(() => {
    if (quote.chain !== 'solana') {
      return { valid: true, message: null as string | null };
    }

    try {
      getMintConfig(quote.token);
      return { valid: true, message: null as string | null };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Token config is invalid for this Solana payment.';
      return { valid: false, message };
    }
  }, [quote.chain, quote.token]);

  async function submitSolanaPayment(): Promise<void> {
    const reference = externalReference.trim();
    if (!reference) {
      setSolanaError('External reference is required.');
      return;
    }

    setSubmitting(true);
    setSolanaError(null);

    try {
      const result = await submitPayTransaction({
        connection,
        wallet,
        token: quote.token,
        amountDecimal: String(quote.sendAmountUsd),
        transferId: transfer.transferId,
        externalReference: reference
      });
      setSolanaResult(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Solana payment failed.';
      setSolanaError(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold">Pay on Solana</p>
        <p className="text-xs text-muted-foreground">
          Sign a wallet transaction to call the on-chain `pay(...)` instruction.
        </p>
        <p className="text-xs text-muted-foreground">
          Uses the configured remittance program for the selected Solana cluster.
        </p>
      </div>

      <div className="grid gap-2">
        <label htmlFor="external-reference" className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          External reference
        </label>
        <Input
          id="external-reference"
          value={externalReference}
          onChange={(event) => setExternalReference(event.target.value)}
          placeholder="Enter external reference"
        />
      </div>

      {!wallet.connected ? <WalletConnectPanel chain="solana" /> : null}

      {!mintConfigValidation.valid && mintConfigValidation.message ? (
        <Alert variant="destructive">
          <AlertTitle>Solana payment config error</AlertTitle>
          <AlertDescription>{mintConfigValidation.message}</AlertDescription>
        </Alert>
      ) : null}

      {solanaError ? (
        <Alert variant="destructive">
          <AlertTitle>Payment failed</AlertTitle>
          <AlertDescription>{solanaError}</AlertDescription>
        </Alert>
      ) : null}

      {solanaResult ? (
        <Alert>
          <AlertTitle>Payment submitted</AlertTitle>
          <AlertDescription>
            <span className="block break-all">Signature: {solanaResult.signature}</span>
            <a href={solanaResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline">
              View on Solana Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </AlertDescription>
        </Alert>
      ) : null}

      <Button
        onClick={submitSolanaPayment}
        disabled={
          submitting ||
          Boolean(solanaResult) ||
          !wallet.connected ||
          !wallet.publicKey ||
          !externalReference.trim() ||
          !mintConfigValidation.valid
        }
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Submitting on-chain payment...
          </>
        ) : (
          'Pay with Solana wallet'
        )}
      </Button>
    </div>
  );
}

export function DepositInstructions({ transfer }: DepositInstructionsProps) {
  const { quote } = transfer;
  const walletPresets = getWalletDeepLinkPresets({
    chain: quote.chain,
    token: quote.token,
    to: transfer.depositAddress,
    amountUsd: quote.sendAmountUsd
  });

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
          Send the exact amount to the deposit address below. Funds are settled on-chain and converted to ETB.
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
        <CopyRow label="Deposit address" value={transfer.depositAddress} />
        <p className="text-xs text-muted-foreground">
          This deposit route is generated by the offshore collector for this transfer.
          {quote.chain === 'solana' ? ' The Solana pay panel below is a separate on-chain program flow.' : null}
        </p>

        {/* Network + token */}
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyRow label="Network" value={quote.chain} />
          <CopyRow label="Token" value={quote.token} />
        </div>

        {/* Expiry */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          Expires: {new Date(quote.expiresAt).toLocaleString()}
        </div>

        {/* Safety alert */}
        <Alert className="border-secondary/25 bg-secondary/5">
          <ShieldAlert className="h-4 w-4 text-secondary" />
          <AlertTitle className="text-secondary">Safety check</AlertTitle>
          <AlertDescription className="text-sm text-muted-foreground">
            Only send <strong>{quote.token}</strong> on the{' '}
            <strong>{quote.chain}</strong> network. Sending the wrong token or using the wrong chain may result in lost funds.
          </AlertDescription>
        </Alert>

        {quote.chain === 'solana' && walletMode() !== 'mock' ? <SolanaPayPanel transfer={transfer} /> : null}
        {quote.chain === 'base' ? (
          <p className="text-xs text-muted-foreground">
            Solana wallet selector appears only for Solana transfers.
          </p>
        ) : null}

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
          {walletPresets.map((preset) => (
            <Button asChild variant="outline" key={preset.id}>
              <Link href={preset.href as Route} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="mr-2 h-4 w-4" />
                {preset.label}
              </Link>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
