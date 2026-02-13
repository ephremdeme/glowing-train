'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import type { TransferDetailPayload, UiTransferStatus } from '@/lib/contracts';
import { ACCESS_TOKEN_KEY } from '@/lib/session';

interface ApiErrorShape {
  error?: { message?: string };
}

type TransferStatusResponse = TransferDetailPayload & {
  backendStatus: string;
  uiStatus: UiTransferStatus;
};

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

export default function ReceiptPage({ params }: { params: { transferId: string } }) {
  const [data, setData] = useState<TransferStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const load = async (): Promise<void> => {
      const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
      if (!token) {
        setError('Sign in first to view receipts.');
        return;
      }

      const response = await fetch(`/api/client/transfers/${params.transferId}`, {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      const payload = (await response.json()) as TransferStatusResponse | ApiErrorShape;
      if (!active) return;

      if (!response.ok || !('transfer' in payload)) {
        const message = 'error' in payload ? payload.error?.message : undefined;
        setError(message ?? 'Unable to load receipt.');
        return;
      }

      setData(payload);
      setError(null);
    };

    void load();
    return () => {
      active = false;
    };
  }, [params.transferId]);

  return (
    <main className="app-root print-root">
      <section className="hero no-print">
        <p className="eyebrow">Receipt</p>
        <h1>{params.transferId}</h1>
        <div className="row">
          <button type="button" onClick={() => window.print()}>Print receipt</button>
          <Link href={`/transfers/${params.transferId}` as Route}>Back to status</Link>
          <Link href={'/history' as Route}>Back to history</Link>
        </div>
      </section>

      {error ? <p className="message">{error}</p> : null}

      {data ? (
        <section className="panel receipt-card">
          <h2>CryptoPay Transfer Receipt</h2>
          <div className="receipt-grid">
            <p><strong>Transfer ID</strong><span>{data.transfer.transferId}</span></p>
            <p><strong>Created At</strong><span>{new Date(data.transfer.createdAt).toLocaleString()}</span></p>
            <p><strong>Status</strong><span>{data.transfer.status}</span></p>
            <p><strong>UI Status</strong><span>{data.uiStatus}</span></p>
          </div>

          <h3>Funding</h3>
          <div className="receipt-grid">
            <p><strong>Chain / Token</strong><span>{data.transfer.chain.toUpperCase()} {data.transfer.token}</span></p>
            <p><strong>Deposit Address</strong><span>{data.transfer.depositAddress ?? 'n/a'}</span></p>
            <p><strong>Send Amount</strong><span>{currencyUsd(data.transfer.sendAmountUsd)}</span></p>
            <p><strong>Quote Expiry</strong><span>{new Date(data.quote.expiresAt).toLocaleString()}</span></p>
          </div>

          <h3>Recipient Payout</h3>
          <div className="receipt-grid">
            <p><strong>Recipient</strong><span>{data.recipient.fullName ?? 'n/a'}</span></p>
            <p><strong>Bank</strong><span>{data.recipient.bankCode ?? 'n/a'}</span></p>
            <p><strong>Bank Account</strong><span>{data.recipient.bankAccountNumber ?? 'n/a'}</span></p>
            <p><strong>Expected ETB</strong><span>{currencyEtb(data.quote.recipientAmountEtb)}</span></p>
            <p><strong>Payout Status</strong><span>{data.payout?.status ?? 'not started'}</span></p>
            <p><strong>Payout Amount ETB</strong><span>{data.payout ? currencyEtb(data.payout.amountEtb) : 'n/a'}</span></p>
          </div>

          <h3>Transition Timeline</h3>
          <ol className="timeline">
            {data.transitions.map((transition, index) => (
              <li key={`${transition.toState}-${index}`} data-active="true">
                {transition.fromState ?? '-'} → {transition.toState} ({new Date(transition.occurredAt).toLocaleString()})
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </main>
  );
}
