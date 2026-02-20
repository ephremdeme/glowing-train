'use client';

import { useState } from 'react';
import type { FormEvent } from 'react';
import type { Route } from 'next';
import { useRouter } from 'next/navigation';
import { AlertCircle, ArrowRight, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { clearAuthSession } from '@/lib/session';
import { normalizeNextPath, readApiMessage, startGoogleOAuth } from '@/lib/client-api';

const COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'CA', name: 'Canada' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'AU', name: 'Australia' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'IT', name: 'Italy' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'AE', name: 'United Arab Emirates' },
  { code: 'SA', name: 'Saudi Arabia' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'ET', name: 'Ethiopia' },
  { code: 'IL', name: 'Israel' },
  { code: 'JP', name: 'Japan' },
  { code: 'KR', name: 'South Korea' },
  { code: 'IN', name: 'India' },
  { code: 'BR', name: 'Brazil' },
  { code: 'MX', name: 'Mexico' }
];

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
      const response = await fetch('/api/client/auth/sign-up/email', {
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
    <div className="grid gap-6">
      {/* Google Sign-in first */}
      <Button
        type="button"
        variant="outline"
        size="lg"
        onClick={onGoogle}
        disabled={googleBusy || busy}
        className="h-12 text-sm font-medium"
      >
        <svg className="mr-2.5 h-5 w-5" viewBox="0 0 24 24" fill="none">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
        {googleBusy ? 'Connecting to Google...' : 'Continue with Google'}
      </Button>

      {/* Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <p className="relative flex justify-center">
          <span className="bg-background px-3 text-xs font-medium text-muted-foreground">or continue with email</span>
        </p>
      </div>

      {/* Email form */}
      <form className="grid gap-5" onSubmit={onSubmit}>
        <div className="grid gap-2">
          <Label htmlFor="fullName" className="text-sm font-medium">Full name</Label>
          <Input
            id="fullName"
            value={form.fullName}
            onChange={(event) => setForm((prev) => ({ ...prev, fullName: event.target.value }))}
            placeholder="John Doe"
            required
            className="h-12"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="countryCode" className="text-sm font-medium">Country</Label>
          <select
            id="countryCode"
            value={form.countryCode}
            onChange={(event) => setForm((prev) => ({ ...prev, countryCode: event.target.value }))}
            required
            className="h-12 rounded-xl border border-border/60 bg-muted/30 px-4 text-sm text-foreground transition-colors focus:border-primary/30 focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code} className="bg-background text-foreground">
                {c.name}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="email" className="text-sm font-medium">Email</Label>
          <Input
            id="email"
            type="email"
            value={form.email}
            onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
            placeholder="you@email.com"
            required
            className="h-12"
          />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="password" className="text-sm font-medium">Password</Label>
          <Input
            id="password"
            type="password"
            value={form.password}
            onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
            placeholder="At least 8 characters"
            minLength={8}
            required
            className="h-12"
          />
        </div>

        <Button type="submit" size="lg" disabled={busy} className="mt-1 h-12">
          {busy ? 'Creating account...' : 'Create account'}
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </form>

      {message ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Signup failed</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-center text-xs text-muted-foreground">
        By creating an account, you agree to our Terms of Service and Privacy Policy.
      </p>
    </div>
  );
}
