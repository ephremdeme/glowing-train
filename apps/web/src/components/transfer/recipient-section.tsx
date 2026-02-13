'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { readApiMessage } from '@/lib/client-api';
import type { RecipientDetail, RecipientSummary } from '@/lib/contracts';

interface RecipientSectionProps {
  token: string;
  initialRecipientId?: string | null;
  onRecipientReady: (detail: RecipientDetail | null) => void;
}

export function RecipientSection({ token, initialRecipientId = null, onRecipientReady }: RecipientSectionProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [recipients, setRecipients] = useState<RecipientSummary[]>([]);
  const [selectedRecipientId, setSelectedRecipientId] = useState(initialRecipientId ?? '');
  const [selectedRecipient, setSelectedRecipient] = useState<RecipientDetail | null>(null);

  const [recipientForm, setRecipientForm] = useState({
    fullName: 'Abebe Kebede',
    bankAccountName: 'Abebe Kebede',
    bankAccountNumber: '1002003004005',
    bankCode: 'CBE',
    countryCode: 'ET',
    nationalId: 'ET-TEST-0001'
  });

  const [kycForm, setKycForm] = useState({
    nationalId: 'ET-NEW-9001',
    nationalIdVerified: true,
    kycStatus: 'approved' as 'approved' | 'pending' | 'rejected'
  });

  const receiverApproved =
    selectedRecipient?.receiverKyc.kycStatus === 'approved' && Boolean(selectedRecipient.receiverKyc.nationalIdVerified);

  const label = useMemo(() => {
    if (!selectedRecipient) return 'No recipient selected';
    return `${selectedRecipient.fullName} • ${selectedRecipient.bankCode}`;
  }, [selectedRecipient]);

  async function loadRecipients(): Promise<void> {
    const response = await fetch('/api/client/recipients', {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
      | { recipients?: RecipientSummary[] }
      | { error?: { message?: string } };

    if (!response.ok || !('recipients' in payload)) {
      setMessage(readApiMessage(payload, 'Could not load recipients.'));
      return;
    }

    const next = payload.recipients ?? [];
    setRecipients(next);

    const nextRecipientId = selectedRecipientId || next[0]?.recipientId;
    if (nextRecipientId) {
      setSelectedRecipientId(nextRecipientId);
    }
  }

  async function loadRecipientDetail(recipientId: string): Promise<void> {
    const response = await fetch(`/api/client/recipients/${recipientId}`, {
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
      | RecipientDetail
      | { error?: { message?: string } };

    if (!response.ok || !('recipientId' in payload)) {
      setMessage(readApiMessage(payload, 'Could not load recipient detail.'));
      return;
    }

    setSelectedRecipient(payload);
    setKycForm({
      nationalId: 'ET-NEW-9001',
      nationalIdVerified: payload.receiverKyc.nationalIdVerified,
      kycStatus: payload.receiverKyc.kycStatus
    });
    onRecipientReady(payload);
  }

  useEffect(() => {
    void loadRecipients();
  }, []);

  useEffect(() => {
    if (!selectedRecipientId) {
      setSelectedRecipient(null);
      onRecipientReady(null);
      return;
    }
    void loadRecipientDetail(selectedRecipientId);
  }, [selectedRecipientId]);

  async function onCreateRecipient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/recipients', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...recipientForm,
          kycStatus: 'pending',
          nationalIdVerified: false
        })
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | { recipientId?: string }
        | { error?: { message?: string } };

      if (!response.ok || !('recipientId' in payload) || !payload.recipientId) {
        setMessage(readApiMessage(payload, 'Could not create recipient.'));
        return;
      }

      setMessage('Recipient saved. Complete receiver KYC before transfer.');
      await loadRecipients();
      setSelectedRecipientId(payload.recipientId);
    } finally {
      setBusy(false);
    }
  }

  async function remediateReceiverKyc(): Promise<void> {
    if (!selectedRecipientId) return;

    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/client/recipients/${selectedRecipientId}`, {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(kycForm)
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | RecipientDetail
        | { error?: { message?: string } };

      if (!response.ok || !('recipientId' in payload)) {
        setMessage(readApiMessage(payload, 'Could not update receiver KYC.'));
        return;
      }

      setMessage('Receiver KYC updated.');
      await loadRecipientDetail(selectedRecipientId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recipient details</CardTitle>
        <CardDescription>Bank payout destination in Ethiopia. Crypto remains offshore-only.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form className="grid gap-3" onSubmit={onCreateRecipient}>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="recipientName">Full name</Label>
              <Input
                id="recipientName"
                value={recipientForm.fullName}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, fullName: event.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipientBankCode">Bank code</Label>
              <Input
                id="recipientBankCode"
                value={recipientForm.bankCode}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, bankCode: event.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="recipientBankAccountName">Account name</Label>
              <Input
                id="recipientBankAccountName"
                value={recipientForm.bankAccountName}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, bankAccountName: event.target.value }))}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipientBankAccountNumber">Account number</Label>
              <Input
                id="recipientBankAccountNumber"
                value={recipientForm.bankAccountNumber}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, bankAccountNumber: event.target.value }))}
                required
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="recipientNationalId">National ID</Label>
            <Input
              id="recipientNationalId"
              value={recipientForm.nationalId}
              onChange={(event) => setRecipientForm((prev) => ({ ...prev, nationalId: event.target.value }))}
              required
            />
          </div>

          <Button type="submit" disabled={busy}>Save recipient</Button>
        </form>

        <div className="grid gap-2">
          <Label htmlFor="recipientSelector">Select recipient</Label>
          <select
            id="recipientSelector"
            className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm"
            value={selectedRecipientId}
            onChange={(event) => setSelectedRecipientId(event.target.value)}
          >
            <option value="">Choose recipient</option>
            {recipients.map((recipient) => (
              <option key={recipient.recipientId} value={recipient.recipientId}>
                {recipient.fullName} ({recipient.bankCode})
              </option>
            ))}
          </select>
        </div>

        {selectedRecipient ? (
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-medium">{label}</p>
              <Badge variant={receiverApproved ? 'success' : 'warning'}>
                {receiverApproved ? 'Receiver KYC Approved' : 'Receiver KYC Pending'}
              </Badge>
            </div>
            <p className="text-muted-foreground">National ID verified: {selectedRecipient.receiverKyc.nationalIdVerified ? 'yes' : 'no'}</p>
          </div>
        ) : null}

        {!receiverApproved && selectedRecipient ? (
          <div className="grid gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
            <div className="flex items-center gap-2 text-amber-700">
              <CheckCircle2 className="h-4 w-4" />
              Receiver must pass KYC before transfer creation.
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="grid gap-2 sm:col-span-2">
                <Label htmlFor="kycNationalId">New national ID</Label>
                <Input
                  id="kycNationalId"
                  value={kycForm.nationalId}
                  onChange={(event) => setKycForm((prev) => ({ ...prev, nationalId: event.target.value }))}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="kycStatus">KYC status</Label>
                <select
                  id="kycStatus"
                  className="h-11 rounded-2xl border border-input bg-background/70 px-4 text-sm"
                  value={kycForm.kycStatus}
                  onChange={(event) =>
                    setKycForm((prev) => ({ ...prev, kycStatus: event.target.value as 'approved' | 'pending' | 'rejected' }))
                  }
                >
                  <option value="approved">approved</option>
                  <option value="pending">pending</option>
                  <option value="rejected">rejected</option>
                </select>
              </div>
            </div>

            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={kycForm.nationalIdVerified}
                onChange={(event) => setKycForm((prev) => ({ ...prev, nationalIdVerified: event.target.checked }))}
              />
              Mark national ID as verified
            </label>

            <Button variant="outline" onClick={remediateReceiverKyc} disabled={busy}>
              Apply receiver KYC update
            </Button>
          </div>
        ) : null}

        {message ? (
          <Alert>
            <AlertTitle>Recipient updates</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
