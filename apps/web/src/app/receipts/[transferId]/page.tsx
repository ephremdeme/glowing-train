'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowRight, Printer } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchTransferStatusDetail, RemittanceApiError, type TransferStatusDetail } from '@/features/remittance/api';
import { clearAuthSession, readAccessToken } from '@/lib/session';
function getTransferIdParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

export default function ReceiptPage() {
  const params = useParams<{ transferId?: string | string[] }>();
  const router = useRouter();
  const transferId = getTransferIdParam(params?.transferId);
  const [data, setData] = useState<TransferStatusDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    if (!transferId) {
      setData(null);
      setError('Missing transfer ID.');
      return () => {
        active = false;
      };
    }

    const load = async (): Promise<void> => {
      const token = readAccessToken();
      if (!token) {
        setError('Sign in first to view receipts.');
        return;
      }

      try {
        const payload = await fetchTransferStatusDetail(token, transferId);
        if (!active) return;
        setData(payload);
        setError(null);
      } catch (err) {
        if (!active) return;

        if (err instanceof RemittanceApiError && (err.status === 401 || err.status === 403)) {
          clearAuthSession();
          const nextPath = `/receipts/${transferId}`;
          router.replace((`/login?next=${encodeURIComponent(nextPath)}`) as Route);
          return;
        }

        const message =
          err instanceof Error ? err.message : 'Unable to load receipt. Check connection and retry.';
        setError(message || 'Unable to load receipt. Check connection and retry.');
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [router, transferId]);

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6 receipt-root">
        <section className="receipt-actions grid gap-3 rounded-xl border border-border bg-muted/30 p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Printable Receipt</p>
          <h1 className="break-all text-3xl font-semibold tracking-tight md:text-4xl">{transferId ?? 'Unknown transfer'}</h1>
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print receipt
            </Button>
            {data ? (
              <Button asChild variant="secondary">
                <Link href={'/quote' as Route}>
                  <ArrowRight className="mr-2 h-4 w-4" />
                  Send again
                </Link>
              </Button>
            ) : null}
            {transferId ? (
              <Button asChild variant="outline">
                <Link href={`/transfers/${transferId}` as Route}>Back to status</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link href={'/history' as Route}>Back to history</Link>
            </Button>
          </div>
        </section>

        {error ? (
          <Alert variant="destructive" className="receipt-actions">
            <AlertTitle>Receipt unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {data ? (
          <Card className="receipt-print-card">
            <CardHeader>
              <CardTitle className="text-2xl">CryptoPay Transfer Receipt</CardTitle>
              <CardDescription>Immutable transfer details for sender records and support workflows.</CardDescription>
              <div className="flex flex-wrap gap-2 pt-1">
                <Badge variant="outline">{data.transfer.chain.toUpperCase()}</Badge>
                <Badge variant="outline">{data.transfer.token}</Badge>
                <Badge variant="secondary">{data.backendStatus}</Badge>
                <Badge variant={data.uiStatus === 'FAILED' ? 'destructive' : 'success'}>{data.uiStatus}</Badge>
              </div>
            </CardHeader>
            <CardContent className="grid gap-6">
              <section className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h2 className="text-lg font-semibold">Transfer details</h2>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>
                    <strong>Transfer ID:</strong> {data.transfer.transferId}
                  </p>
                  <p>
                    <strong>Quote ID:</strong> {data.transfer.quoteId}
                  </p>
                  <p>
                    <strong>Created:</strong> {new Date(data.transfer.createdAt).toLocaleString()}
                  </p>
                  <p>
                    <strong>Quote expiry:</strong> {new Date(data.quote.expiresAt).toLocaleString()}
                  </p>
                </div>
              </section>

              <section className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h2 className="text-lg font-semibold">Funding route</h2>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>
                    <strong>Chain / token:</strong> {data.transfer.chain.toUpperCase()} {data.transfer.token}
                  </p>
                  <p>
                    <strong>Send amount:</strong> {currencyUsd(data.transfer.sendAmountUsd)}
                  </p>
                  <p className="md:col-span-2 break-all">
                    <strong>Deposit address:</strong> {data.transfer.depositAddress ?? 'n/a'}
                  </p>
                  <p>
                    <strong>Funding tx:</strong> {data.funding?.txHash ?? 'pending'}
                  </p>
                  <p>
                    <strong>Funding confirmed:</strong> {data.funding ? new Date(data.funding.confirmedAt).toLocaleString() : 'pending'}
                  </p>
                </div>
              </section>

              <section className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h2 className="text-lg font-semibold">Recipient payout (ETB)</h2>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <p>
                    <strong>Recipient:</strong> {data.recipient.fullName ?? 'n/a'}
                  </p>
                  <p>
                    <strong>Bank:</strong> {data.recipient.bankCode ?? 'n/a'}
                  </p>
                  <p>
                    <strong>Account name:</strong> {data.recipient.bankAccountName ?? 'n/a'}
                  </p>
                  <p>
                    <strong>Account number:</strong> {data.recipient.bankAccountNumber ?? 'n/a'}
                  </p>
                  <p>
                    <strong>Expected ETB:</strong> {currencyEtb(data.quote.recipientAmountEtb)}
                  </p>
                  <p>
                    <strong>Payout status:</strong> {data.payout?.status ?? 'not started'}
                  </p>
                  <p>
                    <strong>Payout amount:</strong> {data.payout ? currencyEtb(data.payout.amountEtb) : 'n/a'}
                  </p>
                  <p>
                    <strong>Payout reference:</strong> {data.payout?.providerReference ?? 'n/a'}
                  </p>
                </div>
              </section>

              <section className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
                <h2 className="text-lg font-semibold">Transition timeline</h2>
                {data.transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transitions recorded yet.</p>
                ) : (
                  <ol className="grid gap-2 text-sm">
                    {data.transitions.map((transition, index) => (
                      <li key={`${transition.toState}-${index}`} className="rounded-xl border border-border/60 bg-background px-3 py-2">
                        <strong>{transition.fromState ?? '-'}</strong> to <strong>{transition.toState}</strong> on{' '}
                        {new Date(transition.occurredAt).toLocaleString()}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </RouteGuard>
  );
}
