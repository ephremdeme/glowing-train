'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { clearAuthSession, readAuthSession } from '@/lib/session';

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  const session = readAuthSession();
  const navLinks: Array<{ href: Route; label: string }> = [
    { href: '/quote' as Route, label: 'Quote' },
    { href: '/transfer' as Route, label: 'Transfer' },
    { href: '/history' as Route, label: 'History' }
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-white/80 backdrop-blur-md">
        <div className="container flex h-16 items-center justify-between gap-4">
          <Link href={'/' as Route} className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs font-bold text-white">
              CP
            </span>
            <span className="text-sm font-semibold text-foreground">CryptoPay</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  pathname.startsWith(link.href)
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {session ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                      {(session.fullName ?? 'U').charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden sm:inline">{session.fullName ?? 'Account'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem disabled className="text-xs text-muted-foreground">
                    {session.customerId ?? 'Authenticated'}
                  </DropdownMenuItem>
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

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground md:hidden"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {mobileOpen && (
          <nav className="border-t border-border bg-white px-4 pb-4 pt-2 md:hidden">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'block rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  pathname.startsWith(link.href)
                    ? 'bg-primary/8 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>
        )}
      </header>

      <main className="container flex-1 pb-16 pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/60 bg-slate-50/60">
        <div className="container py-10">
          <div className="grid gap-8 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="mb-3 flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-[10px] font-bold text-white">
                  CP
                </span>
                <span className="text-sm font-semibold text-foreground">CryptoPay</span>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Non-custodial crypto-to-ETB remittance. Send stablecoins from your wallet and deliver Ethiopian Birr to any bank account.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">Product</h4>
              <ul className="grid gap-2">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted-foreground transition-colors hover:text-foreground">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-foreground">Legal</h4>
              <ul className="grid gap-2">
                <li>
                  <span className="text-sm text-muted-foreground">Terms of Service</span>
                </li>
                <li>
                  <span className="text-sm text-muted-foreground">Privacy Policy</span>
                </li>
                <li>
                  <span className="text-sm text-muted-foreground">AML Policy</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-8 border-t border-border/60 pt-6">
            <p className="text-xs text-muted-foreground">
              © {new Date().getFullYear()} CryptoPay. All rights reserved. CryptoPay is not a bank and does not hold customer funds.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
