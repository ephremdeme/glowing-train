'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { FlowProgress } from '@/components/flow-progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { StatusChipVariant } from '@/lib/contracts';
import { fetchTransferStatusDetail, RemittanceApiError, type TransferStatusDetail } from '@/features/remittance/api';
import { currencyEtb, currencyUsd, formatStableAmount } from '@/lib/format';
import { clearAuthSession, readAccessToken } from '@/lib/session';
import { toStatusChipVariant } from '@/lib/status';

function badgeVariant(variant: StatusChipVariant): 'outline' | 'warning' | 'success' | 'destructive' | 'secondary' {
  if (variant === 'success') return 'success';
  if (variant === 'danger') return 'destructive';
  if (variant === 'warning') return 'warning';
  if (variant === 'info') return 'secondary';
  return 'outline';
}

function getTransferIdParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export default function TransferStatusPage() {
  const params = useParams<{ transferId?: string | string[] }>();
  const router = useRouter();
  const transferId = useMemo(() => getTransferIdParam(params?.transferId), [params]);
  const [data, setData] = useState<TransferStatusDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let redirecting = false;

    if (!transferId) {
      setData(null);
      setError('Missing transfer ID.');
      setLoading(false);
      return () => {
        active = false;
      };
    }

    const poll = async (): Promise<void> => {
      const token = readAccessToken();
      if (!token) {
        setError('Sign in first to track transfer status.');
        setLoading(false);
        return;
      }

      try {
        const payload = await fetchTransferStatusDetail(token, transferId);
        if (!active || redirecting) return;
        setData(payload);
        setError(null);
        setLoading(false);
      } catch (err) {
        if (!active || redirecting) return;

        if (err instanceof RemittanceApiError && (err.status === 401 || err.status === 403)) {
          redirecting = true;
          clearAuthSession();
          const nextPath = `/transfers/${transferId}`;
          router.replace((`/login?next=${encodeURIComponent(nextPath)}`) as Route);
          return;
        }

        const message =
          err instanceof Error ? err.message : 'Unable to load status. Check connection and retry.';
        setError(message || 'Unable to load status. Check connection and retry.');
        setLoading(false);
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 5000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [router, transferId]);

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6">
        <section>
          <Card className="overflow-hidden border-border/70 bg-gradient-to-br from-background via-background to-primary/5">
            <CardContent className="relative p-6 md:p-7">
              <div className="pointer-events-none absolute -left-20 -top-20 h-52 w-52 rounded-full bg-primary/10 blur-3xl" />
              <div className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="relative grid gap-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="grid gap-1.5">
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-600 dark:text-zinc-400">
                      Transfer Status
                    </p>
                    <h1 className="break-all text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100 md:text-2xl">
                      {transferId ?? 'Unknown transfer'}
                    </h1>
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">Live auto-refresh every 5 seconds.</p>
                  </div>
                  {data ? (
                    <Badge variant={badgeVariant(toStatusChipVariant(data.uiStatus))} className="h-fit">
                      {data.uiStatus.replaceAll('_', ' ')}
                    </Badge>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <Link href={'/history' as Route}>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      Back to history
                    </Link>
                  </Button>
                  {transferId ? (
                    <Button asChild size="sm">
                      <Link href={`/receipts/${transferId}` as Route}>
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Printable receipt
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>
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
            <Card className="border-border/70 bg-gradient-to-br from-card via-card to-muted/10">
              <CardHeader>
                <CardTitle className="text-lg">Amount summary</CardTitle>
                <CardDescription>
                  Expected funding, confirmed on-chain amount, and recipient payout for this transfer.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-3">
                <div className="rounded-xl border border-border/60 bg-background/80 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                    Expected funding
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {formatStableAmount(data.transfer.sendAmountUsd, data.transfer.token)}
                  </p>
                </div>
                <div className="rounded-xl border border-border/60 bg-background/80 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                    Funded on-chain
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {data.funding ? formatStableAmount(data.funding.amountUsd, data.transfer.token) : 'Pending'}
                  </p>
                  {data.funding ? (
                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                      {currencyUsd(data.funding.amountUsd)} equivalent
                    </p>
                  ) : null}
                  {data.funding?.amountDecision ? (
                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                      Decision: {data.funding.amountDecision.replaceAll('_', ' ')}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl border border-border/60 bg-background/80 p-4">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
                    Recipient payout
                  </p>
                  <p className="mt-1 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
                    {currencyEtb(data.payout?.amountEtb ?? data.quote.recipientAmountEtb)}
                  </p>
                  <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                    {data.payout ? `Payout status: ${data.payout.status}` : 'Payout starts after funding confirmation.'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Progress timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <FlowProgress status={data.uiStatus} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Transfer details</CardTitle>
                <CardDescription>Route, funding mode, and latest status signals for support and tracking.</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 text-sm">
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Backend status</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">{data.backendStatus}</p>
                  </div>
                  <div className="grid gap-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Deposit route</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {data.transfer.routeKind.replaceAll('_', ' ')}
                    </p>
                  </div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  <div className="grid gap-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Funding mode</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {data.transfer.fundingMode.replaceAll('_', ' ')}
                    </p>
                  </div>
                  <div className="grid gap-1 rounded-xl border border-border/60 bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Last update</p>
                    <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                      {new Date(data.transitions[data.transitions.length - 1]?.occurredAt ?? data.transfer.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>

                {data.latestFundingSubmission ? (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.12em] text-primary">Latest funding submission</p>
                    <p className="mt-1 break-all font-mono text-xs text-zinc-800 dark:text-zinc-200">
                      {data.latestFundingSubmission.txHash}
                    </p>
                    <p className="mt-1 text-xs text-zinc-700 dark:text-zinc-300">
                      {data.latestFundingSubmission.chain} • {data.latestFundingSubmission.source} •{' '}
                      {data.latestFundingSubmission.status}
                    </p>
                  </div>
                ) : null}
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
                <CardTitle className="text-lg">Transition history</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-2">
                {data.transitions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No transitions yet.</p>
                ) : (
                  data.transitions.map((item, index) => (
                    <div
                      key={`${item.toState}-${index}`}
                      className="grid gap-1 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 text-sm md:grid-cols-[1fr,24px,1fr,auto] md:items-center"
                    >
                      <span className="text-zinc-700 dark:text-zinc-300">{item.fromState ?? '—'}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-semibold text-zinc-900 dark:text-zinc-100">{item.toState}</span>
                      <span className="text-zinc-700 dark:text-zinc-300">{new Date(item.occurredAt).toLocaleString()}</span>
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
