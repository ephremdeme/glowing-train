'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { clearAuthSession, readAuthSession, signOutCurrentSession } from '@/lib/session';

function shortCustomerId(customerId: string | null): string | null {
  if (!customerId || customerId.length < 8) return customerId;
  return `${customerId.slice(0, 8)}...${customerId.slice(-4)}`;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const session = readAuthSession();
  const shortId = shortCustomerId(session?.customerId ?? null);
  const identityPrimary = session?.fullName ?? shortId ?? 'Authenticated';
  const identitySecondary = session?.fullName ? shortId : null;
  const navLinks: Array<{ href: Route; label: string }> = [
    { href: '/quote' as Route, label: 'Quote' },
    { href: '/transfer' as Route, label: 'Transfer' },
    { href: '/history' as Route, label: 'History' }
  ];

  return (
    <div className="relative flex min-h-screen flex-col bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 border-b border-border/30 bg-background/60 backdrop-blur-2xl">
        <div className="container flex h-16 items-center justify-between gap-4">
          {/* Logo */}
          <Link href={'/' as Route} className="flex items-center gap-2.5 group">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-xs font-semibold text-white shadow-lg shadow-amber-500/20 transition-transform group-hover:scale-105">
              CP
            </span>
            <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">CryptoPay</span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden items-center gap-1 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
                  pathname.startsWith(link.href)
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <ThemeToggle />

            {session ? (
              <DropdownMenu
                open={menuOpen}
                onOpenChange={(open) => {
                  setMenuOpen(open);
                  if (open) {
                    setLogoutError(null);
                  }
                }}
              >
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 to-primary/10 text-xs font-semibold text-primary ring-1 ring-primary/20">
                      {(session.fullName ?? 'U').charAt(0).toUpperCase()}
                    </span>
                    <span className="hidden text-sm font-medium text-foreground sm:inline">{session.fullName ?? shortId ?? 'Account'}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-card border-border/50 backdrop-blur-xl">
                  <DropdownMenuItem disabled className="flex flex-col items-start gap-0.5 py-2">
                    <span className="text-xs font-medium text-foreground">{identityPrimary}</span>
                    {identitySecondary ? <span className="text-[11px] text-muted-foreground">{identitySecondary}</span> : null}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border/30" />
                  <DropdownMenuItem
                    onSelect={async (event) => {
                      event.preventDefault();
                      if (logoutBusy) return;

                      setLogoutBusy(true);
                      setLogoutError(null);
                      const result = await signOutCurrentSession();
                      setLogoutBusy(false);

                      if (!result.ok) {
                        setLogoutError(result.message);
                        return;
                      }

                      clearAuthSession();
                      setMenuOpen(false);
                      router.push('/login' as Route);
                      router.refresh();
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <LogOut className="mr-2 h-4 w-4" />
                    {logoutBusy ? 'Signing out...' : logoutError ? 'Retry sign out' : 'Sign out'}
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
              className="rounded-lg p-2 text-muted-foreground hover:text-foreground md:hidden transition-colors"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile nav overlay */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              className="overflow-hidden border-t border-border/20 bg-card/95 backdrop-blur-xl md:hidden"
            >
              <div className="px-4 pb-4 pt-2">
                {navLinks.map((link, i) => (
                  <motion.div
                    key={link.href}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.3 }}
                  >
                    <Link
                      href={link.href}
                      onClick={() => setMobileOpen(false)}
                      className={cn(
                        'block rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                        pathname.startsWith(link.href)
                          ? 'bg-primary/10 text-primary'
                          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                      )}
                    >
                      {link.label}
                    </Link>
                  </motion.div>
                ))}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>
      </header>

      <main className="container flex-1 pb-16 pt-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-border/20 bg-card/30">
        <div className="container py-12">
          <div className="grid gap-10 md:grid-cols-4">
            {/* Brand */}
            <div className="md:col-span-2">
              <div className="mb-4 flex items-center gap-2.5">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 text-[10px] font-semibold text-white">
                  CP
                </span>
                <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">CryptoPay</span>
              </div>
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Non-custodial crypto-to-ETB remittance. Send stablecoins from your wallet
                and deliver Ethiopian Birr to any bank account.
              </p>
            </div>

            {/* Product */}
            <div>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">
                Product
              </h4>
              <ul className="grid gap-2.5">
                {navLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Legal */}
            <div>
              <h4 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.09em] text-muted-foreground/60">
                Legal
              </h4>
              <ul className="grid gap-2.5">
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

          {/* Divider with subtle gradient */}
          <div className="mt-10 h-px bg-gradient-to-r from-transparent via-border/40 to-transparent" />

          <div className="mt-6 flex flex-col items-center justify-between gap-4 sm:flex-row">
            <p className="text-xs text-muted-foreground/50">
              © {new Date().getFullYear()} CryptoPay. All rights reserved.
            </p>
            <p className="text-xs text-muted-foreground/40">
              CryptoPay is not a bank and does not hold customer funds.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
