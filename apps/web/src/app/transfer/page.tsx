'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, ShieldAlert } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { DepositInstructions } from '@/components/transfer/deposit-instructions';
import { RecipientSection } from '@/components/transfer/recipient-section';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import { readApiMessage } from '@/lib/client-api';
import type { MePayload, QuoteSummary, RecipientDetail, TransferSummary, WalletConnectionState } from '@/lib/contracts';
import { patchFlowDraft, readFlowDraft } from '@/lib/flow-state';
import { readAccessToken } from '@/lib/session';

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

export default function TransferPage() {
  const [token, setToken] = useState('');
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [recipient, setRecipient] = useState<RecipientDetail | null>(null);
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [wallet, setWallet] = useState<WalletConnectionState | null>(null);
  const [profile, setProfile] = useState<MePayload | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextToken = readAccessToken();
    const draft = readFlowDraft();

    setToken(nextToken);
    setQuote(draft.quote);
    setRecipient(draft.recipient);
    setTransfer(draft.transfer);
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadProfile(token);
  }, [token]);

  const senderApproved = profile?.senderKyc.kycStatus === 'approved';
  const receiverApproved = Boolean(
    recipient?.receiverKyc.kycStatus === 'approved' && recipient.receiverKyc.nationalIdVerified
  );

  const createBlockedReason = useMemo(() => {
    if (!quote) return 'A quote is required before creating a transfer.';
    if (!senderApproved) return 'Sender KYC must be approved.';
    if (!recipient) return 'Select or create a recipient first.';
    if (!receiverApproved) return 'Receiver KYC must be approved and national ID verified.';
    return null;
  }, [quote, recipient, receiverApproved, senderApproved]);

  async function loadProfile(accessToken: string): Promise<void> {
    setLoadingProfile(true);
    const response = await fetch('/api/client/me', {
      headers: {
        authorization: `Bearer ${accessToken}`
      }
    });
    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
      | MePayload
      | { error?: { message?: string } };

    if (!response.ok || !('customerId' in payload)) {
      setMessage(readApiMessage(payload, 'Unable to load sender profile.'));
      setLoadingProfile(false);
      return;
    }

    setProfile(payload);
    setLoadingProfile(false);
  }

  async function createTransfer(): Promise<void> {
    if (!token || !quote || !recipient) return;
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/transfers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          recipientId: recipient.recipientId,
          quote
        })
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | TransferSummary
        | { error?: { message?: string } };

      if (!response.ok || !('transferId' in payload)) {
        setMessage(readApiMessage(payload, 'Could not create transfer.'));
        return;
      }

      setTransfer(payload);
      patchFlowDraft({ transfer: payload });
      setMessage('Transfer created. Send funds to the provided deposit address before quote expiry.');
    } finally {
      setBusy(false);
    }
  }

  function onRecipientReady(nextRecipient: RecipientDetail | null): void {
    setRecipient(nextRecipient);
    patchFlowDraft({ recipient: nextRecipient, recipientId: nextRecipient?.recipientId ?? null, transfer: null });
  }

  return (
    <RouteGuard requireAuth requireQuote>
      <div className="grid gap-6">
        <section className="neon-surface neon-section grid gap-3 rounded-[1.8rem] p-6 md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Create transfer and fund from wallet</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Keep custody of your funds. We provide destination route, bank payout orchestration, and status tracking.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">Cap: $2,000</Badge>
            <Badge variant="outline">Bank payout in ETB</Badge>
            <Badge variant="outline">SLA target: ~10 minutes after confirmation</Badge>
          </div>
        </section>

        {quote ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Quote summary</CardTitle>
              <CardDescription>Review the locked terms you are about to fund.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2 text-sm">
              <p>
                <strong>Route:</strong> {quote.chain.toUpperCase()} / {quote.token}
              </p>
              <p>
                <strong>Send amount:</strong> {currencyUsd(quote.sendAmountUsd)}
              </p>
              <p>
                <strong>Fee:</strong> {currencyUsd(quote.feeUsd)}
              </p>
              <p>
                <strong>Recipient estimate:</strong> {currencyEtb(quote.recipientAmountEtb)}
              </p>
              <p>
                <strong>Quote expiry:</strong> {new Date(quote.expiresAt).toLocaleString()}
              </p>
              <div className="pt-1">
                <Button asChild variant="outline" size="sm">
                  <Link href={'/quote' as Route}>Back to quote</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Sender KYC gate</CardTitle>
            <CardDescription>Transfer creation is blocked until sender and receiver KYC are approved.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            {loadingProfile ? <p className="text-muted-foreground">Loading sender profile...</p> : null}
            <div className="flex items-center gap-2">
              <Badge variant={senderApproved ? 'success' : 'warning'}>
                Sender KYC {profile?.senderKyc.kycStatus?.toUpperCase() ?? 'PENDING'}
              </Badge>
            </div>
            {!senderApproved ? (
              <Alert>
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Sender verification required</AlertTitle>
                <AlertDescription>Return to Quote to refresh or restart sender verification.</AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>

        {quote ? <WalletConnectPanel chain={quote.chain} onStateChange={setWallet} /> : null}

        {wallet ? (
          <div className="rounded-2xl border border-border/70 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
            Wallet state: {wallet.connected ? `${wallet.connectorName ?? 'Wallet'} (${wallet.address ?? 'address unavailable'})` : 'Not connected'}
          </div>
        ) : null}

        <RecipientSection token={token} initialRecipientId={recipient?.recipientId ?? null} onRecipientReady={onRecipientReady} />

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Create transfer</CardTitle>
            <CardDescription>Generate deposit instructions and then fund from your wallet.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button onClick={createTransfer} disabled={busy || Boolean(createBlockedReason)}>
              {busy ? 'Creating transfer...' : 'Create transfer'}
            </Button>
            {createBlockedReason ? <p className="text-sm text-muted-foreground">{createBlockedReason}</p> : null}
          </CardContent>
        </Card>

        {transfer ? <DepositInstructions transfer={transfer} onMessage={setMessage} /> : null}

        {transfer ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild>
              <Link href={`/transfers/${transfer.transferId}` as Route}>
                Track live status
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={'/history' as Route}>View history</Link>
            </Button>
          </div>
        ) : null}

        {message ? (
          <Alert>
            <AlertTitle>Transfer flow</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </RouteGuard>
  );
}
