'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { QuoteForm } from '@/components/quote/quote-form';
import { useSenderProfile } from '@/features/remittance/hooks';
import { mapSenderKycUiStatus, type SenderKycUiStatus } from '@/features/remittance/mappers';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import type { QuoteSummary } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';
import { patchFlowDraft, readFlowDraft } from '@/lib/flow-state';

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', {
    style: 'currency',
    currency: 'ETB'
  }).format(value);
}

export default function QuotePage() {
  const router = useRouter();
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const token = readAccessToken() ?? '';
  const senderProfileQuery = useSenderProfile(token);

  useEffect(() => {
    const draft = readFlowDraft();
    if (draft?.quote) {
      setQuote(draft.quote);
    }

    const token = readAccessToken();
    if (!token) return;
    setIsAuthenticated(true);
  }, []);

  const kycStatus: SenderKycUiStatus = isAuthenticated ? mapSenderKycUiStatus(senderProfileQuery.data) : 'NOT_STARTED';
  const kycError =
    isAuthenticated && senderProfileQuery.isError
      ? senderProfileQuery.error instanceof Error
        ? senderProfileQuery.error.message
        : 'Unable to check KYC status.'
      : null;

  function handleQuoteCreated(created: QuoteSummary) {
    setQuote(created);
    patchFlowDraft({ quote: created, transfer: null });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="grid gap-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-semibold tracking-[-0.022em]">Quote</h1>
          <p className="mt-1.5 text-[15px] text-muted-foreground">
            Lock your exchange rate and review terms before transferring.
          </p>
        </div>

        {/* Auth notice for unauthenticated users */}
        {!isAuthenticated && (
          <Alert>
            <AlertTitle>Sign in to lock your quote</AlertTitle>
            <AlertDescription>
              You can preview rates below, but you&apos;ll need to{' '}
              <Link href={'/login?next=/quote' as Route} className="font-medium text-primary underline">
                sign in
              </Link>{' '}
              or{' '}
              <Link href={'/signup?next=/quote' as Route} className="font-medium text-primary underline">
                create an account
              </Link>{' '}
              to lock a quote.
            </AlertDescription>
          </Alert>
        )}

        {/* KYC status (only for authenticated users) */}
        {isAuthenticated && kycError ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>KYC check failed</AlertTitle>
            <AlertDescription>{kycError}</AlertDescription>
          </Alert>
        ) : null}

        {isAuthenticated && kycStatus === 'PENDING' ? (
          <Alert>
            <AlertTitle>Verification pending</AlertTitle>
            <AlertDescription>Your identity verification is still being reviewed. You can create a quote but cannot start a transfer until approved.</AlertDescription>
          </Alert>
        ) : null}

        {isAuthenticated && kycStatus === 'REJECTED' ? (
          <Alert variant="destructive">
            <XCircle className="h-4 w-4" />
            <AlertTitle>Verification rejected</AlertTitle>
            <AlertDescription>Your identity verification was not approved. Please contact support.</AlertDescription>
          </Alert>
        ) : null}

        {/* Quote form */}
        <QuoteForm
          token={token}
          initialQuote={quote}
          onQuoteCreated={handleQuoteCreated}
          disabled={kycStatus === 'REJECTED'}
          isAuthenticated={isAuthenticated}
        />

        {/* Locked quote confirmation */}
        {quote && isAuthenticated && kycStatus === 'APPROVED' && (
          <div className="flex items-center justify-between rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-emerald-500" />
              <div>
                <p className="text-sm font-semibold text-foreground">
                  Quote locked. Continue to transfer setup.
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {quote.sendAmountUsd} USD → {currencyEtb((quote.sendAmountUsd - quote.feeUsd) * quote.fxRateUsdToEtb)} on {quote.chain}/{quote.token}
                </p>
              </div>
            </div>
            <Button size="sm" onClick={() => router.push('/transfer' as Route)}>
              Continue to transfer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
