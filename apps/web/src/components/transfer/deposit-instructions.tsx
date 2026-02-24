'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useConfirmSolanaWalletPayment } from '@/features/remittance/hooks';
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

const SOLANA_SIG_KEY_PREFIX = 'cryptopay:web:solana-last-signature:';
const SOLANA_AUTO_VERIFY_FAST_WINDOW_MS = 2 * 60_000;
const SOLANA_AUTO_VERIFY_MAX_MS = 10 * 60_000;

function solanaSignatureKey(transferId: string): string {
  return `${SOLANA_SIG_KEY_PREFIX}${transferId}`;
}

function readStoredSolanaSignature(transferId: string): string | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(solanaSignatureKey(transferId));
}

function writeStoredSolanaSignature(transferId: string, signature: string): void {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(solanaSignatureKey(transferId), signature);
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

function solanaAutoVerifyDelayMs(elapsedMs: number): number {
  if (elapsedMs < SOLANA_AUTO_VERIFY_FAST_WINDOW_MS) return 5_000;
  if (elapsedMs < 4 * 60_000) return 10_000;
  if (elapsedMs < 6 * 60_000) return 20_000;
  if (elapsedMs < 8 * 60_000) return 40_000;
  return 60_000;
}

type VerifyState = 'idle' | 'verifying' | 'confirmed' | 'duplicate' | 'pending' | 'failed';

function verificationAlertVariant(state: VerifyState): 'default' | 'destructive' | 'success' | 'warning' | 'info' {
  if (state === 'failed') return 'destructive';
  if (state === 'confirmed' || state === 'duplicate') return 'success';
  if (state === 'pending') return 'warning';
  if (state === 'verifying') return 'info';
  return 'default';
}

function verificationAlertTitle(state: VerifyState): string {
  if (state === 'verifying') return 'Confirming payment';
  if (state === 'confirmed') return 'Payment confirmed';
  if (state === 'duplicate') return 'Payment already confirmed';
  if (state === 'pending') return 'Confirmation pending';
  if (state === 'failed') return 'Verification failed';
  return 'Payment status';
}

function SolanaPayPanel({ transfer }: { transfer: TransferSummary }) {
  const { quote } = transfer;
  const { connection } = useConnection();
  const wallet = useWallet();
  const [submitting, setSubmitting] = useState(false);
  const [solanaError, setSolanaError] = useState<string | null>(null);
  const [solanaResult, setSolanaResult] = useState<SubmitPayTransactionResult | null>(null);
  const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyState>('idle');
  const [lastSignature, setLastSignature] = useState<string | null>(() => readStoredSolanaSignature(transfer.transferId));
  const autoVerifyTimerRef = useRef<number | null>(null);
  const autoVerifyStartedAtRef = useRef<number | null>(null);
  const autoVerifySignatureRef = useRef<string | null>(null);
  const confirmPaymentMutation = useConfirmSolanaWalletPayment();

  function clearAutoVerifyTimer(): void {
    if (autoVerifyTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(autoVerifyTimerRef.current);
    }
    autoVerifyTimerRef.current = null;
  }

  function stopAutoVerify(): void {
    clearAutoVerifyTimer();
    autoVerifyStartedAtRef.current = null;
    autoVerifySignatureRef.current = null;
  }

  function scheduleAutoVerify(signature: string): void {
    if (typeof window === 'undefined') return;

    const now = Date.now();
    if (autoVerifySignatureRef.current !== signature || autoVerifyStartedAtRef.current === null) {
      autoVerifySignatureRef.current = signature;
      autoVerifyStartedAtRef.current = now;
    }

    const startedAt = autoVerifyStartedAtRef.current;
    const elapsedMs = startedAt ? now - startedAt : 0;
    if (elapsedMs >= SOLANA_AUTO_VERIFY_MAX_MS) {
      stopAutoVerify();
      setVerifyResult('pending');
      setVerifyMessage(
        'Your payment is still waiting for confirmation. Auto-check stopped after 10 minutes. Tap Retry to check again.'
      );
      return;
    }

    const delayMs = solanaAutoVerifyDelayMs(elapsedMs);
    clearAutoVerifyTimer();
    autoVerifyTimerRef.current = window.setTimeout(() => {
      const sig = autoVerifySignatureRef.current;
      if (!sig) return;
      void verifyBackendConfirmation(sig);
    }, delayMs);
  }

  useEffect(() => {
    stopAutoVerify();
    setSolanaError(null);
    setSolanaResult(null);
    setVerifyMessage(null);
    setVerifyResult('idle');
    setLastSignature(readStoredSolanaSignature(transfer.transferId));
  }, [transfer.transferId]);

  useEffect(() => {
    return () => {
      stopAutoVerify();
    };
  }, []);

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
  const canRetryVerification = Boolean(lastSignature) && verifyResult !== 'confirmed' && verifyResult !== 'duplicate';

  async function submitSolanaPayment(): Promise<void> {
    setSubmitting(true);
    setSolanaError(null);
    setVerifyMessage(null);
    setVerifyResult('idle');

    try {
      const result = await submitPayTransaction({
        connection,
        wallet,
        token: quote.token,
        amountDecimal: String(quote.sendAmountUsd),
        transferId: transfer.transferId,
        externalReference: transfer.transferId
      });
      setSolanaResult(result);
      writeStoredSolanaSignature(transfer.transferId, result.signature);
      setLastSignature(result.signature);
      await verifyBackendConfirmation(result.signature);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Solana payment failed.';
      setSolanaError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyBackendConfirmation(signature: string): Promise<void> {
    setVerifyResult('verifying');
    setVerifyMessage('Verifying on backend...');

    try {
      const confirmation = await confirmPaymentMutation.mutateAsync({
        transferId: transfer.transferId,
        signature
      });

      if (confirmation.result === 'confirmed') {
        stopAutoVerify();
        setVerifyResult('confirmed');
        setVerifyMessage('Your payment was confirmed successfully.');
        return;
      }

      if (confirmation.result === 'duplicate') {
        stopAutoVerify();
        setVerifyResult('duplicate');
        setVerifyMessage('This payment was already linked to your transfer.');
        return;
      }

      setVerifyResult('pending');
      setVerifyMessage(
        'Your payment was submitted. We are waiting for network confirmation and will keep checking automatically.'
      );
      scheduleAutoVerify(signature);
    } catch (error) {
      stopAutoVerify();
      setVerifyResult('failed');
      setVerifyMessage(error instanceof Error ? error.message : 'Could not verify Solana payment.');
    }
  }

  return (
    <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="grid gap-1.5">
        <p className="text-sm font-semibold">Pay on Solana</p>
        <p className="text-xs text-muted-foreground">
          Approve the payment in your wallet to fund this transfer.
        </p>
        <p className="text-xs text-muted-foreground">
          We will confirm the payment automatically after it is broadcast.
        </p>
      </div>

      <div className="text-xs text-muted-foreground">
        Reference is fixed to <code className="font-mono">{transfer.transferId}</code> for this transfer.
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
        <Alert variant="info">
          <AlertTitle>Transaction submitted</AlertTitle>
          <AlertDescription>
            <span className="block">Your wallet sent the transaction. Network confirmation may take a moment.</span>
            <span className="mt-1 block break-all text-xs">Signature: {solanaResult.signature}</span>
            <a href={solanaResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline">
              View on Solana Explorer
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </AlertDescription>
        </Alert>
      ) : null}

      {verifyMessage ? (
        <Alert variant={verificationAlertVariant(verifyResult)}>
          <AlertTitle>{verificationAlertTitle(verifyResult)}</AlertTitle>
          <AlertDescription>{verifyMessage}</AlertDescription>
        </Alert>
      ) : null}

      <Button
        onClick={submitSolanaPayment}
        disabled={
          submitting ||
          Boolean(solanaResult) ||
          !wallet.connected ||
          !wallet.publicKey ||
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

      {canRetryVerification ? (
        <Button
          variant="outline"
          onClick={() => {
            if (lastSignature) {
              stopAutoVerify();
              void verifyBackendConfirmation(lastSignature);
            }
          }}
          disabled={verifyResult === 'verifying'}
        >
          {verifyResult === 'verifying' ? 'Verifying...' : 'Retry backend verification'}
        </Button>
      ) : null}
    </div>
  );
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
            ? 'Send the exact amount to the transfer deposit address below. Funds are settled on-chain and converted to ETB.'
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
            ? 'This deposit route is generated by the offshore collector for this transfer.'
            : 'This is the collector treasury account used by the Solana payment flow for this transfer.'}
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
            {quote.chain === 'base' ? (
              <>
                Only send <strong>{quote.token}</strong> on the <strong>{quote.chain}</strong> network. Sending the wrong token or using the wrong chain may result in lost funds.
              </>
            ) : (
              <>
                Use the wallet pay button below on the correct Solana cluster. The selected token must match <strong>{quote.token}</strong>.
              </>
            )}
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
