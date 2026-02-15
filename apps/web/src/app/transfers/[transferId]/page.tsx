'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StatusChipVariant, TransferDetailPayload, UiTransferStatus } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';
import { toStatusChipVariant } from '@/lib/status';

type TransferStatusResponse = TransferDetailPayload & {
  backendStatus: string;
  uiStatus: UiTransferStatus;
};

const FLOW: UiTransferStatus[] = ['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID'];

function flowIndex(status: UiTransferStatus): number {
  if (status === 'FAILED') return -1;
  return FLOW.indexOf(status);
}

function badgeVariant(variant: StatusChipVariant): 'outline' | 'warning' | 'success' | 'destructive' | 'secondary' {
  if (variant === 'success') return 'success';
  if (variant === 'danger') return 'destructive';
  if (variant === 'warning') return 'warning';
  if (variant === 'info') return 'secondary';
  return 'outline';
}

export default function TransferStatusPage({ params }: { params: { transferId: string } }) {
  const [data, setData] = useState<TransferStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const poll = async (): Promise<void> => {
      const token = readAccessToken();
      if (!token) {
        setError('Sign in first to track transfer status.');
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/client/transfers/${params.transferId}`, {
        cache: 'no-store',
        headers: {
          authorization: `Bearer ${token}`
        }
      });

      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | TransferStatusResponse
        | { error?: { message?: string } };

      if (!active) return;

      if (!response.ok || !('transfer' in payload)) {
        const message = 'error' in payload ? payload.error?.message : null;
        setError(message ?? 'Unable to load transfer status.');
        setLoading(false);
        return;
      }

      setData(payload);
      setError(null);
      setLoading(false);
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [params.transferId]);

  const idx = useMemo(() => (data ? flowIndex(data.uiStatus) : -1), [data]);

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6">
        <section className="neon-surface neon-section grid gap-3 rounded-[1.8rem] p-6 md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Transfer Status</p>
          <h1 className="break-all text-3xl font-semibold tracking-tight md:text-4xl">{params.transferId}</h1>
          <p className="text-sm text-muted-foreground">Live polling interval: 5 seconds.</p>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={'/history' as Route}>Back to history</Link>
            </Button>
            <Button asChild size="sm">
              <Link href={`/receipts/${params.transferId}` as Route}>Printable receipt</Link>
            </Button>
          </div>
        </section>

        {loading ? <p className="text-sm text-muted-foreground">Loading transfer status...</p> : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>Unable to load status</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {data ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Current state</CardTitle>
                <CardDescription>Mapped sender-facing state with backend status details.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-2 text-sm">
                <p>
                  <strong>Backend status:</strong> {data.backendStatus}
                </p>
                <p>
                  <strong>UI status:</strong> {data.uiStatus}
                </p>
                <p>
                  <strong>Payout status:</strong> {data.payout?.status ?? 'n/a'}
                </p>
                <p>
                  <strong>Last update:</strong>{' '}
                  {new Date(data.transitions[data.transitions.length - 1]?.occurredAt ?? data.transfer.createdAt).toLocaleString()}
                </p>
                <div className="pt-1">
                  <Badge variant={badgeVariant(toStatusChipVariant(data.uiStatus))}>{data.uiStatus}</Badge>
                </div>
              </CardContent>
            </Card>

            {data.uiStatus === 'FAILED' ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Manual review required</AlertTitle>
                <AlertDescription>This transfer is in a failed or review-required state.</AlertDescription>
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Progress timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-2 md:grid-cols-6" aria-label="Transfer timeline">
                  {FLOW.map((step, index) => (
                    <li key={step}>
                      <Badge variant={idx >= index ? 'success' : 'outline'} className="w-full justify-center py-2">
                        {step}
                      </Badge>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Transition history</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transitions yet.</p>
                ) : (
                  data.transitions.map((item, index) => (
                    <div key={`${item.toState}-${index}`} className="grid gap-1 rounded-2xl border border-border/70 bg-muted/25 px-4 py-3 text-sm md:grid-cols-3">
                      <span className="text-muted-foreground">{item.fromState ?? '-'}</span>
                      <span className="font-medium">{item.toState}</span>
                      <span className="text-muted-foreground">{new Date(item.occurredAt).toLocaleString()}</span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : null}
      </div>
    </RouteGuard>
  );
}
