'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Wallet, Landmark, Zap } from 'lucide-react';

/**
 * Premium Hero Illustration — Orbital Flow
 *
 * Cinematic visualization of value flowing from wallet to bank.
 * Obsidian surfaces with gold accents, particle beams, and glass depth.
 * Inspired by Apple spatial design language.
 */
export function HeroGlobeScene({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center justify-center', className)}>
      {/* ── Ambient Glow Orbs ── */}
      <motion.div
        animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.3, 0.15] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut' }}
        className="absolute left-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-amber-500/20 blur-[120px]"
      />
      <motion.div
        animate={{ scale: [1.3, 1, 1.3], opacity: [0.12, 0.25, 0.12] }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 5 }}
        className="absolute right-1/4 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-blue-500/15 blur-[120px]"
      />

      {/* ── Orbital Ring ── */}
      <div className="absolute inset-0 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: 'linear' }}
          className="h-[280px] w-[280px] rounded-full border border-white/[0.04] sm:h-[360px] sm:w-[360px]"
        >
          {/* Orbiting dot */}
          <motion.div className="absolute -top-1 left-1/2 -translate-x-1/2">
            <div className="h-2 w-2 rounded-full bg-primary/60 shadow-[0_0_8px_hsl(42_92%_56%/0.4)]" />
          </motion.div>
        </motion.div>
        {/* Second ring */}
        <motion.div
          animate={{ rotate: -360 }}
          transition={{ duration: 60, repeat: Infinity, ease: 'linear' }}
          className="absolute h-[220px] w-[220px] rounded-full border border-white/[0.03] sm:h-[280px] sm:w-[280px]"
        >
          <motion.div className="absolute -right-1 top-1/2 -translate-y-1/2">
            <div className="h-1.5 w-1.5 rounded-full bg-blue-400/50 shadow-[0_0_6px_hsl(220_70%_55%/0.3)]" />
          </motion.div>
        </motion.div>
      </div>

      {/* ── Main Content ── */}
      <div className="relative z-10 flex w-full max-w-3xl items-center justify-center gap-6 sm:gap-16 md:gap-20">
        {/* Left: Wallet Card */}
        <GlassCard delay={0} glow="gold">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/25">
            <Wallet className="h-7 w-7 text-white" />
          </div>
          <div className="mt-4 text-center">
            <p className="text-sm font-bold text-foreground">Your Wallet</p>
            <p className="mt-0.5 text-[11px] font-medium text-muted-foreground">USDC / USDT</p>
          </div>
        </GlassCard>

        {/* Flow Animation */}
        <div className="relative flex flex-1 flex-col items-center justify-center">
          {/* Connection beam */}
          <div className="absolute top-1/2 h-px w-full -translate-y-1/2">
            <div className="h-full w-full bg-gradient-to-r from-amber-500/20 via-white/10 to-emerald-500/20" />
          </div>

          {/* Moving particle */}
          <motion.div
            animate={{ x: [-60, 60], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear' }}
            className="absolute top-1/2 z-20 -translate-y-1/2"
          >
            <div className="relative h-2.5 w-2.5 rounded-full bg-primary shadow-[0_0_16px_hsl(42_92%_56%/0.6)]">
              <div className="absolute inset-0 animate-ping rounded-full bg-primary/50" />
            </div>
          </motion.div>

          {/* Second particle - offset timing */}
          <motion.div
            animate={{ x: [-60, 60], opacity: [0, 1, 1, 0] }}
            transition={{ duration: 2.5, repeat: Infinity, ease: 'linear', delay: 1.25 }}
            className="absolute top-1/2 z-20 -translate-y-1/2"
          >
            <div className="h-1.5 w-1.5 rounded-full bg-amber-400/70 shadow-[0_0_10px_hsl(42_80%_55%/0.4)]" />
          </motion.div>

          {/* Center badge */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
            className="relative z-10 flex items-center gap-1.5 rounded-full border border-primary/20 bg-card/80 px-3 py-1.5 shadow-lg shadow-primary/10 backdrop-blur-xl"
          >
            <Zap className="h-3 w-3 fill-primary text-primary" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-primary">
              Instant
            </span>
          </motion.div>
        </div>

        {/* Right: Bank Card */}
        <GlassCard delay={0.2} glow="emerald">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <Landmark className="h-7 w-7 text-white" />
          </div>
          <div className="mt-4 text-center">
            <p className="text-sm font-bold text-foreground">Bank Account</p>
            <div className="mt-1 flex items-center justify-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <p className="text-[10px] font-bold text-emerald-400">ETB Received</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function GlassCard({
  children,
  delay,
  glow,
}: {
  children: React.ReactNode;
  delay: number;
  glow: 'gold' | 'emerald';
}) {
  const glowColor =
    glow === 'gold'
      ? 'shadow-amber-500/10 hover:shadow-amber-500/20'
      : 'shadow-emerald-500/10 hover:shadow-emerald-500/20';

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.22, 1, 0.36, 1] }}
      className="group relative"
    >
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut', delay }}
        className={cn(
          'relative z-10 flex w-36 flex-col items-center justify-center rounded-3xl p-6 sm:w-44 sm:p-7',
          'border border-white/[0.06] bg-card/60 backdrop-blur-2xl',
          'shadow-xl transition-all duration-500',
          'hover:scale-105 hover:bg-card/80',
          glowColor
        )}
      >
        {children}
      </motion.div>

      {/* Reflection */}
      <div className="absolute inset-0 -z-10 translate-y-4 scale-90 rounded-3xl bg-white/[0.02] blur-xl transition-all group-hover:bg-white/[0.04]" />
    </motion.div>
  );
}
