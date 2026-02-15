'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { clearAuthSession, readAuthSession } from '@/lib/session';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  const session = readAuthSession();
  const navLinks: Array<{ href: Route; label: string }> = [
    { href: '/quote' as Route, label: 'Quote' },
    { href: '/transfer' as Route, label: 'Transfer' },
    { href: '/history' as Route, label: 'History' }
  ];

  return (
    <div className="relative min-h-screen pb-10">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-[#050b21]/70 backdrop-blur-xl">
        <div className="container flex h-[74px] items-center justify-between gap-3">
          <Link href={'/' as Route} className="inline-flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-primary/20 text-sm font-black text-primary shadow-glow">
              CP
            </span>
            <div className="grid">
              <span className="text-sm font-semibold tracking-wide text-foreground">CryptoPay Sender</span>
              <span className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Non-custodial remittance</span>
            </div>
          </Link>

          <nav className="hidden items-center gap-1 rounded-2xl border border-border/70 bg-card/45 p-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-xl px-4 py-2 text-sm transition',
                  pathname.startsWith(link.href)
                    ? 'bg-primary/25 text-primary shadow-glow'
                    : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <Badge variant="outline" className="hidden border-accent/30 bg-accent/10 text-accent md:inline-flex">
              ETA ~10 min payout
            </Badge>
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2">
                    <ShieldCheck className="h-4 w-4 text-accent" />
                    {session.fullName ?? 'Sender'}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled>{session.customerId ?? 'Authenticated user'}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => {
                      clearAuthSession();
                      router.push('/login' as Route);
                    }}
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link href={'/login' as Route}>Sign in</Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="container pt-8">
        <div className="grid gap-6">{children}</div>
      </main>
    </div>
  );
}
