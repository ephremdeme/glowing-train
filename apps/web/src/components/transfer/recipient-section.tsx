'use client';

import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Building2, UserRoundCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCreateRecipient, useRecipientDetail, useRecipients } from '@/features/remittance/hooks';
import type { RecipientDetail } from '@/lib/contracts';

interface RecipientSectionProps {
  token: string;
  senderKycApproved: boolean;
  initialRecipientId?: string | null;
  onRecipientReady: (detail: RecipientDetail | null) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = error.message.trim();
  if (/token expired|jwt expired|session expired/i.test(message)) {
    return 'Session expired. Sign in again.';
  }
  return message || fallback;
}

export function RecipientSection({ token, senderKycApproved, initialRecipientId = null, onRecipientReady }: RecipientSectionProps) {
  const [selectedRecipientId, setSelectedRecipientId] = useState(initialRecipientId ?? '');
  const [notice, setNotice] = useState<string | null>(null);
  const [recipientForm, setRecipientForm] = useState({
    fullName: 'Abebe Kebede',
    bankAccountName: 'Abebe Kebede',
    bankAccountNumber: '1002003004005',
    bankCode: 'CBE',
    countryCode: 'ET',
    phoneE164: ''
  });

  const recipientsQuery = useRecipients(token);
  const recipientDetailQuery = useRecipientDetail(token, selectedRecipientId || null);
  const createRecipientMutation = useCreateRecipient(token);

  const recipients = recipientsQuery.data ?? [];
  const selectedRecipient = recipientDetailQuery.data ?? null;

  useEffect(() => {
    if (!selectedRecipientId && recipients[0]) {
      setSelectedRecipientId(recipients[0].recipientId);
    }
  }, [recipients, selectedRecipientId]);

  useEffect(() => {
    if (initialRecipientId && initialRecipientId !== selectedRecipientId) {
      setSelectedRecipientId(initialRecipientId);
    }
  }, [initialRecipientId, selectedRecipientId]);

  useEffect(() => {
    if (!selectedRecipientId) {
      onRecipientReady(null);
      return;
    }
    onRecipientReady(selectedRecipient);
  }, [onRecipientReady, selectedRecipient, selectedRecipientId]);

  const selectedLabel = useMemo(() => {
    if (!selectedRecipient) return 'No recipient selected';
    return `${selectedRecipient.fullName} • ${selectedRecipient.bankCode}`;
  }, [selectedRecipient]);

  async function onCreateRecipient(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setNotice(null);

    const payload = {
      fullName: recipientForm.fullName,
      bankAccountName: recipientForm.bankAccountName,
      bankAccountNumber: recipientForm.bankAccountNumber,
      bankCode: recipientForm.bankCode,
      countryCode: recipientForm.countryCode,
      ...(recipientForm.phoneE164.trim() ? { phoneE164: recipientForm.phoneE164.trim() } : {})
    };

    try {
      const created = await createRecipientMutation.mutateAsync(payload);
      setSelectedRecipientId(created.recipientId);
      setNotice('Recipient saved. Continue after sender KYC approval.');
    } catch (error) {
      setNotice(errorMessage(error, 'Could not create recipient.'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recipient details</CardTitle>
        <CardDescription>Bank payout details for Ethiopia. Receiver KYC steps are not in the sender flow.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <form className="grid gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4" onSubmit={onCreateRecipient}>
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
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, bankCode: event.target.value.toUpperCase() }))}
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

          <div className="grid gap-2 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="recipientCountryCode">Country</Label>
              <Input
                id="recipientCountryCode"
                value={recipientForm.countryCode}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, countryCode: event.target.value.toUpperCase() }))}
                maxLength={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="recipientPhone">Phone (optional)</Label>
              <Input
                id="recipientPhone"
                value={recipientForm.phoneE164}
                onChange={(event) => setRecipientForm((prev) => ({ ...prev, phoneE164: event.target.value }))}
                placeholder="+251..."
              />
            </div>
          </div>

          <Button type="submit" disabled={createRecipientMutation.isPending || !token}>
            {createRecipientMutation.isPending ? 'Saving recipient...' : 'Save recipient'}
          </Button>
        </form>

        <div className="grid gap-2">
          <Label htmlFor="recipientSelector">Select recipient</Label>
          <select
            id="recipientSelector"
            className="h-12 rounded-2xl border border-input/90 bg-background px-4 text-sm"
            value={selectedRecipientId}
            onChange={(event) => setSelectedRecipientId(event.target.value)}
            disabled={recipientsQuery.isLoading}
          >
            <option value="">{recipientsQuery.isLoading ? 'Loading recipients...' : 'Choose recipient'}</option>
            {recipients.map((recipient) => (
              <option key={recipient.recipientId} value={recipient.recipientId}>
                {recipient.fullName} ({recipient.bankCode})
              </option>
            ))}
          </select>
        </div>

        {selectedRecipient ? (
          <div className="rounded-2xl border border-border/70 bg-muted/30 p-4 text-sm">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="font-medium">{selectedLabel}</p>
              <Badge variant="success">Recipient ready</Badge>
            </div>
            <div className="grid gap-1 text-muted-foreground sm:grid-cols-2">
              <p>Account: {selectedRecipient.bankAccountName}</p>
              <p className="truncate">#{selectedRecipient.bankAccountNumber}</p>
              <p className="sm:col-span-2">Country: {selectedRecipient.countryCode}</p>
            </div>
          </div>
        ) : null}

        {!senderKycApproved ? (
          <Alert>
            <UserRoundCheck className="h-4 w-4" />
            <AlertTitle>Transfer readiness</AlertTitle>
            <AlertDescription>
              Recipient bank details are ready. Only sender KYC approval is required before creating a transfer.
            </AlertDescription>
          </Alert>
        ) : null}

        {recipientDetailQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Recipient load failed</AlertTitle>
            <AlertDescription>{errorMessage(recipientDetailQuery.error, 'Could not load selected recipient.')}</AlertDescription>
          </Alert>
        ) : null}

        {recipientsQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Recipient list failed</AlertTitle>
            <AlertDescription>{errorMessage(recipientsQuery.error, 'Could not load recipients.')}</AlertDescription>
          </Alert>
        ) : null}

        {notice ? (
          <Alert>
            <Building2 className="h-4 w-4" />
            <AlertTitle>Recipient status</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
