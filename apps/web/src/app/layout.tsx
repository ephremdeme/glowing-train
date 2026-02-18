import type { Metadata } from 'next';
import { Sora, Fraunces, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { WalletProvider } from '@/components/wallet/wallet-provider';
import { ThemeProvider } from '@/components/theme-provider';
import './globals.css';

const fontDisplay = Sora({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

const fontSerif = Fraunces({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap',
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
        className={`${fontDisplay.variable} ${fontSerif.variable} ${fontMono.variable}`}
        suppressHydrationWarning
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <WalletProvider>
            <AppShell>{children}</AppShell>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
