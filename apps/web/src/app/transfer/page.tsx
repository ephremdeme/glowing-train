'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle,
  Wallet
} from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { RecipientSection } from '@/components/transfer/recipient-section';
import { DepositInstructions } from '@/components/transfer/deposit-instructions';
import { TransferJourneyScene } from '@/components/illustrations/transfer-journey-scene';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { readApiMessage } from '@/lib/client-api';
import type { QuoteSummary, RecipientDetail, TransferSummary, WalletConnectionState } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';
import { patchFlowDraft, readFlowDraft } from '@/lib/flow-state';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';

type KycStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'NOT_STARTED';

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

function TransferInner({ token }: { token: string }) {
  const [quote, setQuote] = useState<QuoteSummary | null>(() => readFlowDraft().quote ?? null);
  const [recipient, setRecipient] = useState<RecipientDetail | null>(null);
  const [transfer, setTransfer] = useState<TransferSummary | null>(() => readFlowDraft().transfer ?? null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kycStatus, setKycStatus] = useState<KycStatus>('NOT_STARTED');

  useEffect(() => {
    if (!token) return;
    (async () => {
      const response = await fetch('/api/client/me', {
        headers: { authorization: `Bearer ${token}` }
      });
      const payload = await response.json().catch(() => null);
      if (payload?.senderKyc?.kycStatus) {
        setKycStatus(payload.senderKyc.kycStatus.toUpperCase() as KycStatus);
      }
    })();
  }, [token]);

  async function createTransfer(): Promise<void> {
    if (!quote || !recipient) return;

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
          quote,
          walletAddress: walletAddress ?? undefined
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
      patchFlowDraft({ quote, transfer: payload });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.022em]">Create transfer</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">
            Set up your recipient and fund the transfer.
          </p>
        </div>

        {/* Illustration */}
        <TransferJourneyScene className="h-[140px]" />

        {/* Quote summary */}
        {quote && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="text-sm">
                <span className="font-medium">{quote.sendAmountUsd} USD</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span className="font-medium">{currencyEtb((quote.sendAmountUsd - quote.feeUsd) * quote.fxRateUsdToEtb)}</span>
              </div>
              <span className="text-xs text-muted-foreground">{quote.chain}/{quote.token}</span>
            </CardContent>
          </Card>
        )}

        {/* KYC warning */}
        {kycStatus !== 'APPROVED' && kycStatus !== 'NOT_STARTED' && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification {kycStatus === 'PENDING' ? 'pending' : 'required'}</AlertTitle>
            <AlertDescription>
              {kycStatus === 'PENDING'
                ? 'Your identity check is still being reviewed.'
                : 'Complete identity verification before creating a transfer.'}
            </AlertDescription>
          </Alert>
        )}

        {/* Recipient */}
        {!transfer && (
          <RecipientSection
            token={token}
            initialRecipientId={recipient?.recipientId ?? null}
            onRecipientReady={(r: RecipientDetail | null) => setRecipient(r)}
          />
        )}

        {/* Wallet */}
        {!transfer && recipient && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Connect wallet (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WalletConnectPanel
                chain={quote?.chain ?? 'base'}
                onStateChange={(state: WalletConnectionState) => setWalletAddress(state.address)}
              />
            </CardContent>
          </Card>
        )}

        {/* Create transfer button */}
        {!transfer && recipient && kycStatus === 'APPROVED' && (
          <Button onClick={createTransfer} disabled={busy} className="w-full">
            {busy ? 'Creating...' : 'Create transfer'}
          </Button>
        )}

        {message ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transfer error</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {/* Deposit instructions after transfer created */}
        {transfer && quote && (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle className="h-4 w-4" />
              Transfer created successfully
            </div>
            <DepositInstructions transfer={transfer} quote={quote} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function TransferPage() {
  return (
    <RouteGuard requireAuth requireQuote>
      {(token) => <TransferInner token={token} />}
    </RouteGuard>
  );
}
