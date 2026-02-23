'use client';

import { useEffect, useState } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { readFlowDraft } from '@/lib/flow-state';
import { exchangeAccessToken, readAccessToken } from '@/lib/session';

interface RouteGuardProps {
  requireAuth?: boolean;
  requireQuote?: boolean;
  requireRecipient?: boolean;
  children?: React.ReactNode | ((token: string) => React.ReactNode);
}

export function RouteGuard({ requireAuth, requireQuote, requireRecipient, children }: RouteGuardProps) {
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [activeToken, setActiveToken] = useState<string>('');

  useEffect(() => {
    async function guard(): Promise<void> {
      setAllowed(false);
      let token = readAccessToken();
      const draft = readFlowDraft();

      if (requireAuth && !token) {
        try {
          const exchanged = await exchangeAccessToken();
          token = exchanged.token;
        } catch {
          router.replace('/login' as Route);
          return;
        }
      }

      if (requireQuote && !draft.quote) {
        router.replace('/quote' as Route);
        return;
      }

      if (requireRecipient && !draft.recipientId) {
        router.replace('/quote' as Route);
        return;
      }

      setActiveToken(token);
      setAllowed(true);
    }

    void guard();
  }, [requireAuth, requireQuote, requireRecipient, router]);

  if (!allowed) {
    return (
      <div className="grid gap-3">
        <Skeleton className="h-12 w-60" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return <>{typeof children === 'function' ? children(activeToken) : children}</>;
}
