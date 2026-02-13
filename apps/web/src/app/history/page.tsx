'use client';

import { useEffect, useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { HistoryTable } from '@/components/history/history-table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TransferHistoryItem } from '@/lib/contracts';
import { readAccessToken } from '@/lib/session';

interface ApiErrorShape {
  error?: { message?: string };
}

export default function HistoryPage() {
  const [items, setItems] = useState<TransferHistoryItem[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(nextStatus: string): Promise<void> {
    const token = readAccessToken();
    if (!token) {
      setError('Sign in first to view transfer history.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const query = new URLSearchParams({ limit: '50' });
    if (nextStatus) query.set('status', nextStatus);

    const response = await fetch(`/api/client/transfers?${query.toString()}`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
      | { items?: TransferHistoryItem[] }
      | ApiErrorShape;

    if (!response.ok || !('items' in payload)) {
      const message = 'error' in payload ? payload.error?.message : null;
      setError(message ?? 'Unable to load transfer history.');
      setItems([]);
      setLoading(false);
      return;
    }

    setItems(payload.items ?? []);
    setError(null);
    setLoading(false);
  }

  useEffect(() => {
    void loadHistory(status);
  }, [status]);

  return (
    <RouteGuard requireAuth>
      <div className="grid gap-6">
        <section className="grid gap-3 rounded-3xl border border-border/70 bg-card/70 p-6 shadow-panel md:p-8">
          <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Transfer history</h1>
          <p className="max-w-3xl text-sm text-muted-foreground md:text-base">
            Review your sender transfers, then open receipt or status pages for a full audit trail.
          </p>
        </section>

        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Filters</CardTitle>
            <CardDescription>Use status filter to narrow down recent transfers.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3">
            <label className="grid gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <select
                className="h-11 rounded-2xl border border-input bg-background px-4 text-sm"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">All</option>
                <option value="TRANSFER_CREATED">TRANSFER_CREATED</option>
                <option value="AWAITING_FUNDING">AWAITING_FUNDING</option>
                <option value="FUNDING_CONFIRMED">FUNDING_CONFIRMED</option>
                <option value="PAYOUT_INITIATED">PAYOUT_INITIATED</option>
                <option value="PAYOUT_COMPLETED">PAYOUT_COMPLETED</option>
                <option value="PAYOUT_FAILED">PAYOUT_FAILED</option>
              </select>
            </label>
            <Badge variant="outline">Bank payout only in MVP</Badge>
          </CardContent>
        </Card>

        {loading ? <p className="text-sm text-muted-foreground">Loading history...</p> : null}

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>History load failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {!loading && !error ? <HistoryTable items={items} /> : null}
      </div>
    </RouteGuard>
  );
}
