import type { Metadata } from 'next';
import { Space_Grotesk, JetBrains_Mono } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { WalletProvider } from '@/components/wallet/wallet-provider';
import './globals.css';

const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-display'
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono'
});

export const metadata: Metadata = {
  title: 'CryptoPay Sender',
  description: 'Non-custodial crypto-funded remittance to Ethiopia'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${fontDisplay.variable} ${fontMono.variable}`}>
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </body>
    </html>
  );
}
