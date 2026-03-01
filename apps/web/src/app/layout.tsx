import type { Metadata } from 'next';
import { Manrope, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { QueryProvider } from '@/components/providers/query-provider';
import { WalletProvider } from '@/components/wallet/wallet-provider';
import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from 'sonner';
import './globals.css';

const fontDisplay = Manrope({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700']
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'CryptoPay — Send Crypto, Deliver ETB',
  description: 'Non-custodial crypto-funded remittance to Ethiopia. Fast, secure, $1 flat fee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${fontDisplay.variable} ${fontMono.variable} [--font-serif:var(--font-display)]`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            <WalletProvider>
              <AppShell>{children}</AppShell>
            </WalletProvider>
          </QueryProvider>
          <Toaster richColors closeButton position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
