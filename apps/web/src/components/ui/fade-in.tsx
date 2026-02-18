'use client';

import { motion, useScroll, useTransform, useSpring } from 'framer-motion';
import type { ReactNode } from 'react';
import { useRef } from 'react';

/* ═══════════════════════════════════════════════
   Motion System — CryptoPay
   Spring-based scroll-driven animations with
   orchestrated reveals for premium feel.
   ═══════════════════════════════════════════════ */

const springConfig = { stiffness: 100, damping: 30, mass: 0.8 };

/**
 * Fade-in wrapper with spring physics.
 * Triggers as element enters viewport.
 */
export function FadeIn({
  children,
  delay = 0,
  className,
  direction = 'up',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  direction?: 'up' | 'down' | 'left' | 'right' | 'none';
}) {
  const initial: Record<string, number> = { opacity: 0 };
  const animate: Record<string, number> = { opacity: 1 };

  if (direction === 'up') { initial.y = 24; animate.y = 0; }
  if (direction === 'down') { initial.y = -24; animate.y = 0; }
  if (direction === 'left') { initial.x = 24; animate.x = 0; }
  if (direction === 'right') { initial.x = -24; animate.x = 0; }

  return (
    <motion.div
      initial={initial}
      whileInView={animate}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger container — orchestrates children with sequential delays.
 */
export function StaggerContainer({
  children,
  className,
  delay = 0,
  stagger = 0.08,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-60px' }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: stagger,
            delayChildren: delay,
          },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * Stagger child — used inside StaggerContainer.
 */
export function FadeInItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 20 },
        visible: {
          opacity: 1,
          y: 0,
          transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
        },
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * RevealText — per-word staggered text reveal for headlines.
 * Creates a cinematic, Apple Keynote-style text entrance.
 */
export function RevealText({
  children,
  className,
  delay = 0,
}: {
  children: string;
  className?: string;
  delay?: number;
}) {
  const words = children.split(' ');

  return (
    <motion.span
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-40px' }}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: 0.06,
            delayChildren: delay,
          },
        },
      }}
      className={className}
    >
      {words.map((word, i) => (
        <motion.span
          key={`${word}-${i}`}
          variants={{
            hidden: { opacity: 0, y: 12, filter: 'blur(4px)' },
            visible: {
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
            },
          }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

/**
 * SmoothSection — scroll-velocity-aware wrapper with subtle parallax.
 */
export function SmoothSection({
  children,
  className,
  speed = 0.1,
}: {
  children: ReactNode;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [40 * speed, -40 * speed]);
  const smoothY = useSpring(y, springConfig);

  return (
    <motion.section ref={ref} style={{ y: smoothY }} className={className}>
      {children}
    </motion.section>
  );
}

/**
 * FloatingElement — continuous gentle float with configurable amplitude.
 */
export function FloatingElement({
  children,
  className,
  amplitude = 8,
  duration = 5,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  amplitude?: number;
  duration?: number;
  delay?: number;
}) {
  return (
    <motion.div
      animate={{ y: [0, -amplitude, 0] }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
      }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/**
 * ScaleOnView — scales from smaller size as it enters viewport.
 */
export function ScaleOnView({
  children,
  className,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.7, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
