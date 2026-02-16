'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, ExternalLink } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { FlowProgress } from '@/components/flow-progress';
import { StatusCelebrationScene } from '@/components/illustrations/status-celebration-scene';
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

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6">
        {/* Page header */}
        <section>
          <div className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-muted-foreground">Transfer Status</p>
            <h1 className="break-all text-2xl font-bold tracking-tight">{params.transferId}</h1>
            <p className="text-sm text-muted-foreground">Auto-refreshing every 5 seconds.</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={'/history' as Route}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Back to history
                </Link>
              </Button>
              <Button asChild size="sm">
                <Link href={`/receipts/${params.transferId}` as Route}>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Printable receipt
                </Link>
              </Button>
            </div>
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
            {/* Status illustration */}
            <StatusCelebrationScene status={data.uiStatus} className="h-[100px] md:h-[120px]" />

            {/* Flow progress timeline */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Progress timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <FlowProgress status={data.uiStatus} />
              </CardContent>
            </Card>

            {/* Current state */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Current state</CardTitle>
                <CardDescription>Mapped sender-facing state with backend status details.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Backend status</p>
                    <p className="font-medium">{data.backendStatus}</p>
                  </div>
                  <div className="grid gap-1 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">UI status</p>
                    <p className="font-medium">UI status: {data.uiStatus}</p>
                  </div>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="grid gap-1 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Payout status</p>
                    <p className="font-medium">{data.payout?.status ?? 'n/a'}</p>
                  </div>
                  <div className="grid gap-1 rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Last update</p>
                    <p className="font-medium">
                      {new Date(data.transitions[data.transitions.length - 1]?.occurredAt ?? data.transfer.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
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

            {/* Transition history */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transition history</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transitions yet.</p>
                ) : (
                  data.transitions.map((item, index) => (
                    <div key={`${item.toState}-${index}`} className="grid gap-1 rounded-xl border border-border/50 bg-muted/15 px-4 py-3 text-sm md:grid-cols-3">
                      <span className="text-muted-foreground">{item.fromState ?? '—'}</span>
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
