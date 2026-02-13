'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const steps: Array<{ href: Route; label: string; id: string }> = [
  { href: '/' as Route, label: 'Landing', id: 'landing' },
  { href: '/signup' as Route, label: 'Signup', id: 'signup' },
  { href: '/login' as Route, label: 'Login', id: 'login' },
  { href: '/quote' as Route, label: 'Quote', id: 'quote' },
  { href: '/transfer' as Route, label: 'Transfer', id: 'transfer' },
  { href: '/history' as Route, label: 'History', id: 'history' }
];

function pathToStepIndex(pathname: string): number {
  if (pathname.startsWith('/history') || pathname.startsWith('/receipts') || pathname.startsWith('/transfers')) return 5;
  if (pathname.startsWith('/transfer')) return 4;
  if (pathname.startsWith('/quote')) return 3;
  if (pathname.startsWith('/login')) return 2;
  if (pathname.startsWith('/signup')) return 1;
  return 0;
}

export function FlowProgress() {
  const pathname = usePathname();
  const activeIndex = pathToStepIndex(pathname);

  return (
    <div className="rounded-2xl border border-border/70 bg-card/70 p-4 shadow-panel">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Sender Journey</p>
        <Badge variant="outline">Step {activeIndex + 1} / {steps.length}</Badge>
      </div>

      <div className="grid gap-2 sm:grid-cols-6">
        {steps.map((step, index) => {
          const isActive = index === activeIndex;
          const isPassed = index < activeIndex;
          return (
            <Link
              key={step.id}
              href={step.href}
              className={cn(
                'rounded-xl border px-3 py-2 text-center text-xs font-medium transition',
                isActive && 'border-primary bg-primary/20 text-primary',
                isPassed && 'border-emerald-600/30 bg-emerald-600/10 text-emerald-700',
                !isActive && !isPassed && 'border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground'
              )}
            >
              {step.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
