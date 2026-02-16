'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  Clock,
  DollarSign,
  HelpCircle,
  Lock,
  MessageSquare,
  Send,
  Shield,
  Star,
  Zap
} from 'lucide-react';
import { HeroGlobeScene } from '@/components/illustrations/hero-globe-scene';
import { HeroConverter } from '@/components/quote/hero-converter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { startGoogleOAuth } from '@/lib/client-api';
import { readAccessToken } from '@/lib/session';

/* ── Live Rate Ticker ── */
function LiveRateTicker() {
  const rate = Number(process.env.NEXT_PUBLIC_LANDING_USDC_ETB_RATE ?? 140);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const ago = seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;

  return (
    <div className="inline-flex items-center gap-2.5 rounded-full border border-green-200 bg-green-50 px-4 py-2 shadow-sm">
      <span className="relative flex h-2.5 w-2.5">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-green-500" />
      </span>
      <span className="text-sm font-semibold text-green-800">
        1 USDC = {rate.toFixed(2)} ETB
      </span>
      <span className="text-xs text-green-600">· updated {ago}</span>
    </div>
  );
}

/* ── FAQ Accordion ── */
function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'How long does a transfer take?',
      a: 'Most transfers complete in about 10 minutes. After your on-chain transaction is confirmed, CryptoPay converts and initiates the bank payout immediately.'
    },
    {
      q: 'Which banks are supported in Ethiopia?',
      a: 'CryptoPay supports all major Ethiopian banks including Commercial Bank of Ethiopia (CBE), Awash Bank, Dashen Bank, Bank of Abyssinia, and more.'
    },
    {
      q: 'Is CryptoPay safe to use?',
      a: 'Absolutely. CryptoPay is non-custodial — we never hold your crypto. You sign every transaction from your own wallet. Both sender and recipient are KYC verified for full compliance.'
    },
    {
      q: 'What are the fees?',
      a: 'CryptoPay charges a flat $1 processing fee per transfer. There are no hidden charges, percentage-based fees, or withdrawal fees. On-chain gas fees are separate and typically minimal on Base and Solana.'
    },
    {
      q: 'What happens if the exchange rate changes?',
      a: 'Once you lock a quote, the exchange rate is guaranteed for 5 minutes. This protects you from rate fluctuations during your transfer.'
    },
    {
      q: 'Do I need a crypto wallet?',
      a: 'Yes, you need a self-custody wallet that supports USDC or USDT on Base or Solana networks. Popular options include MetaMask, Phantom, Coinbase Wallet, and Trust Wallet.'
    }
  ];

  return (
    <section className="grid gap-10">
      <div className="grid gap-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Frequently asked questions</h2>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          Everything you need to know about sending money with CryptoPay.
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl divide-y divide-border/60 rounded-2xl border border-border/50 bg-white shadow-sm">
        {faqs.map((faq, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50/80"
            >
              <span className="text-sm font-semibold text-foreground">{faq.q}</span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 ${
                  openIndex === i ? 'rotate-180' : ''
                }`}
              />
            </button>
            <div
              className={`overflow-hidden transition-all duration-200 ${
                openIndex === i ? 'max-h-48 pb-5' : 'max-h-0'
              }`}
            >
              <p className="px-6 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Testimonials ── */
function TestimonialsSection() {
  const testimonials = [
    {
      name: 'Abebe M.',
      location: 'Washington, DC',
      text: "CryptoPay is the fastest way I've found to send money to my family in Addis. The $1 flat fee is unbeatable compared to traditional services.",
      rating: 5
    },
    {
      name: 'Sara T.',
      location: 'London, UK',
      text: "I love that it's non-custodial. I send USDC from my own wallet and my mother gets ETB in her bank account within minutes. No middlemen.",
      rating: 5
    },
    {
      name: 'Daniel K.',
      location: 'Toronto, Canada',
      text: 'The exchange rates are transparent and the locked quote feature gives me peace of mind. No more surprises with hidden fees.',
      rating: 5
    }
  ];

  return (
    <section className="grid gap-10">
      <div className="grid gap-3 text-center">
        <div className="mx-auto mb-1 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-amber-400 text-amber-400" />
          ))}
        </div>
        <h2 className="text-3xl font-bold tracking-tight">Trusted by senders worldwide</h2>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          Join thousands who send money home faster and cheaper with CryptoPay.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <div
            key={i}
            className="group relative rounded-2xl border border-border/50 bg-white p-6 shadow-sm transition-all hover:shadow-md"
          >
            <MessageSquare className="mb-4 h-8 w-8 text-primary/20" />
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              &ldquo;{t.text}&rdquo;
            </p>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {t.name.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.location}</p>
              </div>
            </div>
            <div className="mt-3 flex gap-0.5">
              {[...Array(t.rating)].map((_, j) => (
                <Star key={j} className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── Rate Alert ── */
function RateAlertSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) {
      setSubmitted(true);
    }
  }

  return (
    <section className="grid gap-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 to-indigo-50/80 p-8 text-center shadow-sm sm:p-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-foreground">Get rate alerts</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Get notified when the ETB exchange rate hits your target. Never miss a good rate.
        </p>

        {submitted ? (
          <div className="rounded-xl bg-green-50 px-6 py-4 text-sm font-medium text-green-800">
            ✓ You&apos;re subscribed! We&apos;ll notify you at <strong>{email}</strong> when rates change.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm gap-2">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-border/60 bg-white px-4 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
            <Button type="submit" size="lg" className="shrink-0">
              Subscribe
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}

/* ── Main Page ── */
export default function HomePage() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    setHasSession(Boolean(readAccessToken()));
  }, []);

  async function continueWithGoogle(): Promise<void> {
    setMessage(null);
    setGoogleBusy(true);
    try {
      const result = await startGoogleOAuth('/quote');
      if (!result.ok) {
        setMessage(result.message);
      }
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="grid gap-24">
      {/* ── HERO ── */}
      <section className="grid items-center gap-10 pt-4 lg:grid-cols-2 lg:gap-16 lg:pt-10">
        {/* Text */}
        <div className="grid gap-6">
          <div className="stagger-reveal stagger-1 inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3.5 py-1.5 text-xs font-medium text-primary">
            <Zap className="h-3.5 w-3.5" />
            Non-custodial remittance
          </div>

          <h1 className="stagger-reveal stagger-2 max-w-lg text-balance text-4xl font-bold leading-[1.1] tracking-tight text-foreground md:text-5xl lg:text-[3.5rem]">
            Send crypto.
            <br />
            <span className="text-primary">Deliver ETB.</span>
          </h1>

          <p className="stagger-reveal stagger-3 max-w-md text-lg leading-relaxed text-muted-foreground">
            Send USDC or USDT from your own wallet. Your family receives Ethiopian Birr in their bank account in about 10 minutes.
          </p>

          {/* Live rate ticker */}
          <div className="stagger-reveal stagger-3">
            <LiveRateTicker />
          </div>

          <div className="stagger-reveal stagger-4 flex flex-wrap gap-3">
            {hasSession ? (
              <Button asChild size="lg">
                <Link href={'/quote' as Route}>
                  Continue to quote
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild size="lg">
                  <Link href={'/signup?next=%2Fquote' as Route}>
                    Create account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href={'/login?next=%2Fquote' as Route}>Sign in</Link>
                </Button>
              </>
            )}
          </div>

          <div className="stagger-reveal stagger-5 flex flex-wrap gap-5 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> ~10 min payout
            </span>
            <span className="flex items-center gap-1.5">
              <DollarSign className="h-4 w-4" /> $1 flat fee
            </span>
            <span className="flex items-center gap-1.5">
              <Lock className="h-4 w-4" /> Non-custodial
            </span>
          </div>
        </div>

        {/* Illustration */}
        <div className="stagger-reveal stagger-5">
          <HeroGlobeScene className="h-[320px] md:h-[380px] lg:h-[420px]" />
        </div>
      </section>

      {/* ── INLINE QUOTE ── */}
      <section className="mx-auto w-full max-w-lg stagger-reveal" style={{ animationDelay: '500ms' }}>
        <HeroConverter hasSession={hasSession} onMessage={setMessage} />
      </section>

      {message ? (
        <Alert variant="destructive" className="mx-auto max-w-md">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}

      {/* ── HOW IT WORKS ── */}
      <section className="grid gap-10">
        <div className="grid gap-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Three steps from your wallet to their bank account.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Send,
              step: '1',
              title: 'Send from your wallet',
              desc: 'Fund with USDC or USDT on Base or Solana. You keep full custody of your keys.',
              accent: 'from-indigo-50 to-blue-50',
              iconBg: 'bg-indigo-100',
              iconColor: 'text-indigo-600',
              borderColor: 'border-l-indigo-500'
            },
            {
              icon: Shield,
              step: '2',
              title: 'We convert & settle',
              desc: 'CryptoPay confirms on-chain, converts at locked rate, and initiates ETB bank payout.',
              accent: 'from-violet-50 to-purple-50',
              iconBg: 'bg-violet-100',
              iconColor: 'text-violet-600',
              borderColor: 'border-l-violet-500'
            },
            {
              icon: Building2,
              step: '3',
              title: 'Bank payout arrives',
              desc: 'Your recipient receives ETB directly in their Ethiopian bank account in ~10 minutes.',
              accent: 'from-emerald-50 to-green-50',
              iconBg: 'bg-emerald-100',
              iconColor: 'text-emerald-600',
              borderColor: 'border-l-emerald-500'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.step}
                className={`group relative overflow-hidden rounded-2xl border border-border/50 border-l-4 ${item.borderColor} bg-gradient-to-br ${item.accent} p-7 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg`}
              >
                {/* Step number watermark */}
                <div className="absolute -right-2 -top-2 text-[80px] font-black leading-none text-black/[0.03]">
                  {item.step}
                </div>
                <div className="relative">
                  <div className={`mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${item.iconBg} shadow-sm transition-transform group-hover:scale-110`}>
                    <Icon className={`h-7 w-7 ${item.iconColor}`} />
                  </div>
                  <div className="mb-1.5 text-xs font-bold uppercase tracking-wider text-primary/60">Step {item.step}</div>
                  <h3 className="mb-2.5 text-lg font-bold text-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── WHY CRYPTOPAY ── */}
      <section className="grid gap-10">
        <div className="grid gap-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight">Built for trust & speed</h2>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Every transfer is transparent, fast, and fully compliant.
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Lock,
              title: 'Non-custodial',
              desc: 'We never hold your crypto. You sign every transaction from your own wallet.',
              iconBg: 'bg-indigo-100',
              iconColor: 'text-indigo-600',
              accent: 'from-indigo-50/80'
            },
            {
              icon: Zap,
              title: 'Fast settlement',
              desc: 'Bank payout in about 10 minutes after on-chain confirmation.',
              iconBg: 'bg-amber-100',
              iconColor: 'text-amber-600',
              accent: 'from-amber-50/80'
            },
            {
              icon: Shield,
              title: 'KYC verified',
              desc: 'Both sender and recipient are verified for full regulatory compliance.',
              iconBg: 'bg-emerald-100',
              iconColor: 'text-emerald-600',
              accent: 'from-emerald-50/80'
            },
            {
              icon: DollarSign,
              title: '$1 flat fee',
              desc: 'Simple, transparent pricing. No hidden charges or percentage-based fees.',
              iconBg: 'bg-sky-100',
              iconColor: 'text-sky-600',
              accent: 'from-sky-50/80'
            }
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br ${item.accent} to-white p-7 shadow-md transition-all hover:-translate-y-1 hover:shadow-lg`}
              >
                <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${item.iconBg} shadow-sm transition-transform group-hover:scale-110`}>
                  <Icon className={`h-6 w-6 ${item.iconColor}`} />
                </div>
                <h3 className="mb-2 text-base font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <TestimonialsSection />

      {/* ── FAQ ── */}
      <FaqSection />

      {/* ── RATE ALERT ── */}
      <RateAlertSection />

      {/* ── CTA ── */}
      {!hasSession ? (
        <section className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 to-indigo-50/80 p-10 text-center shadow-sm">
          <h2 className="mb-3 text-2xl font-bold">Ready to send money home?</h2>
          <p className="mb-8 text-base text-muted-foreground">
            Create an account and lock your first quote in seconds.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button asChild size="lg">
              <Link href={'/signup?next=%2Fquote' as Route}>Create account</Link>
            </Button>
            <Button variant="outline" size="lg" onClick={continueWithGoogle} disabled={googleBusy}>
              {googleBusy ? 'Connecting...' : 'Continue with Google'}
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 to-indigo-50/80 p-10 text-center shadow-sm">
          <h2 className="mb-3 text-2xl font-bold">Your account is ready</h2>
          <p className="mb-8 text-base text-muted-foreground">
            Lock a quote and start your transfer.
          </p>
          <Button size="lg" onClick={() => router.push('/quote' as Route)}>Go to quote</Button>
        </section>
      )}
    </div>
  );
}
