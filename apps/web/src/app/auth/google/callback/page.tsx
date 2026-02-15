'use client';

import type { Route } from 'next';
import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { consumeGoogleNextPath, normalizeNextPath, readApiMessage } from '@/lib/client-api';
import type { GoogleOAuthCallbackPayload } from '@/lib/contracts';
import { writeAuthSession } from '@/lib/session';

export default function GoogleAuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const once = useRef(false);
  const [message, setMessage] = useState('Finalizing Google sign-in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    const state = searchParams.get('state') ?? '';
    const code = searchParams.get('code') ?? '';
    const explicitNext = normalizeNextPath(searchParams.get('next'), '');

    if (!state || !code) {
      setError('Google callback is missing required parameters.');
      return;
    }

    const destination = explicitNext || consumeGoogleNextPath('/quote');

    async function finalizeAuth(): Promise<void> {
      const query = new URLSearchParams({ state, code });
      const response = await fetch(`/api/client/auth/oauth/google/callback?${query.toString()}`);
      const payload = (await response.json().catch(() => ({ error: { message: 'Invalid response.' } }))) as
        | GoogleOAuthCallbackPayload
        | { error?: { message?: string } };

      if (!response.ok || !('session' in payload) || !payload.session?.accessToken || !payload.customer) {
        setError(readApiMessage(payload, 'Google sign-in failed.'));
        return;
      }

      writeAuthSession({
        token: payload.session.accessToken,
        customerId: payload.customer.customerId,
        fullName: payload.customer.fullName,
        countryCode: payload.customer.countryCode,
        lastSyncedAt: new Date().toISOString()
      });

      setMessage('Signed in. Redirecting...');
      router.replace(destination as Route);
    }

    void finalizeAuth();
  }, [router, searchParams]);

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4">
      <Card className="neon-section">
        <CardHeader>
          <CardTitle className="text-2xl">Google sign-in</CardTitle>
          <CardDescription>Securing your session and loading your sender workspace.</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          {message}
        </CardContent>
      </Card>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Sign-in failed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
