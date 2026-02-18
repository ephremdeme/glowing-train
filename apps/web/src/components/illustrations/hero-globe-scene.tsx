'use client';

import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Wallet, Landmark, ArrowRight, Zap } from 'lucide-react';

/**
 * Premium Apple-style illustration showing the flow of value.
 * Uses framer-motion for smooth, high-quality animations.
 * Concept: Floating Glass Cards (Wallet -> Bank) connected by a beam of light.
 */
export function HeroGlobeScene({ className }: { className?: string }) {
  return (
    <div className={cn('relative flex items-center justify-center py-20', className)}>
      {/* ── Ambient Background Glows ── */}
      <motion.div 
        animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
        className="absolute top-1/2 left-1/4 h-80 w-80 -translate-y-1/2 rounded-full bg-blue-500/20 blur-[100px]" 
      />
      <motion.div 
        animate={{ scale: [1.2, 1, 1.2], opacity: [0.3, 0.5, 0.3] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 4 }}
        className="absolute top-1/2 right-1/4 h-80 w-80 -translate-y-1/2 rounded-full bg-indigo-500/20 blur-[100px]" 
      />

      <div className="relative z-10 flex w-full max-w-4xl items-center justify-center gap-12 sm:gap-24">
        
        {/* ── Left Card: Wallet ── */}
        <GlassCard delay={0}>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
            <Wallet className="h-8 w-8 text-white" />
          </div>
          <div className="mt-5 text-center">
            <p className="text-base font-bold text-slate-900">Your Wallet</p>
            <p className="text-xs font-semibold text-slate-500">USDC / USDT</p>
          </div>
        </GlassCard>

        {/* ── Flow Animation ── */}
        <div className="relative flex flex-1 flex-col items-center justify-center px-4">
          {/* Connection Line with Gradient */}
          <div className="absolute top-1/2 h-[2px] w-full max-w-[200px] -translate-y-1/2 bg-gradient-to-r from-transparent via-blue-200 to-transparent" />
          
          {/* Moving Particle */}
          <motion.div
            animate={{ x: [-80, 80], opacity: [0, 1, 0] }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute top-1/2 -translate-y-1/2 z-20"
          >
            <div className="relative h-3 w-3 rounded-full bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.8)]">
              <div className="absolute inset-0 animate-ping rounded-full bg-blue-600 opacity-50" />
            </div>
          </motion.div>

          {/* Label Chip */}
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="relative z-10 flex items-center gap-2 rounded-full border border-white/50 bg-white/40 px-3 py-1.5 shadow-sm backdrop-blur-md"
          >
            <Zap className="h-3 w-3 fill-yellow-400 text-yellow-400" />
            <span className="text-[10px] font-bold tracking-wide text-slate-600 uppercase">Instant Transfer</span>
          </motion.div>
        </div>

        {/* ── Right Card: Bank ── */}
        <GlassCard delay={0.2}>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg shadow-slate-200/50 border border-slate-100">
            <Landmark className="h-8 w-8 text-emerald-600" />
          </div>
          <div className="mt-5 text-center">
            <p className="text-base font-bold text-slate-900">Bank Account</p>
            <div className="mt-1 flex items-center justify-center gap-1.5 rounded-full bg-emerald-100/50 px-2 py-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" />
              <p className="text-xs font-bold text-emerald-700">ETB Received</p>
            </div>
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

function GlassCard({ children, delay }: { children: React.ReactNode; delay: number }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: "easeOut" }}
      className="group relative"
    >
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", delay }}
        className="relative z-10 flex h-48 w-40 flex-col items-center justify-center rounded-3xl border border-white/60 bg-white/80 p-5 shadow-2xl shadow-slate-200/50 backdrop-blur-xl transition-all duration-300 hover:scale-105 hover:bg-white/90"
      >
        {children}
      </motion.div>
      
      {/* Reflection effect */}
      <div className="absolute inset-0 -z-10 translate-y-4 scale-90 rounded-3xl bg-slate-200/50 blur-xl transition-all group-hover:bg-blue-200/50" />
    </motion.div>
  );
}
