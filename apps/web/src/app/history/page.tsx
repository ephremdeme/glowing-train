'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { ArrowRight, CircleDollarSign, Filter, History } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { readApiMessage } from '@/lib/client-api';
import { currencyEtb, formatStableAmount } from '@/lib/format';
import { readAccessToken } from '@/lib/session';
import { mapToUiStatus, toStatusChipVariant } from '@/lib/status';
import type { StatusChipVariant, TransferHistoryItem, UiTransferStatus } from '@/lib/contracts';

function badgeVariant(variant: StatusChipVariant): 'outline' | 'warning' | 'success' | 'destructive' | 'secondary' {
  if (variant === 'success') return 'success';
  if (variant === 'danger') return 'destructive';
  if (variant === 'warning') return 'warning';
  if (variant === 'info') return 'secondary';
  return 'outline';
}

const ALL_STATUSES: UiTransferStatus[] = ['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID', 'FAILED'];

function toHistoryUiStatus(backendStatus: string): UiTransferStatus {
  if ((ALL_STATUSES as string[]).includes(backendStatus)) {
    return backendStatus as UiTransferStatus;
  }
  return mapToUiStatus(backendStatus, null, null);
}

export default function HistoryPage() {
  return (
    <RouteGuard requireAuth>
      <HistoryPageContent />
    </RouteGuard>
  );
}

function HistoryPageContent() {
  const token = readAccessToken();
  const [rows, setRows] = useState<TransferHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UiTransferStatus | 'ALL'>('ALL');

  useEffect(() => {
    (async () => {
      try {
        if (!token) {
          setError('Sign in first to view transfer history.');
          setLoading(false);
          return;
        }

        const res = await fetch('/api/client/transfers', {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(readApiMessage(body, 'Failed to load transfers.'));
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { items?: TransferHistoryItem[] };
        setRows(data.items ?? []);
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const filtered = filter === 'ALL' ? rows : rows.filter((r) => toHistoryUiStatus(r.status) === filter);

  return (
    <div className="grid gap-6">
      <section>
        <Card className="overflow-hidden border-border/50 bg-white shadow-apple dark:border-border/70 dark:bg-gradient-to-br dark:from-background dark:via-background dark:to-primary/5 dark:shadow-none">
          <CardContent className="relative p-6 md:p-7">
            <div className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-primary/[0.12] blur-2xl dark:bg-primary/10" />
            <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-sky-500/[0.08] blur-2xl dark:bg-sky-500/10" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div className="grid gap-2">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/20 bg-primary/10 text-primary">
                    <History className="h-5 w-5" />
                  </div>
                  <h1 className="text-2xl font-semibold tracking-[-0.02em] text-zinc-900 dark:text-zinc-100 md:text-3xl">
                    Transfer history
                  </h1>
                </div>
                <p className="text-sm text-zinc-700 dark:text-zinc-300">
                  Review every transfer with expected funding, funded amount, and recipient payout value.
                </p>
              </div>
              <Badge variant="outline" className="border-primary/30 bg-primary/5 px-3 py-1 text-primary">
                {rows.length} total
              </Badge>
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="rounded-2xl border border-border/50 bg-white/80 p-3 shadow-sm dark:border-border/70 dark:bg-muted/20 dark:shadow-none md:p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">
          <Filter className="h-3.5 w-3.5" />
          Filter by status
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant={filter === 'ALL' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('ALL')}>
            All
          </Button>
          {ALL_STATUSES.map((status) => (
            <Button
              key={status}
              variant={filter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(status)}
            >
              {status.replaceAll('_', ' ')}
            </Button>
          ))}
        </div>
      </div>

      {loading ? <p className="text-sm text-muted-foreground">Loading transfer history...</p> : null}
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="grid place-items-center gap-2 p-10 text-center">
            <CircleDollarSign className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">No transfers found for this filter.</p>
            <p className="text-xs text-muted-foreground">Create a new transfer to start your history timeline.</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-3">
        {filtered.map((row) => {
          const uiStatus = toHistoryUiStatus(row.status);
          const statusVariant = toStatusChipVariant(uiStatus);
          const transferDate = new Date(row.createdAt);
          return (
            <Link key={row.transferId} href={`/transfers/${row.transferId}` as Route}>
              <Card className="group cursor-pointer overflow-hidden border-border/50 bg-white shadow-apple transition-[box-shadow,border-color,transform] duration-400 ease-[cubic-bezier(0.25,0.1,0.25,1)] hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-apple-hover dark:border-border/70 dark:bg-gradient-to-br dark:from-card dark:via-card dark:to-muted/10 dark:shadow-none dark:hover:border-border/50">
                <CardContent className="grid gap-4 p-5 md:grid-cols-[1.1fr,1fr,auto] md:items-center">
                  <div className="grid gap-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
                        {row.recipientName?.trim() || 'Recipient'}
                      </p>
                      <Badge variant="outline" className="border-border/70 bg-background/70 text-[10px] uppercase">
                        {row.chain}
                      </Badge>
                      <Badge variant="outline" className="border-border/70 bg-background/70 text-[10px] uppercase">
                        {row.token}
                      </Badge>
                    </div>
                    <p className="truncate font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{row.transferId}</p>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300">
                      {transferDate.toLocaleDateString()} • {transferDate.toLocaleTimeString()}
                    </p>
                  </div>

                  <div className="grid gap-2 rounded-xl border border-border/50 bg-muted/30 p-3 dark:border-border/60 dark:bg-background/70">
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">Expected funding</p>
                      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                        {formatStableAmount(row.sendAmountUsd, row.token)}
                      </p>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">Recipient payout</p>
                      <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">{currencyEtb(row.recipientAmountEtb)}</p>
                    </div>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-zinc-600 dark:text-zinc-400">Funded on-chain</p>
                      <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                        {row.fundedAmountUsd == null ? 'Pending' : formatStableAmount(row.fundedAmountUsd, row.token)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 md:justify-end">
                    <Badge variant={badgeVariant(statusVariant)}>{uiStatus.replaceAll('_', ' ')}</Badge>
                    <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
