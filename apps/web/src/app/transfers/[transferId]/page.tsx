'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import type { TransferDetailPayload, UiTransferStatus } from '@/lib/contracts';
import { ACCESS_TOKEN_KEY } from '@/lib/session';

type TransferStatusResponse = TransferDetailPayload & {
  backendStatus: string;
  uiStatus: UiTransferStatus;
};

const FLOW: UiTransferStatus[] = ['CREATED', 'AWAITING_DEPOSIT', 'CONFIRMING', 'SETTLED', 'PAYOUT_PENDING', 'PAID'];

function flowIndex(status: UiTransferStatus): number {
  if (status === 'FAILED') return -1;
  return FLOW.indexOf(status);
}

export default function TransferStatusPage({ params }: { params: { transferId: string } }) {
  const [data, setData] = useState<TransferStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const poll = async (): Promise<void> => {
      try {
        const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
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
        const payload = (await response.json()) as TransferStatusResponse | { error?: { message?: string } };
        if (!active) return;

        if (!response.ok || !('transfer' in payload)) {
          const message = 'error' in payload ? payload.error?.message : undefined;
          setError(message ?? 'Unable to load transfer status.');
          setLoading(false);
          return;
        }

        setData(payload);
        setError(null);
        setLoading(false);
      } catch {
        if (!active) return;
        setError('Status request failed.');
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
  }, [params.transferId]);

  const idx = useMemo(() => (data ? flowIndex(data.uiStatus) : -1), [data]);

  return (
    <main className="app-root">
      <section className="hero">
        <p className="eyebrow">Transfer Tracking</p>
        <h1>{params.transferId}</h1>
        <p>Status polling every 5 seconds.</p>
        <div className="row">
          <Link href="/">Back to sender flow</Link>
          <Link href={`/receipts/${params.transferId}` as Route}>Printable receipt</Link>
        </div>
      </section>

      <section className="panel">
        {loading ? <p>Loading transfer status...</p> : null}
        {error ? <p className="message">{error}</p> : null}

        {data ? (
          <>
            <p><strong>Backend status:</strong> {data.backendStatus}</p>
            <p><strong>UI status:</strong> {data.uiStatus}</p>
            <p><strong>Payout status:</strong> {data.payout?.status ?? 'n/a'}</p>
            <p><strong>Last update:</strong> {new Date(data.transitions[data.transitions.length - 1]?.occurredAt ?? data.transfer.createdAt).toLocaleString()}</p>

            {data.uiStatus === 'FAILED' ? <p className="message">Transfer requires manual review or failed payout.</p> : null}

            <ol className="timeline" aria-label="Transfer timeline">
              {FLOW.map((step, index) => (
                <li key={step} data-active={idx >= index ? 'true' : 'false'}>
                  {step}
                </li>
              ))}
            </ol>

            <div className="stack">
              <h2>Transition history</h2>
              {data.transitions.length === 0 ? <p className="hint">No transitions yet.</p> : null}
              {data.transitions.map((item, index) => (
                <div className="history-row" key={`${item.toState}-${index}`}>
                  <span>{item.fromState ?? '-'}</span>
                  <span>{item.toState}</span>
                  <span>{new Date(item.occurredAt).toLocaleString()}</span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </section>
    </main>
  );
}
