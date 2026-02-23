'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Wallet } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { RecipientSection } from '@/components/transfer/recipient-section';
import { DepositInstructions } from '@/components/transfer/deposit-instructions';
import { TransferJourneyScene } from '@/components/illustrations/transfer-journey-scene';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateTransfer, useSenderProfile } from '@/features/remittance/hooks';
import { isSenderKycApproved, mapSenderKycUiStatus, senderKycGateMessage } from '@/features/remittance/mappers';
import type { QuoteSummary, RecipientDetail, TransferSummary, WalletConnectionState } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';
import { patchFlowDraft, readFlowDraft } from '@/lib/flow-state';

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export default function TransferPage() {
  return (
    <RouteGuard requireAuth requireQuote>
      <TransferPageContent />
    </RouteGuard>
  );
}

function TransferPageContent() {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [recipient, setRecipient] = useState<RecipientDetail | null>(null);
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const token = readAccessToken() ?? '';
  const senderProfileQuery = useSenderProfile(token);
  const createTransferMutation = useCreateTransfer(token);

  useEffect(() => {
    const draft = readFlowDraft();
    if (draft?.quote) setQuote(draft.quote);
    if (draft?.recipient) setRecipient(draft.recipient);
    if (draft?.transfer) setTransfer(draft.transfer);
  }, []);

  const senderKycApproved = isSenderKycApproved(senderProfileQuery.data);
  const senderKycStatus = mapSenderKycUiStatus(senderProfileQuery.data);
  const senderKycMessage = senderKycGateMessage(senderKycStatus);

  const quoteRecipientAmount = useMemo(() => {
    if (!quote) return null;
    return currencyEtb((quote.sendAmountUsd - quote.feeUsd) * quote.fxRateUsdToEtb);
  }, [quote]);

  async function createTransfer(): Promise<void> {
    if (!quote || !recipient || !token) return;

    setMessage(null);
    try {
      const created = await createTransferMutation.mutateAsync({
        quoteId: quote.quoteId,
        recipientId: recipient.recipientId,
        quote
      });

      setTransfer(created);
      patchFlowDraft({
        quote,
        recipientId: recipient.recipientId,
        recipient,
        transfer: created
      });
    } catch (error) {
      setMessage(errorMessage(error, 'Could not create transfer.'));
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.022em]">Create transfer</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Set up the recipient, optionally connect a wallet, then fund the transfer.</p>
        </div>

        <TransferJourneyScene className="h-[140px]" />

        {quote && (
          <Card>
            <CardContent className="flex items-center justify-between p-4">
              <div className="text-sm">
                <span className="font-medium">{quote.sendAmountUsd} USD</span>
                <span className="mx-2 text-muted-foreground">→</span>
                <span className="font-medium">{quoteRecipientAmount}</span>
              </div>
              <span className="text-xs text-muted-foreground">{quote.chain}/{quote.token}</span>
            </CardContent>
          </Card>
        )}

        {senderProfileQuery.isError ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Verification check failed</AlertTitle>
            <AlertDescription>{errorMessage(senderProfileQuery.error, 'Unable to check sender verification status.')}</AlertDescription>
          </Alert>
        ) : null}

        {!senderKycApproved && senderKycMessage ? (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Sender verification required</AlertTitle>
            <AlertDescription>{senderKycMessage}</AlertDescription>
          </Alert>
        ) : null}

        {!transfer ? (
          <RecipientSection
            token={token}
            initialRecipientId={recipient?.recipientId ?? null}
            onRecipientReady={(nextRecipient: RecipientDetail | null) => {
              setRecipient(nextRecipient);
              patchFlowDraft({
                recipientId: nextRecipient?.recipientId ?? null,
                recipient: nextRecipient,
                transfer: null
              });
            }}
          />
        ) : null}

        {!transfer && recipient ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-4 w-4" />
                Wallet connection (optional)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WalletConnectPanel
                chain={quote?.chain ?? 'base'}
                onStateChange={(state: WalletConnectionState) => setWalletAddress(state.address)}
              />
              {walletAddress ? (
                <p className="mt-3 text-xs text-muted-foreground">
                  Connected wallet will only be used for client-side convenience actions and signing. Crypto remains sender-controlled.
                </p>
              ) : null}
            </CardContent>
          </Card>
        ) : null}

        {!transfer && recipient && senderKycApproved ? (
          <Button onClick={createTransfer} disabled={createTransferMutation.isPending} className="w-full">
            {createTransferMutation.isPending ? 'Creating...' : 'Create transfer'}
          </Button>
        ) : null}

        {!transfer && recipient && !senderKycApproved ? (
          <p className="text-sm text-muted-foreground">
            Transfer creation unlocks after sender KYC approval. Recipient selection is already saved.
          </p>
        ) : null}

        {message ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Transfer error</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {transfer && quote ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle className="h-4 w-4" />
              Transfer created successfully
            </div>
            <DepositInstructions transfer={transfer} quote={quote} />
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => router.push(`/transfers/${transfer.transferId}` as Route)}>
                Track transfer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}

        {!quote ? (
          <Alert>
            <AlertTitle>Missing quote</AlertTitle>
            <AlertDescription>
              Return to the quote page to lock a quote before creating a transfer.{' '}
              <Link href={'/quote' as Route} className="text-primary underline">Go to quote</Link>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    </div>
  );
}
