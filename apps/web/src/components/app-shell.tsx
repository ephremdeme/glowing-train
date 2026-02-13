'use client';

import Link from 'next/link';
import type { Route } from 'next';
import { usePathname, useRouter } from 'next/navigation';
import { LogOut, ShieldCheck } from 'lucide-react';
import { FlowProgress } from '@/components/flow-progress';
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

  const session = readAuthSession();
  const showProgress = !pathname.startsWith('/signup') && !pathname.startsWith('/login');
  const navLinks: Array<{ href: Route; label: string }> = [
    { href: '/quote' as Route, label: 'Quote' },
    { href: '/transfer' as Route, label: 'Transfer' },
    { href: '/history' as Route, label: 'History' }
  ];

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/90 backdrop-blur-xl">
        <div className="container flex h-[72px] items-center justify-between">
          <Link href={'/' as Route} className="inline-flex items-center gap-2 text-sm font-semibold tracking-wide text-slate-900">
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-primary">CP</span>
            CryptoPay Sender
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  'rounded-full px-3 py-2 text-sm transition',
                  pathname.startsWith(link.href)
                    ? 'bg-primary/15 text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
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

      <main className="container pb-12 pt-8">
        <div className="grid gap-6">
          {showProgress ? <FlowProgress /> : null}
          {children}
        </div>
      </main>
    </div>
  );
}
