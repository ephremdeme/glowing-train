'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, RotateCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { QuoteForm } from '@/components/quote/quote-form';
import { RouteGuard } from '@/components/route-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { readApiMessage } from '@/lib/client-api';
import type { MePayload, QuoteSummary } from '@/lib/contracts';
import { patchFlowDraft, readFlowDraft } from '@/lib/flow-state';
import { readAccessToken } from '@/lib/session';

export default function QuotePage() {
  const [token, setToken] = useState('');
  const [profile, setProfile] = useState<MePayload | null>(null);
  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [kycBusy, setKycBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const nextToken = readAccessToken();
    setToken(nextToken);
    const draft = readFlowDraft();
    setQuote(draft.quote);
  }, []);

  useEffect(() => {
    if (!token) return;
    void loadProfile(token);
  }, [token]);

  const senderKycStatus = profile?.senderKyc.kycStatus ?? 'pending';
  const senderApproved = senderKycStatus === 'approved';

  const kycBadgeVariant = useMemo(() => {
    if (senderKycStatus === 'approved') return 'success';
    if (senderKycStatus === 'rejected') return 'destructive';
    return 'warning';
  }, [senderKycStatus]);

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

  async function refreshSenderKyc(): Promise<void> {
    if (!token) return;
    setKycBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/kyc/sender/status', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | {
            kycStatus?: 'approved' | 'pending' | 'rejected';
            applicantId?: string | null;
            reasonCode?: string | null;
            lastReviewedAt?: string | null;
          }
        | { error?: { message?: string } };

      if (!response.ok || !('kycStatus' in payload)) {
        setMessage(readApiMessage(payload, 'Could not refresh sender KYC status.'));
        return;
      }

      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          senderKyc: {
            kycStatus: payload.kycStatus ?? prev.senderKyc.kycStatus,
            applicantId: payload.applicantId ?? null,
            reasonCode: payload.reasonCode ?? null,
            lastReviewedAt: payload.lastReviewedAt ?? null
          }
        };
      });
      setMessage('Sender KYC status refreshed.');
    } finally {
      setKycBusy(false);
    }
  }

  async function restartVerification(): Promise<void> {
    if (!token) return;
    setKycBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/kyc/sender/sumsub-token', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | { token?: string }
        | { error?: { message?: string } };

      if (!response.ok || !('token' in payload)) {
        setMessage(readApiMessage(payload, 'Could not restart verification.'));
        return;
      }

      setMessage('Verification session started. Complete provider flow, then refresh your status.');
    } finally {
      setKycBusy(false);
    }
  }

  function onQuoteCreated(nextQuote: QuoteSummary): void {
    setQuote(nextQuote);
    patchFlowDraft({ quote: nextQuote, transfer: null });
  }

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6">
        <section className="grid gap-3 rounded-3xl border border-border/70 bg-card/70 p-6 shadow-panel md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Lock your quote</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Choose chain and token, lock your USD to ETB terms, and proceed to transfer setup. Transfer limit is $2,000.
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">USDC / USDT</Badge>
            <Badge variant="outline">Base + Solana</Badge>
            <Badge variant="outline">No custodial wallet balances</Badge>
          </div>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              {senderApproved ? <ShieldCheck className="h-5 w-5 text-emerald-600" /> : <ShieldAlert className="h-5 w-5 text-amber-600" />}
              Sender KYC status
            </CardTitle>
            <CardDescription>Transfer creation requires sender and receiver verification.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            {loadingProfile ? <p className="text-sm text-muted-foreground">Loading sender profile...</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={kycBadgeVariant}>{senderKycStatus.toUpperCase()}</Badge>
              {profile?.senderKyc.reasonCode ? <span className="text-xs text-muted-foreground">Reason: {profile.senderKyc.reasonCode}</span> : null}
            </div>

            {!senderApproved ? (
              <Alert>
                <AlertTitle>Verification required</AlertTitle>
                <AlertDescription>
                  {senderKycStatus === 'pending'
                    ? 'Your verification is in review. Refresh status or wait for approval.'
                    : 'Your verification was rejected. Restart verification and refresh status.'}
                </AlertDescription>
              </Alert>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={refreshSenderKyc} disabled={kycBusy || !token}>
                <RotateCw className="mr-2 h-4 w-4" />
                Refresh status
              </Button>
              {senderKycStatus === 'rejected' ? (
                <Button variant="secondary" onClick={restartVerification} disabled={kycBusy || !token}>
                  Restart verification
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <QuoteForm token={token} initialQuote={quote} onQuoteCreated={onQuoteCreated} disabled={!token} />

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Continue to transfer</CardTitle>
            <CardDescription>Create recipient details and get deposit instructions in the next step.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            {quote && senderApproved ? (
              <Button asChild>
                <Link href={'/transfer' as Route}>
                  Continue to transfer
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button disabled>
                Continue to transfer
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            )}
            {!quote ? <p className="text-sm text-muted-foreground">Create a quote first.</p> : null}
            {quote && !senderApproved ? <p className="text-sm text-muted-foreground">Sender KYC must be approved first.</p> : null}
          </CardContent>
        </Card>

        {message ? (
          <Alert>
            <AlertTitle>Quote flow</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
    </RouteGuard>
  );
}
