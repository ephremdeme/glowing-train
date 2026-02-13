import Link from 'next/link';
import type { Route } from 'next';
import { ArrowRight, Clock3, Landmark, ShieldCheck, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function HomePage() {
  return (
    <div className="grid gap-8">
      <section className="overflow-hidden rounded-[2.2rem] border border-[#A2D6CF] bg-hero-grid p-8 shadow-panel md:p-12">
        <div className="grid max-w-3xl gap-6">
          <Badge className="w-fit border-0 bg-white/80 text-slate-700">Crypto-funded, non-custodial remittance</Badge>
          <h1 className="text-balance text-4xl font-semibold leading-tight text-slate-900 md:text-6xl">
            Send stablecoins from your wallet, settle recipients in ETB bank accounts.
          </h1>
          <p className="max-w-2xl text-base text-slate-700 md:text-lg">
            Diaspora sender flow built for speed and trust: quote lock, transfer instructions, wallet deeplinks, and payout status in one clean path.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href={'/signup' as Route}>
                Start with signup
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="border-[#8FBDB5] bg-white/60 text-slate-800 hover:bg-white">
              <Link href={'/login' as Route}>Sign in</Link>
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.14em] text-slate-600">
            <span>Transfer cap: $2,000</span>
            <span>•</span>
            <span>Bank payout first</span>
            <span>•</span>
            <span>Telebirr behind feature flag</span>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wallet className="h-4 w-4 text-primary" />
              Sender controls funds
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Wallet remains non-custodial. No private key handling and no app-held crypto balances.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-accent" />
              Compliance gates in-flow
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Sender and receiver KYC blockers guide required remediation before a transfer can proceed.
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock3 className="h-4 w-4 text-secondary" />
              Fast payout tracking
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Status path maps from transfer creation to payout completion, targeting about 10 minutes after confirmation.
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-4 rounded-3xl border border-border/70 bg-card/70 p-6 md:grid-cols-2 md:p-8">
        <div className="grid gap-2">
          <h2 className="text-2xl font-semibold tracking-tight">Built for Ethiopia bank payout rails</h2>
          <p className="text-sm text-muted-foreground md:text-base">
            Crypto operations remain offshore. Ethiopia-side payout is ETB bank transfer in MVP.
          </p>
        </div>
        <div className="grid gap-2 text-sm text-muted-foreground">
          <p className="inline-flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Recipient receives ETB in linked bank account.
          </p>
          <p className="inline-flex items-center gap-2">
            <Landmark className="h-4 w-4 text-primary" />
            Transfer evidence available through history and printable receipts.
          </p>
        </div>
      </section>
    </div>
  );
}
