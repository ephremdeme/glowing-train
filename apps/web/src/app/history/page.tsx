'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { Clock, Filter, History } from 'lucide-react';
import { RouteGuard } from '@/components/route-guard';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { readApiMessage } from '@/lib/client-api';
import { readAccessToken } from '@/lib/session';
import { toStatusChipVariant } from '@/lib/status';
import type { StatusChipVariant, TransferHistoryItem, UiTransferStatus } from '@/lib/contracts';

function badgeVariant(variant: StatusChipVariant): 'outline' | 'warning' | 'success' | 'destructive' | 'secondary' {
  if (variant === 'success') return 'success';
  if (variant === 'danger') return 'destructive';
  if (variant === 'warning') return 'warning';
  if (variant === 'info') return 'secondary';
  return 'outline';
}

const ALL_STATUSES: UiTransferStatus[] = ['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID', 'FAILED'];

export default function HistoryPage() {
  const token = readAccessToken()!;
  const [rows, setRows] = useState<TransferHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<UiTransferStatus | 'ALL'>('ALL');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/client/transfers', {
          headers: { authorization: `Bearer ${token}` }
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(readApiMessage(body, 'Failed to load transfers.'));
          setLoading(false);
          return;
        }
        const data = (await res.json()) as { transfers: TransferHistoryItem[] };
        setRows(data.transfers ?? []);
      } catch {
        setError('Network error.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  const filtered = filter === 'ALL' ? rows : rows.filter((r) => r.status === filter);

  return (
    <RouteGuard>
      <div className="grid gap-6">
        {/* Page header */}
        <section className="grid gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <History className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-[-0.022em] md:text-3xl">Transfer history</h1>
              <p className="text-[15px] text-muted-foreground">All past and active transfers.</p>
            </div>
          </div>
        </section>

        {/* Filters */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant={filter === 'ALL' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('ALL')}
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            All
          </Button>
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              variant={filter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(s)}
            >
              {s}
            </Button>
          ))}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Transfer list */}
        {!loading && filtered.length === 0 && (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No transfers found.
            </CardContent>
          </Card>
        )}

        <div className="grid gap-3">
          {filtered.map((row) => (
            <Link key={row.transferId} href={`/transfers/${row.transferId}` as Route}>
              <Card className="lift-hover cursor-pointer transition">
                <CardContent className="flex flex-wrap items-center gap-4 p-5">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/40 text-muted-foreground">
                    <Clock className="h-4 w-4" />
                  </div>
                  <div className="grid min-w-0 flex-1 gap-0.5">
                    <p className="truncate text-sm font-medium">{row.transferId}</p>
                    <p className="text-xs text-muted-foreground">
                      {row.sendAmountUsd} USD → {row.chain}/{row.token} • {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <Badge variant={badgeVariant(toStatusChipVariant(row.status as UiTransferStatus))}>{row.status}</Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </RouteGuard>
  );
}
