'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useMemo, useState } from 'react';
import type {
  CustomerPayload,
  MePayload,
  QuoteSummary,
  RecipientDetail,
  RecipientSummary,
  SessionPayload,
  TransferSummary
} from '@/lib/contracts';
import { ACCESS_TOKEN_KEY } from '@/lib/session';
import { getWalletDeepLinkPresets } from '@/lib/wallet-deeplinks';

interface ApiErrorShape {
  error?: {
    code?: string;
    message?: string;
  };
}

const HISTORY_KEY = 'cryptopay:web:transfer-history';

function readError(data: unknown): string {
  const typed = data as ApiErrorShape;
  return typed.error?.message ?? 'Unexpected request failure.';
}

function currencyUsd(value: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
}

function currencyEtb(value: number): string {
  return new Intl.NumberFormat('en-ET', { style: 'currency', currency: 'ETB' }).format(value);
}

export function TransferFlow() {
  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [authBusy, setAuthBusy] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [quoteBusy, setQuoteBusy] = useState(false);
  const [recipientBusy, setRecipientBusy] = useState(false);
  const [kycBusy, setKycBusy] = useState(false);
  const [receiverKycBusy, setReceiverKycBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [registerForm, setRegisterForm] = useState({
    fullName: 'Diaspora Sender',
    countryCode: 'US',
    email: 'sender@example.com',
    password: 'password123'
  });
  const [loginForm, setLoginForm] = useState({
    email: 'sender@example.com',
    password: 'password123'
  });

  const [accessToken, setAccessToken] = useState<string>('');
  const [customer, setCustomer] = useState<CustomerPayload | null>(null);
  const [profile, setProfile] = useState<MePayload | null>(null);
  const [recipients, setRecipients] = useState<RecipientSummary[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientDetail | null>(null);

  const [receiverKycForm, setReceiverKycForm] = useState({
    nationalId: 'ET-NEW-9001',
    nationalIdVerified: true,
    kycStatus: 'approved' as 'approved' | 'pending' | 'rejected'
  });

  const [recipientForm, setRecipientForm] = useState({
    fullName: 'Abebe Kebede',
    bankAccountName: 'Abebe Kebede',
    bankAccountNumber: '1002003004005',
    bankCode: 'CBE',
    countryCode: 'ET',
    nationalId: 'ET-TEST-0001'
  });
  const [selectedRecipientId, setSelectedRecipientId] = useState<string>('');

  const [quoteForm, setQuoteForm] = useState({
    chain: 'base' as 'base' | 'solana',
    token: 'USDC' as 'USDC' | 'USDT',
    sendAmountUsd: 100,
    fxRateUsdToEtb: 140,
    feeUsd: 1,
    expiresInSeconds: 300
  });

  const [quote, setQuote] = useState<QuoteSummary | null>(null);
  const [transfer, setTransfer] = useState<TransferSummary | null>(null);
  const [history, setHistory] = useState<TransferSummary[]>([]);

  useEffect(() => {
    const token = window.localStorage.getItem(ACCESS_TOKEN_KEY) ?? '';
    if (token) {
      setAccessToken(token);
    }

    const rawHistory = window.localStorage.getItem(HISTORY_KEY);
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory) as TransferSummary[];
        setHistory(Array.isArray(parsed) ? parsed : []);
      } catch {
        setHistory([]);
      }
    }
  }, []);

  useEffect(() => {
    if (!accessToken) return;
    void loadSessionContext(accessToken);
  }, [accessToken]);

  useEffect(() => {
    if (!selectedRecipientId || !accessToken) {
      setSelectedRecipient(null);
      return;
    }
    void loadRecipientDetail(selectedRecipientId, accessToken);
  }, [selectedRecipientId, accessToken]);

  async function loadRecipientDetail(recipientId: string, token: string): Promise<void> {
    const response = await fetch(`/api/client/recipients/${recipientId}`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json()) as RecipientDetail | ApiErrorShape;
    if (!response.ok || !('recipientId' in payload)) {
      setMessage(readError(payload));
      return;
    }
    setSelectedRecipient(payload);
    setReceiverKycForm({
      nationalId: 'ET-NEW-9001',
      nationalIdVerified: payload.receiverKyc.nationalIdVerified,
      kycStatus: payload.receiverKyc.kycStatus
    });
  }

  async function loadSessionContext(token: string): Promise<void> {
    const meResponse = await fetch('/api/client/me', {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const mePayload = (await meResponse.json()) as MePayload | ApiErrorShape;
    if (!meResponse.ok) {
      setMessage(readError(mePayload));
      return;
    }
    setProfile(mePayload as MePayload);

    const recipientResponse = await fetch('/api/client/recipients', {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const recipientPayload = (await recipientResponse.json()) as { recipients?: RecipientSummary[] } | ApiErrorShape;
    if (!recipientResponse.ok) {
      setMessage(readError(recipientPayload));
      return;
    }

    const list = 'recipients' in recipientPayload ? recipientPayload.recipients ?? [] : [];
    setRecipients(list);
    if (!selectedRecipientId && list[0]) {
      setSelectedRecipientId(list[0].recipientId);
    }
  }

  async function refreshSenderKyc(): Promise<void> {
    if (!accessToken) return;

    setKycBusy(true);
    try {
      const response = await fetch('/api/client/kyc/sender/status', {
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      const payload = (await response.json()) as
        | {
            kycStatus?: 'approved' | 'pending' | 'rejected';
            reasonCode?: string | null;
            applicantId?: string | null;
            lastReviewedAt?: string | null;
          }
        | ApiErrorShape;

      if (!response.ok || !('kycStatus' in payload)) {
        setMessage(readError(payload));
        return;
      }

      setProfile((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          senderKyc: {
            kycStatus: payload.kycStatus ?? prev.senderKyc.kycStatus,
            reasonCode: payload.reasonCode ?? null,
            applicantId: payload.applicantId ?? null,
            lastReviewedAt: payload.lastReviewedAt ?? null
          }
        };
      });
      setMessage('Sender KYC status refreshed.');
    } finally {
      setKycBusy(false);
    }
  }

  async function startSenderKyc(): Promise<void> {
    if (!accessToken) return;

    setKycBusy(true);
    try {
      const response = await fetch('/api/client/kyc/sender/sumsub-token', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`
        }
      });
      const payload = (await response.json()) as { token?: string } | ApiErrorShape;
      if (!response.ok || !('token' in payload)) {
        setMessage(readError(payload));
        return;
      }
      setMessage('Sender KYC verification session started. Refresh status after completing provider flow.');
      await refreshSenderKyc();
    } finally {
      setKycBusy(false);
    }
  }

  async function remediateReceiverKyc(): Promise<void> {
    if (!accessToken || !selectedRecipientId) {
      return;
    }

    setReceiverKycBusy(true);
    try {
      const response = await fetch(`/api/client/recipients/${selectedRecipientId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(receiverKycForm)
      });
      const payload = (await response.json()) as RecipientDetail | ApiErrorShape;
      if (!response.ok || !('recipientId' in payload)) {
        setMessage(readError(payload));
        return;
      }

      await loadRecipientDetail(selectedRecipientId, accessToken);
      setMessage('Receiver KYC updated.');
    } finally {
      setReceiverKycBusy(false);
    }
  }

  async function onRegister(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(registerForm)
      });
      const payload = (await response.json()) as
        | { customer?: CustomerPayload; session?: SessionPayload }
        | ApiErrorShape;

      if (!response.ok || !('session' in payload) || !payload.session) {
        setMessage(readError(payload));
        return;
      }

      setCustomer(payload.customer ?? null);
      setAccessToken(payload.session.accessToken);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.session.accessToken);
      setMessage('Account created. You can now create transfer quotes.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function onLogin(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setAuthBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/auth/login/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(loginForm)
      });
      const payload = (await response.json()) as
        | { customer?: CustomerPayload; session?: SessionPayload }
        | ApiErrorShape;

      if (!response.ok || !('session' in payload) || !payload.session) {
        setMessage(readError(payload));
        return;
      }

      setCustomer(payload.customer ?? null);
      setAccessToken(payload.session.accessToken);
      window.localStorage.setItem(ACCESS_TOKEN_KEY, payload.session.accessToken);
      setMessage('Signed in.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function onCreateRecipient(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!accessToken) {
      setMessage('Sign in first.');
      return;
    }

    setRecipientBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/recipients', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          ...recipientForm,
          kycStatus: 'pending',
          nationalIdVerified: false
        })
      });
      const payload = (await response.json()) as { recipientId?: string } & ApiErrorShape;

      if (!response.ok || !payload.recipientId) {
        setMessage(readError(payload));
        return;
      }

      await loadSessionContext(accessToken);
      setSelectedRecipientId(payload.recipientId);
      setMessage('Recipient saved. Complete receiver KYC below before transfer.');
    } finally {
      setRecipientBusy(false);
    }
  }

  async function onCreateQuote(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setQuoteBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/quotes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(quoteForm)
      });
      const payload = (await response.json()) as QuoteSummary | ApiErrorShape;

      if (!response.ok || !('quoteId' in payload)) {
        setMessage(readError(payload));
        return;
      }

      setQuote(payload);
      setTransfer(null);
      setMessage(`Quote locked until ${new Date(payload.expiresAt).toLocaleTimeString()}.`);
    } finally {
      setQuoteBusy(false);
    }
  }

  async function onCreateTransfer(): Promise<void> {
    if (!accessToken || !quote || !selectedRecipientId) {
      setMessage('Sign in, choose recipient, and create quote first.');
      return;
    }

    setTransferBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/transfers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          quoteId: quote.quoteId,
          recipientId: selectedRecipientId,
          quote
        })
      });
      const payload = (await response.json()) as TransferSummary | ApiErrorShape;

      if (!response.ok || !('transferId' in payload)) {
        setMessage(readError(payload));
        return;
      }

      setTransfer(payload);
      const nextHistory = [payload, ...history.filter((item) => item.transferId !== payload.transferId)].slice(0, 10);
      setHistory(nextHistory);
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(nextHistory));
      setMessage('Transfer created. Send funds from your own wallet to the deposit address.');
    } finally {
      setTransferBusy(false);
    }
  }

  async function onCopy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      setMessage('Copied to clipboard.');
    } catch {
      setMessage('Copy failed.');
    }
  }

  const senderKycApproved = profile?.senderKyc.kycStatus === 'approved';
  const receiverKycApproved =
    selectedRecipient?.receiverKyc.kycStatus === 'approved' && selectedRecipient.receiverKyc.nationalIdVerified;

  const canTransfer = Boolean(accessToken && quote && selectedRecipientId && senderKycApproved && receiverKycApproved);

  const quotePreview = useMemo(() => {
    const recipientAmountEtb = (quoteForm.sendAmountUsd - quoteForm.feeUsd) * quoteForm.fxRateUsdToEtb;
    return {
      recipientAmountEtb,
      netUsd: quoteForm.sendAmountUsd - quoteForm.feeUsd
    };
  }, [quoteForm]);

  const walletPresets = transfer
    ? getWalletDeepLinkPresets({
        chain: transfer.quote.chain,
        token: transfer.quote.token,
        to: transfer.depositAddress,
        amountUsd: transfer.quote.sendAmountUsd
      })
    : [];

  return (
    <main className="app-root">
      <section className="hero">
        <p className="eyebrow">CryptoPay Sender</p>
        <h1>Fast ETB payout. Sender stays non-custodial.</h1>
        <p>
          Send USDC/USDT from your own wallet on Base or Solana. We never hold your keys or balances. Receiver payout is ETB via bank rail.
        </p>
        <div className="chips">
          <span>Limit: $2,000</span>
          <span>SLA target: about 10 minutes after confirmation</span>
          <span>Telebirr: feature-flagged off by default</span>
        </div>
        <div className="row">
          <Link href={'/history' as Route}>Transfer history</Link>
          {transfer ? <Link href={`/receipts/${transfer.transferId}` as Route}>Printable receipt</Link> : null}
        </div>
      </section>

      <section className="grid">
        <article className="panel" aria-labelledby="auth-title">
          <h2 id="auth-title">1. Access</h2>
          <div className="toggle" role="tablist" aria-label="Auth mode">
            <button type="button" role="tab" aria-selected={mode === 'register'} onClick={() => setMode('register')}>Register</button>
            <button type="button" role="tab" aria-selected={mode === 'login'} onClick={() => setMode('login')}>Sign in</button>
          </div>

          {mode === 'register' ? (
            <form className="stack" onSubmit={onRegister}>
              <label>
                Full name
                <input value={registerForm.fullName} onChange={(e) => setRegisterForm({ ...registerForm, fullName: e.target.value })} />
              </label>
              <label>
                Country code
                <input value={registerForm.countryCode} onChange={(e) => setRegisterForm({ ...registerForm, countryCode: e.target.value.toUpperCase() })} maxLength={2} />
              </label>
              <label>
                Email
                <input type="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} />
              </label>
              <label>
                Password
                <input type="password" value={registerForm.password} onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })} />
              </label>
              <button type="submit" disabled={authBusy}>{authBusy ? 'Working...' : 'Create account'}</button>
            </form>
          ) : (
            <form className="stack" onSubmit={onLogin}>
              <label>
                Email
                <input type="email" value={loginForm.email} onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })} />
              </label>
              <label>
                Password
                <input type="password" value={loginForm.password} onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })} />
              </label>
              <button type="submit" disabled={authBusy}>{authBusy ? 'Working...' : 'Sign in'}</button>
            </form>
          )}

          <div className="meta">
            <p><strong>Customer:</strong> {customer?.customerId ?? profile?.customerId ?? 'Not signed in'}</p>
            <p><strong>Sender KYC:</strong> {profile?.senderKyc.kycStatus ?? 'unknown'}</p>
          </div>

          {!senderKycApproved && profile ? (
            <div className="blocker">
              <p><strong>Sender KYC blocked:</strong> {profile.senderKyc.kycStatus}</p>
              {profile.senderKyc.reasonCode ? <p>Reason: {profile.senderKyc.reasonCode}</p> : null}
              <div className="row">
                <button type="button" onClick={refreshSenderKyc} disabled={kycBusy}>Refresh KYC status</button>
                <button type="button" onClick={startSenderKyc} disabled={kycBusy}>Restart verification</button>
              </div>
            </div>
          ) : null}
        </article>

        <article className="panel" aria-labelledby="recipient-title">
          <h2 id="recipient-title">2. Recipient</h2>
          <form className="stack" onSubmit={onCreateRecipient}>
            <label>
              Full name
              <input value={recipientForm.fullName} onChange={(e) => setRecipientForm({ ...recipientForm, fullName: e.target.value })} />
            </label>
            <label>
              Bank account name
              <input value={recipientForm.bankAccountName} onChange={(e) => setRecipientForm({ ...recipientForm, bankAccountName: e.target.value })} />
            </label>
            <label>
              Bank account number
              <input value={recipientForm.bankAccountNumber} onChange={(e) => setRecipientForm({ ...recipientForm, bankAccountNumber: e.target.value })} />
            </label>
            <label>
              Bank code
              <input value={recipientForm.bankCode} onChange={(e) => setRecipientForm({ ...recipientForm, bankCode: e.target.value })} />
            </label>
            <label>
              National ID (receiver KYC)
              <input value={recipientForm.nationalId} onChange={(e) => setRecipientForm({ ...recipientForm, nationalId: e.target.value })} />
            </label>
            <button type="submit" disabled={recipientBusy || !accessToken}>{recipientBusy ? 'Saving...' : 'Save recipient'}</button>
          </form>

          <label>
            Active recipients
            <select
              value={selectedRecipientId}
              onChange={(e) => setSelectedRecipientId(e.target.value)}
              aria-label="Active recipients"
            >
              <option value="">Select recipient</option>
              {recipients.map((recipient) => (
                <option key={recipient.recipientId} value={recipient.recipientId}>
                  {recipient.fullName} ({recipient.bankCode})
                </option>
              ))}
            </select>
          </label>

          {!receiverKycApproved && selectedRecipient ? (
            <div className="blocker">
              <p><strong>Receiver KYC blocked:</strong> {selectedRecipient.receiverKyc.kycStatus}</p>
              <p>National ID verified: {selectedRecipient.receiverKyc.nationalIdVerified ? 'yes' : 'no'}</p>
              <label>
                New National ID
                <input
                  value={receiverKycForm.nationalId}
                  onChange={(e) => setReceiverKycForm({ ...receiverKycForm, nationalId: e.target.value })}
                />
              </label>
              <label>
                KYC status
                <select
                  value={receiverKycForm.kycStatus}
                  onChange={(e) => setReceiverKycForm({ ...receiverKycForm, kycStatus: e.target.value as 'approved' | 'pending' | 'rejected' })}
                >
                  <option value="approved">approved</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                </select>
              </label>
              <label className="inline-check">
                <input
                  type="checkbox"
                  checked={receiverKycForm.nationalIdVerified}
                  onChange={(e) => setReceiverKycForm({ ...receiverKycForm, nationalIdVerified: e.target.checked })}
                />
                Mark National ID as verified
              </label>
              <button type="button" onClick={remediateReceiverKyc} disabled={receiverKycBusy}>
                {receiverKycBusy ? 'Updating...' : 'Apply receiver KYC update'}
              </button>
            </div>
          ) : null}
        </article>

        <article className="panel" aria-labelledby="quote-title">
          <h2 id="quote-title">3. Quote</h2>
          <form className="stack" onSubmit={onCreateQuote}>
            <label>
              Chain
              <select value={quoteForm.chain} onChange={(e) => setQuoteForm({ ...quoteForm, chain: e.target.value as 'base' | 'solana' })}>
                <option value="base">Base</option>
                <option value="solana">Solana</option>
              </select>
            </label>
            <label>
              Token
              <select value={quoteForm.token} onChange={(e) => setQuoteForm({ ...quoteForm, token: e.target.value as 'USDC' | 'USDT' })}>
                <option value="USDC">USDC</option>
                <option value="USDT">USDT</option>
              </select>
            </label>
            <label>
              Send amount (USD)
              <input
                type="number"
                step="0.01"
                min="1"
                max="2000"
                value={quoteForm.sendAmountUsd}
                onChange={(e) => setQuoteForm({ ...quoteForm, sendAmountUsd: Number(e.target.value) })}
              />
            </label>
            <label>
              FX rate (USD to ETB)
              <input type="number" step="0.0001" value={quoteForm.fxRateUsdToEtb} onChange={(e) => setQuoteForm({ ...quoteForm, fxRateUsdToEtb: Number(e.target.value) })} />
            </label>
            <label>
              Fee (USD)
              <input type="number" step="0.01" min="0" value={quoteForm.feeUsd} onChange={(e) => setQuoteForm({ ...quoteForm, feeUsd: Number(e.target.value) })} />
            </label>
            <button type="submit" disabled={quoteBusy || quoteForm.sendAmountUsd > 2000 || quoteForm.sendAmountUsd <= 0}>
              {quoteBusy ? 'Locking...' : 'Lock quote'}
            </button>
          </form>

          <div className="meta">
            <p><strong>Net send:</strong> {currencyUsd(quotePreview.netUsd)}</p>
            <p><strong>Estimated recipient:</strong> {currencyEtb(quotePreview.recipientAmountEtb)}</p>
          </div>
        </article>

        <article className="panel" aria-labelledby="transfer-title">
          <h2 id="transfer-title">4. Transfer + Deposit</h2>
          <button onClick={onCreateTransfer} disabled={!canTransfer || transferBusy}>
            {transferBusy ? 'Creating transfer...' : 'Create transfer'}
          </button>
          {!canTransfer ? <p className="hint">Require signed-in sender, approved sender KYC, approved receiver KYC, quote, and recipient.</p> : null}

          {transfer ? (
            <div className="stack instructions" aria-live="polite">
              <p><strong>Transfer ID:</strong> {transfer.transferId}</p>
              <p><strong>Network:</strong> {transfer.quote.chain}</p>
              <p><strong>Token:</strong> {transfer.quote.token}</p>
              <p><strong>Amount to send:</strong> {currencyUsd(transfer.quote.sendAmountUsd)}</p>
              <p><strong>Deposit address:</strong> <code>{transfer.depositAddress}</code></p>
              <p><strong>Quote expiry:</strong> {new Date(transfer.quote.expiresAt).toLocaleString()}</p>

              <div className="row">
                <button type="button" onClick={() => onCopy(transfer.depositAddress)}>Copy address</button>
                <button
                  type="button"
                  onClick={() =>
                    onCopy(
                      `Network: ${transfer.quote.chain}\nToken: ${transfer.quote.token}\nAddress: ${transfer.depositAddress}\nAmountUSD: ${transfer.quote.sendAmountUsd}`
                    )
                  }
                >
                  Copy full deposit details
                </button>
              </div>

              <div className="row">
                {walletPresets.map((preset) => (
                  <a key={preset.id} href={preset.href} target="_blank" rel="noreferrer">
                    {preset.label}
                  </a>
                ))}
                <Link href={`/transfers/${transfer.transferId}` as Route}>Track transfer status</Link>
                <Link href={`/receipts/${transfer.transferId}` as Route}>Open printable receipt</Link>
              </div>
            </div>
          ) : null}
        </article>
      </section>

      <section className="panel" aria-labelledby="history-title">
        <h2 id="history-title">Recent Transfers</h2>
        {history.length === 0 ? <p className="hint">No transfers in this browser session yet.</p> : null}
        {history.map((item) => (
          <div className="history-row" key={item.transferId}>
            <span>{item.transferId}</span>
            <span>{item.quote.chain.toUpperCase()} {item.quote.token}</span>
            <span>{currencyUsd(item.quote.sendAmountUsd)}</span>
            <Link href={`/transfers/${item.transferId}` as Route}>Open status</Link>
          </div>
        ))}
      </section>

      {message ? <p className="message" role="status">{message}</p> : null}
    </main>
  );
}
