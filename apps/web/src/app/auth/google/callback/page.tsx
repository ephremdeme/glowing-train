'use client';

import type { Route } from 'next';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { consumeGoogleNextPath, normalizeNextPath, readApiMessage } from '@/lib/client-api';
import type { MePayload } from '@/lib/contracts';
import { exchangeAccessToken, writeAuthSession } from '@/lib/session';

export default function GoogleAuthCallbackPage() {
  return (
    <Suspense>
      <GoogleAuthCallbackContent />
    </Suspense>
  );
}

function GoogleAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const once = useRef(false);
  const [message, setMessage] = useState('Finalizing Google sign-in...');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (once.current) return;
    once.current = true;

    const callbackError = searchParams.get('error');
    const explicitNext = normalizeNextPath(searchParams.get('next'), '');
    if (callbackError) {
      setError(`Google sign-in failed: ${callbackError}`);
      return;
    }

    const destination = explicitNext || consumeGoogleNextPath('/quote');

    async function finalizeAuth(): Promise<void> {
      try {
        const exchanged = await exchangeAccessToken();
        const token = exchanged.token;
        const meResponse = await fetch('/api/client/me', {
          headers: {
            authorization: `Bearer ${token}`
          }
        });
        const mePayload = (await meResponse.json().catch(() => ({ error: { message: 'Could not load profile.' } }))) as
          | MePayload
          | { error?: { message?: string } };

        if (!meResponse.ok || !('customerId' in mePayload)) {
          setError(readApiMessage(mePayload, 'Signed in, but profile load failed.'));
          return;
        }

        writeAuthSession({
          token,
          customerId: mePayload.customerId,
          fullName: mePayload.fullName,
          countryCode: mePayload.countryCode,
          lastSyncedAt: new Date().toISOString()
        });

        setMessage('Signed in. Redirecting...');
        router.replace(destination as Route);
      } catch (error) {
        setError((error as Error).message || 'Google sign-in failed.');
      }
    }

    void finalizeAuth();
  }, [router, searchParams]);

  return (
    <div className="mx-auto grid w-full max-w-lg gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Google sign-in</CardTitle>
          <CardDescription>Securing your session and loading your account.</CardDescription>
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
