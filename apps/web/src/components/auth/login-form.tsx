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
import { normalizeNextPath, readApiMessage, startGoogleOAuth } from '@/lib/client-api';
import { writeAuthSession } from '@/lib/session';
import type { MePayload } from '@/lib/contracts';

export function LoginForm({ prefillEmail = '', nextPath = '/quote' }: { prefillEmail?: string; nextPath?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    email: prefillEmail,
    password: ''
  });

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setBusy(true);
    setMessage(null);

    try {
      const response = await fetch('/api/client/auth/login/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form)
      });

      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | {
            session?: { accessToken: string };
            customer?: { customerId: string; fullName: string; countryCode: string };
          }
        | { error?: { message?: string } };

      if (!response.ok || !('session' in payload) || !payload.session?.accessToken) {
        setMessage(readApiMessage(payload, 'Could not sign in.'));
        return;
      }

      const token = payload.session.accessToken;
      const meResponse = await fetch('/api/client/me', {
        headers: {
          authorization: `Bearer ${token}`
        }
      });
      const mePayload = (await meResponse.json().catch(() => ({ error: { message: 'Could not load profile.' } }))) as
        | MePayload
        | { error?: { message?: string } };

      if (!meResponse.ok || !('customerId' in mePayload)) {
        setMessage(readApiMessage(mePayload, 'Signed in, but profile load failed.'));
        return;
      }

      writeAuthSession({
        token,
        customerId: mePayload.customerId,
        fullName: mePayload.fullName,
        countryCode: mePayload.countryCode,
        lastSyncedAt: new Date().toISOString()
      });
      router.push(normalizeNextPath(nextPath, '/quote') as Route);
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
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>Continue to create your quote and transfer details.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="grid gap-4" onSubmit={onSubmit}>
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
              placeholder="Password"
              minLength={8}
              required
            />
          </div>

          <Button type="submit" disabled={busy}>
            {busy ? 'Signing in...' : 'Continue to quote'}
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
            <AlertTitle>Login failed</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </CardFooter>
      ) : null}
    </Card>
  );
}
