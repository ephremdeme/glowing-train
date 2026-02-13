'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import type { TransferHistoryItem } from '@/lib/contracts';
import { ACCESS_TOKEN_KEY } from '@/lib/session';

interface ApiErrorShape {
  error?: { message?: string };
}

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

export default function HistoryPage() {
  const [items, setItems] = useState<TransferHistoryItem[]>([]);
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadHistory(nextStatus: string): Promise<void> {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
    if (!token) {
      setError('Sign in first to view transfer history.');
      setLoading(false);
      return;
    }

    setLoading(true);
    const query = new URLSearchParams({ limit: '50' });
    if (nextStatus) {
      query.set('status', nextStatus);
    }

    const response = await fetch(`/api/client/transfers?${query.toString()}`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });

    const payload = (await response.json()) as { items?: TransferHistoryItem[] } | ApiErrorShape;
    if (!response.ok || !('items' in payload)) {
      const message = 'error' in payload ? payload.error?.message : undefined;
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
    <main className="app-root">
      <section className="hero">
        <p className="eyebrow">History</p>
        <h1>Sender Transfer History</h1>
        <p>Durable history from customer-scoped backend API.</p>
        <Link href="/">Back to sender flow</Link>
      </section>

      <section className="panel">
        <label>
          Status filter
          <select value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">all</option>
            <option value="AWAITING_FUNDING">AWAITING_FUNDING</option>
            <option value="FUNDING_CONFIRMED">FUNDING_CONFIRMED</option>
            <option value="PAYOUT_INITIATED">PAYOUT_INITIATED</option>
            <option value="PAYOUT_COMPLETED">PAYOUT_COMPLETED</option>
            <option value="PAYOUT_FAILED">PAYOUT_FAILED</option>
          </select>
        </label>

        {loading ? <p>Loading history...</p> : null}
        {error ? <p className="message">{error}</p> : null}
        {!loading && !error && items.length === 0 ? <p className="hint">No transfers found.</p> : null}

        {items.map((item) => (
          <div className="history-row" key={item.transferId}>
            <span>{item.transferId}</span>
            <span>{item.chain.toUpperCase()} {item.token}</span>
            <span>{currencyUsd(item.sendAmountUsd)}</span>
            <span>{item.status}</span>
            <Link href={`/transfers/${item.transferId}` as Route}>Status</Link>
            <Link href={`/receipts/${item.transferId}` as Route}>Receipt</Link>
          </div>
        ))}
      </section>
    </main>
  );
}
