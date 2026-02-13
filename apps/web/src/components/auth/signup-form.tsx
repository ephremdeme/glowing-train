'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clearAuthSession } from '@/lib/session';
import { normalizeNextPath, readApiMessage, startGoogleOAuth } from '@/lib/client-api';

export function SignupForm({ nextPath = '/quote' }: { nextPath?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    fullName: '',
    countryCode: 'US',
    email: '',
    password: ''
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form)
      });
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | { customer?: { customerId: string } }
        | { error?: { message?: string } };

      if (!response.ok) {
        setMessage(readApiMessage(payload, 'Could not create account.'));
        return;
      }

      clearAuthSession();
      const query = new URLSearchParams({
        email: form.email,
        next: normalizeNextPath(nextPath, '/quote')
      }).toString();
      router.push(`/login?${query}` as Route);
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle(): Promise<void> {
    setMessage(null);
    setGoogleBusy(true);
    try {
      const result = await startGoogleOAuth(normalizeNextPath(nextPath, '/quote'));
      if (!result.ok) {
        setMessage(result.message);
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <Card className="mx-auto w-full max-w-xl">
      <CardHeader>
        <CardTitle className="text-2xl">Create sender account</CardTitle>
        <CardDescription>Set up your diaspora sender profile before signing in.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              value={form.fullName}
              onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
              placeholder="Diaspora Sender"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="countryCode">Country code</Label>
            <Input
              id="countryCode"
              value={form.countryCode}
              onChange={(event) => setForm((prev) => ({ ...prev, countryCode: event.target.value.toUpperCase().slice(0, 2) }))}
              placeholder="US"
              required
              maxLength={2}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              placeholder="sender@example.com"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              placeholder="At least 8 characters"
              minLength={8}
              required
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Creating account...' : 'Continue to login'}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>

          <Button type="button" variant="outline" onClick={onGoogle} disabled={googleBusy || busy}>
            {googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
          </Button>
        </form>
      </CardContent>
      {message ? (
        <CardFooter>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Signup failed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </CardFooter>
      ) : null}
    </Card>
  );
}
