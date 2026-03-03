'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, CheckCircle, Loader2, Wallet } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { RecipientSection } from '@/components/transfer/recipient-section';
import { DepositInstructions } from '@/components/transfer/deposit-instructions';
import { TransferStepper } from '@/components/transfer/transfer-stepper';
import { TransferJourneyScene } from '@/components/illustrations/transfer-journey-scene';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCreateTransfer, useSenderProfile, useTransferStatus } from '@/features/remittance/hooks';
import { isSenderKycApproved, mapSenderKycUiStatus, senderKycGateMessage } from '@/features/remittance/mappers';
import type { QuoteSummary, RecipientDetail, TransferSummary, WalletConnectionState } from '@/lib/contracts';
import { errorMessage } from '@/lib/error';
import { currencyEtb } from '@/lib/format';
import { readAccessToken } from '@/lib/session';
import { patchFlowDraft, readFlowDraft, clearFlowDraft } from '@/lib/flow-state';



function hasValidTransferSummary(value: unknown): value is TransferSummary {
  if (!value || typeof value !== 'object') return false;
  const transfer = value as Partial<TransferSummary>;
  return Boolean(
    typeof transfer.transferId === 'string' &&
    transfer.transferId.trim() &&
    typeof transfer.depositAddress === 'string' &&
    transfer.depositAddress.trim() &&
    transfer.quote
  );
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
  const [transfer, setTransfer] = useState<TransferSummary | null>(() => readFlowDraft().transfer ?? null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);

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

      if (!hasValidTransferSummary(created)) {
        throw new Error('Transfer response was invalid. Please try again.');
      }

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

  const currentStep = paymentConfirmed ? 'complete' : transfer ? 'fund' : recipient ? 'recipient' : 'quote';

  function handlePaymentConfirmed() {
    setPaymentConfirmed(true);
    // clear the flow draft so the user starts fresh on next visit
    clearFlowDraft();
  }

  const shouldPoll = transfer && !paymentConfirmed;
  const transferStatusQuery = useTransferStatus(token, transfer?.transferId, shouldPoll ? { refetchInterval: 3000 } : undefined);

  const FUNDED_STATUSES = new Set([
    'FUNDING_CONFIRMED',
    'PAYOUT_INITIATED',
    'PAYOUT_COMPLETED',
  ]);

  useEffect(() => {
    if (
      transferStatusQuery.data &&
      FUNDED_STATUSES.has(transferStatusQuery.data.backendStatus) &&
      !paymentConfirmed
    ) {
      handlePaymentConfirmed();
    }
  }, [transferStatusQuery.data, paymentConfirmed]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.022em]">Create transfer</h1>
          <p className="mt-1 text-[15px] text-muted-foreground">Set up the recipient, optionally connect a wallet, then fund the transfer.</p>
        </div>

        <TransferJourneyScene className="h-[140px]" />

        {/* Progress stepper */}
        <TransferStepper currentStep={currentStep} />

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
            senderKycApproved={senderKycApproved}
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
              {quote?.chain === 'base' ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  Solana wallet selector appears only for Solana transfers.
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

        {transfer && quote && !paymentConfirmed ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2 text-sm font-medium text-green-700">
              <CheckCircle className="h-4 w-4" />
              Transfer created successfully
            </div>
            <DepositInstructions transfer={transfer} onConfirmed={handlePaymentConfirmed} />
            {transfer.transferId ? (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => router.push(`/transfers/${transfer.transferId}` as Route)}>
                  Track transfer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}

        {paymentConfirmed && transfer ? (
          <div className="grid gap-4">
            <div className="rounded-2xl border border-green-600/30 bg-green-500/10 p-6 text-center">
              <CheckCircle className="mx-auto mb-3 h-10 w-10 text-green-500" />
              <h2 className="text-xl font-semibold">Payment received!</h2>
              <p className="mt-1 text-sm text-muted-foreground">Your deposit is confirmed. Redirecting to transfer status...</p>
            </div>
            <Button onClick={() => router.push(`/transfers/${transfer.transferId}` as Route)}>
              View transfer status
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={() => { clearFlowDraft(); router.push('/quote' as Route); }}>
              Start a new transfer
            </Button>
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
