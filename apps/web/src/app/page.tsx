'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Bell,
  Building2,
  ChevronDown,
  Clock,
  DollarSign,
  Lock,
  MessageSquare,
  Send,
  Shield,
  Star,
  Zap,
} from 'lucide-react';
import { HeroGlobeScene } from '@/components/illustrations/hero-globe-scene';
import { HeroConverter } from '@/components/quote/hero-converter';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  FadeIn,
  StaggerContainer,
  FadeInItem,
  RevealText,
  SmoothSection,
} from '@/components/ui/fade-in';
import { startGoogleOAuth } from '@/lib/client-api';
import { readAccessToken } from '@/lib/session';

/* ═══════════════════════════════════════════════════
   Live Rate Ticker — floating glass chip
   ═══════════════════════════════════════════════════ */
function LiveRateTicker() {
  const rate = Number(process.env.NEXT_PUBLIC_LANDING_USDC_ETB_RATE ?? 140);
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const ago = seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.5, duration: 0.6 }}
      className="inline-flex items-center gap-2.5 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 backdrop-blur-sm"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      <span className="text-sm font-semibold text-emerald-300">
        1 USDC = {rate.toFixed(2)} ETB
      </span>
      <span className="text-xs text-emerald-500/60">· {ago}</span>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   FAQ Accordion — glass surface with smooth expand
   ═══════════════════════════════════════════════════ */
function FaqSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const faqs = [
    {
      q: 'How long does a transfer take?',
      a: 'Most transfers complete in about 10 minutes. After your on-chain transaction is confirmed, CryptoPay converts and initiates the bank payout immediately.',
    },
    {
      q: 'Which banks are supported in Ethiopia?',
      a: 'CryptoPay supports all major Ethiopian banks including Commercial Bank of Ethiopia (CBE), Awash Bank, Dashen Bank, Bank of Abyssinia, and more.',
    },
    {
      q: 'Is CryptoPay safe to use?',
      a: 'Absolutely. CryptoPay is non-custodial — we never hold your crypto. You sign every transaction from your own wallet. Both sender and recipient are KYC verified for full compliance.',
    },
    {
      q: 'What are the fees?',
      a: 'CryptoPay charges a flat $1 processing fee per transfer. No hidden charges, percentage-based fees, or withdrawal fees. On-chain gas fees are separate and typically minimal.',
    },
    {
      q: 'What happens if the exchange rate changes?',
      a: 'Once you lock a quote, the exchange rate is guaranteed for 5 minutes. This protects you from rate fluctuations during your transfer.',
    },
    {
      q: 'Do I need a crypto wallet?',
      a: 'Yes, you need a self-custody wallet that supports USDC or USDT on Base or Solana. Popular options include MetaMask, Phantom, Coinbase Wallet, and Trust Wallet.',
    },
  ];

  return (
    <FadeIn className="grid gap-10">
      <div className="grid gap-3 text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Frequently asked questions
        </h2>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          Everything you need to know about sending money with CryptoPay.
        </p>
      </div>

      <div className="mx-auto w-full max-w-2xl divide-y divide-border/30 rounded-2xl border border-border/30 bg-card/40 shadow-card backdrop-blur-xl">
        {faqs.map((faq, i) => (
          <div key={i}>
            <button
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-white/[0.02]"
            >
              <span className="text-sm font-semibold text-foreground">{faq.q}</span>
              <motion.div
                animate={{ rotate: openIndex === i ? 180 : 0 }}
                transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              >
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              </motion.div>
            </button>
            <AnimatePresence initial={false}>
              {openIndex === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-6 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </FadeIn>
  );
}

/* ═══════════════════════════════════════════════════
   Testimonials — horizontally scrolling glass cards
   ═══════════════════════════════════════════════════ */
function TestimonialsSection() {
  const testimonials = [
    {
      name: 'Abebe M.',
      location: 'Washington, DC',
      text: "CryptoPay is the fastest way I've found to send money to my family in Addis. The $1 flat fee is unbeatable compared to traditional services.",
      rating: 5,
    },
    {
      name: 'Sara T.',
      location: 'London, UK',
      text: "I love that it's non-custodial. I send USDC from my own wallet and my mother gets ETB in her bank account within minutes. No middlemen.",
      rating: 5,
    },
    {
      name: 'Daniel K.',
      location: 'Toronto, Canada',
      text: 'The exchange rates are transparent and the locked quote feature gives me peace of mind. No more surprises with hidden fees.',
      rating: 5,
    },
  ];

  return (
    <SmoothSection className="grid gap-10">
      <FadeIn className="grid gap-3 text-center">
        <div className="mx-auto mb-1 flex items-center gap-1">
          {[...Array(5)].map((_, i) => (
            <Star key={i} className="h-5 w-5 fill-primary text-primary" />
          ))}
        </div>
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Trusted by senders worldwide
        </h2>
        <p className="mx-auto max-w-md text-base text-muted-foreground">
          Join thousands who send money home faster and cheaper with CryptoPay.
        </p>
      </FadeIn>

      <StaggerContainer className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t, i) => (
          <FadeInItem
            key={i}
            className="group relative rounded-2xl border border-border/30 bg-card/40 p-6 shadow-card backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-card/60 hover:shadow-elevated hover:border-border/50"
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
                <Star key={j} className="h-3.5 w-3.5 fill-primary text-primary" />
              ))}
            </div>
          </FadeInItem>
        ))}
      </StaggerContainer>
    </SmoothSection>
  );
}

/* ═══════════════════════════════════════════════════
   Rate Alert — glass CTA card
   ═══════════════════════════════════════════════════ */
function RateAlertSection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim()) setSubmitted(true);
  }

  return (
    <FadeIn className="grid gap-8">
      <div className="mx-auto w-full max-w-xl rounded-2xl border border-primary/15 bg-card/50 p-8 text-center shadow-card backdrop-blur-xl sm:p-10">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <Bell className="h-6 w-6 text-primary" />
        </div>
        <h2 className="mb-2 text-2xl font-bold text-foreground">Get rate alerts</h2>
        <p className="mb-6 text-sm text-muted-foreground">
          Get notified when the ETB exchange rate hits your target. Never miss a good rate.
        </p>

        {submitted ? (
          <div className="rounded-xl bg-emerald-500/10 px-6 py-4 text-sm font-medium text-emerald-400">
            ✓ You&apos;re subscribed! We&apos;ll notify you at <strong>{email}</strong>.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mx-auto flex max-w-sm gap-2">
            <input
              type="email"
              required
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11 flex-1 rounded-xl border border-border/50 bg-muted/30 px-4 text-sm text-foreground placeholder:text-muted-foreground/40 focus:border-primary/40 focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <Button type="submit" size="lg" className="shrink-0">
              Subscribe
            </Button>
          </form>
        )}
      </div>
    </FadeIn>
  );
}

/* ═══════════════════════════════════════════════════
   Main Landing Page
   ═══════════════════════════════════════════════════ */
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
      if (!result.ok) setMessage(result.message);
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <div className="grid gap-28 pb-24">
      {/* ═══ HERO ═══ */}
      <section className="relative grid items-center gap-10 pt-6 lg:grid-cols-2 lg:gap-16 lg:pt-16">
        {/* Hero text */}
        <StaggerContainer className="grid gap-7">
          <FadeInItem>
            <div className="inline-flex w-fit items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.06] px-4 py-2 text-xs font-semibold text-primary shadow-glow-sm backdrop-blur-sm">
              <Zap className="h-3.5 w-3.5" />
              Non-custodial remittance
            </div>
          </FadeInItem>

          <FadeInItem>
            <h1 className="max-w-lg text-balance text-5xl font-extrabold leading-[1.05] tracking-[-0.045em] md:text-6xl lg:text-[4.25rem]">
              <span className="text-foreground">Send crypto.</span>
              <br />
              <span className="text-primary">Deliver ETB.</span>
            </h1>
          </FadeInItem>

          <FadeInItem>
            <p className="max-w-md text-lg leading-relaxed text-muted-foreground">
              Send USDC or USDT from your own wallet. Your family receives Ethiopian
              Birr in their bank account in about 10 minutes.
            </p>
          </FadeInItem>

          <FadeInItem>
            <LiveRateTicker />
          </FadeInItem>

          <FadeInItem className="flex flex-wrap gap-3 pt-1">
            {hasSession ? (
              <Button
                asChild
                variant="premium"
                size="lg"
                className="h-13 px-8 text-base"
              >
                <Link href={'/quote' as Route}>
                  Continue to quote
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button
                  asChild
                  variant="premium"
                  size="lg"
                  className="h-13 px-8 text-base"
                >
                  <Link href={'/signup?next=%2Fquote' as Route}>
                    Create account
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="glass"
                  size="lg"
                  className="h-13 px-8 text-base"
                >
                  <Link href={'/login?next=%2Fquote' as Route}>Sign in</Link>
                </Button>
              </>
            )}
          </FadeInItem>

          <FadeInItem className="flex flex-wrap gap-6 text-sm font-medium text-muted-foreground/70">
            <span className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary/60" /> ~10 min payout
            </span>
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-primary/60" /> $1 flat fee
            </span>
            <span className="flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary/60" /> Non-custodial
            </span>
          </FadeInItem>
        </StaggerContainer>

        {/* Hero illustration */}
        <FadeIn delay={0.3}>
          <HeroGlobeScene className="h-[340px] md:h-[400px] lg:h-[460px]" />
        </FadeIn>
      </section>

      {/* ═══ INLINE QUOTE ═══ */}
      <FadeIn delay={0.4} className="mx-auto w-full max-w-lg">
        <HeroConverter hasSession={hasSession} onMessage={setMessage} />
      </FadeIn>

      {message && (
        <Alert variant="destructive" className="mx-auto max-w-md">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      {/* ═══ HOW IT WORKS ═══ */}
      <SmoothSection className="grid gap-16">
        <FadeIn className="grid gap-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            How it works
          </h2>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Three steps from your wallet to their bank account.
          </p>
        </FadeIn>

        <StaggerContainer className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Send,
              step: '01',
              title: 'Send from your wallet',
              desc: 'Fund with USDC or USDT on Base or Solana. You keep full custody of your keys.',
              glow: 'from-amber-500/8 to-transparent',
              iconGrad: 'from-amber-500 to-orange-600',
            },
            {
              icon: Shield,
              step: '02',
              title: 'We convert & settle',
              desc: 'CryptoPay confirms on-chain, converts at locked rate, and initiates ETB bank payout.',
              glow: 'from-blue-500/8 to-transparent',
              iconGrad: 'from-blue-500 to-indigo-600',
            },
            {
              icon: Building2,
              step: '03',
              title: 'Bank payout arrives',
              desc: 'Your recipient receives ETB directly in their Ethiopian bank account in ~10 minutes.',
              glow: 'from-emerald-500/8 to-transparent',
              iconGrad: 'from-emerald-500 to-teal-600',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <FadeInItem
                key={item.step}
                className={`group relative overflow-hidden rounded-2xl border border-border/30 bg-gradient-to-b ${item.glow} p-8 backdrop-blur-xl transition-all duration-500 hover:-translate-y-2 hover:shadow-elevated hover:border-border/50`}
              >
                {/* Step number watermark */}
                <div className="absolute -right-2 -top-4 text-[80px] font-extrabold leading-none text-white/[0.02] transition-all group-hover:text-white/[0.04]">
                  {item.step}
                </div>
                <div className="relative">
                  <div
                    className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${item.iconGrad} shadow-lg transition-transform duration-300 group-hover:scale-110 group-hover:rotate-3`}
                  >
                    <Icon className="h-7 w-7 text-white" />
                  </div>
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
                    Step {item.step}
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-foreground">{item.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </FadeInItem>
            );
          })}
        </StaggerContainer>
      </SmoothSection>

      {/* ═══ WHY CRYPTOPAY — Bento Grid ═══ */}
      <SmoothSection className="grid gap-16">
        <FadeIn className="grid gap-3 text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Built for trust & speed
          </h2>
          <p className="mx-auto max-w-md text-base text-muted-foreground">
            Every transfer is transparent, fast, and fully compliant.
          </p>
        </FadeIn>

        <StaggerContainer className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Lock,
              title: 'Non-custodial',
              desc: 'We never hold your crypto. You sign every transaction from your own wallet.',
              iconGrad: 'from-amber-500 to-orange-600',
              span: 'sm:col-span-2 lg:col-span-2',
            },
            {
              icon: Zap,
              title: 'Fast settlement',
              desc: 'Bank payout in ~10 minutes after on-chain confirmation.',
              iconGrad: 'from-yellow-500 to-amber-600',
              span: '',
            },
            {
              icon: Shield,
              title: 'KYC verified',
              desc: 'Both sender and recipient are verified for compliance.',
              iconGrad: 'from-emerald-500 to-teal-600',
              span: '',
            },
            {
              icon: DollarSign,
              title: '$1 flat fee',
              desc: 'Simple, transparent pricing. No hidden charges or percentage-based fees.',
              iconGrad: 'from-blue-500 to-indigo-600',
              span: 'sm:col-span-2 lg:col-span-2',
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <FadeInItem
                key={item.title}
                className={`group relative overflow-hidden rounded-2xl border border-border/30 bg-card/30 p-8 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:bg-card/50 hover:shadow-elevated hover:border-border/50 ${item.span}`}
              >
                <div
                  className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${item.iconGrad} shadow-lg transition-transform duration-300 group-hover:scale-110`}
                >
                  <Icon className="h-6 w-6 text-white" />
                </div>
                <h3 className="mb-2 text-lg font-bold text-foreground">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.desc}</p>
              </FadeInItem>
            );
          })}
        </StaggerContainer>
      </SmoothSection>

      {/* ═══ TESTIMONIALS ═══ */}
      <TestimonialsSection />

      {/* ═══ FAQ & RATE ALERT ═══ */}
      <section className="grid items-start gap-12 lg:grid-cols-2 lg:gap-20">
        <FaqSection />
        <div className="sticky top-24">
          <RateAlertSection />
        </div>
      </section>

      {/* ═══ FINAL CTA ═══ */}
      <FadeIn>
        {!hasSession ? (
          <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-card/80 to-primary/[0.04] p-12 text-center shadow-depth backdrop-blur-xl">
            {/* Background glow */}
            <div className="absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
            </div>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Ready to send money home?
            </h2>
            <p className="mb-10 text-lg text-muted-foreground max-w-lg mx-auto">
              Create an account and lock your first quote in seconds. No credit card required.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Button
                asChild
                variant="premium"
                size="xl"
              >
                <Link href={'/signup?next=%2Fquote' as Route}>Create account</Link>
              </Button>
              <Button
                variant="glass"
                size="xl"
                onClick={continueWithGoogle}
                disabled={googleBusy}
              >
                {googleBusy ? 'Connecting...' : 'Continue with Google'}
              </Button>
            </div>
          </section>
        ) : (
          <section className="relative overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-card/80 to-primary/[0.04] p-12 text-center shadow-depth backdrop-blur-xl">
            <div className="absolute inset-0 -z-10">
              <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
            </div>
            <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl text-foreground">
              Your account is ready
            </h2>
            <p className="mb-10 text-lg text-muted-foreground">
              Lock a quote and start your transfer immediately.
            </p>
            <Button
              variant="premium"
              size="xl"
              onClick={() => router.push('/quote' as Route)}
            >
              Go to quote
            </Button>
          </section>
        )}
      </FadeIn>
    </div>
  );
}
