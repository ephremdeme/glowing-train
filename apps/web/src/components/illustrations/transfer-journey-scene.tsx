'use client';

import { cn } from '@/lib/utils';

/**
 * Transfer journey illustration — wallet sending to bank via bridge.
 * Clean line-art style for light background.
 */
export function TransferJourneyScene({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <svg viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[550px]">
        {/* Abstract background shape */}
        <ellipse cx="200" cy="110" rx="180" ry="80" className="fill-emerald-50 dark:fill-emerald-950" opacity="0.6" />

        {/* Source: Wallet icon */}
        <g transform="translate(30, 50)">
          <rect x="0" y="10" width="60" height="48" rx="8" className="fill-indigo-50 dark:fill-indigo-950 stroke-indigo-200 dark:stroke-indigo-800" strokeWidth="1.5" />
          <rect x="0" y="10" width="60" height="18" rx="8" className="fill-indigo-600 dark:fill-indigo-400" opacity="0.1" />
          <circle cx="48" cy="40" r="6" className="fill-indigo-600 dark:fill-indigo-400" opacity="0.2" />
          <text x="10" y="24" fontSize="7" fontWeight="600" className="fill-indigo-600 dark:fill-indigo-400">WALLET</text>
          <text x="30" y="76" textAnchor="middle" fontSize="8" className="fill-muted-foreground">You send</text>
        </g>

        {/* Arrow 1 */}
        <line x1="100" y1="60" x2="145" y2="60" className="stroke-border" strokeWidth="1.5" strokeDasharray="3 3" />
        <polygon points="145,56 153,60 145,64" className="fill-indigo-600 dark:fill-indigo-500" opacity="0.8" />

        {/* Bridge: CryptoPay */}
        <g transform="translate(155, 35)">
          <rect x="0" y="0" width="90" height="52" rx="12" className="fill-background stroke-indigo-600 dark:stroke-indigo-500" strokeWidth="1.5" strokeDasharray="0" />
          <text x="45" y="22" textAnchor="middle" fontSize="9" fontWeight="700" className="fill-indigo-600 dark:fill-indigo-400">CryptoPay</text>
          <text x="45" y="36" textAnchor="middle" fontSize="7" className="fill-muted-foreground">Convert & settle</text>
          {/* Small shield */}
          <circle cx="45" cy="60" r="10" className="fill-emerald-100 dark:fill-emerald-900/50" />
          <text x="45" y="64" textAnchor="middle" fontSize="8" className="fill-emerald-600 dark:fill-emerald-400">✓</text>
        </g>

        {/* Arrow 2 */}
        <line x1="250" y1="60" x2="295" y2="60" className="stroke-border" strokeWidth="1.5" strokeDasharray="3 3" />
        <polygon points="295,56 303,60 295,64" className="fill-emerald-600 dark:fill-emerald-500" opacity="0.8" />

        {/* Destination: Bank */}
        <g transform="translate(308, 35)">
          <rect x="0" y="0" width="62" height="52" rx="8" className="fill-emerald-50 dark:fill-emerald-950/40 stroke-emerald-200 dark:stroke-emerald-800" strokeWidth="1.5" />
          <text x="31" y="24" textAnchor="middle" fontSize="9" fontWeight="700" className="fill-emerald-600 dark:fill-emerald-400">ETB</text>
          <text x="31" y="38" textAnchor="middle" fontSize="7" className="fill-muted-foreground">Bank</text>
          <text x="31" y="72" textAnchor="middle" fontSize="8" className="fill-muted-foreground">They receive</text>
        </g>

        {/* Timeline bar */}
        <g transform="translate(80, 140)">
          <line x1="0" y1="0" x2="240" y2="0" className="stroke-border" strokeWidth="2" />
          <circle cx="0" cy="0" r="4" className="fill-indigo-600 dark:fill-indigo-500" />
          <circle cx="120" cy="0" r="4" className="fill-indigo-600 dark:fill-indigo-500" opacity="0.6" />
          <circle cx="240" cy="0" r="4" className="fill-emerald-600 dark:fill-emerald-500" />
          <text x="0" y="16" textAnchor="middle" fontSize="7" className="fill-muted-foreground">Funded</text>
          <text x="120" y="16" textAnchor="middle" fontSize="7" className="fill-muted-foreground">Settling</text>
          <text x="240" y="16" textAnchor="middle" fontSize="7" className="fill-muted-foreground">Delivered</text>
        </g>
      </svg>
    </div>
  );
}
