'use client';

import { cn } from '@/lib/utils';

/**
 * Clean flat illustration showing the remittance flow:
 * Wallet (phone) → Stablecoin (USDC/USDT) → CryptoPay → Bank → ETB
 * Redesigned for maximum readability with bolder text and thicker strokes.
 */
export function HeroGlobeScene({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <svg viewBox="0 0 680 380" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[680px]">
        {/* Soft background shape */}
        <ellipse cx="340" cy="180" rx="310" ry="160" fill="#EEF2FF" opacity="0.5" />

        {/* ── Phone / Wallet ── */}
        <g transform="translate(20, 50)">
          <rect x="0" y="0" width="90" height="140" rx="14" fill="#fff" stroke="#C7D2FE" strokeWidth="2.5" />
          <rect x="8" y="20" width="74" height="92" rx="8" fill="#EEF2FF" />
          {/* Wallet icon */}
          <circle cx="45" cy="66" r="24" fill="#4F46E5" opacity="0.12" />
          <text x="45" y="74" textAnchor="middle" fontSize="18" fontWeight="700" fill="#4F46E5">$</text>
          {/* Label */}
          <text x="45" y="134" textAnchor="middle" fontSize="12" fontWeight="600" fill="#6B7280">Your Wallet</text>
        </g>

        {/* ── Arrow 1 ── */}
        <g transform="translate(128, 130)">
          <line x1="0" y1="0" x2="70" y2="0" stroke="#C7D2FE" strokeWidth="3" strokeDasharray="7 5" />
          <polygon points="70,-6 82,0 70,6" fill="#4F46E5" />
        </g>

        {/* ── Stablecoin circle ── */}
        <g transform="translate(220, 60)">
          <circle cx="55" cy="60" r="52" fill="#fff" stroke="#C7D2FE" strokeWidth="2.5" />
          <circle cx="55" cy="60" r="36" fill="#4F46E5" opacity="0.08" />
          {/* Dual coin label */}
          <text x="55" y="53" textAnchor="middle" fontSize="14" fontWeight="700" fill="#4F46E5">USDC</text>
          <text x="55" y="70" textAnchor="middle" fontSize="14" fontWeight="700" fill="#7C3AED">USDT</text>
          {/* Network badge */}
          <rect x="18" y="108" width="74" height="24" rx="12" fill="#EEF2FF" stroke="#E0E7FF" strokeWidth="1.5" />
          <text x="55" y="124" textAnchor="middle" fontSize="10" fontWeight="600" fill="#4F46E5">Base / Solana</text>
        </g>

        {/* ── Arrow 2 (CryptoPay conversion) ── */}
        <g transform="translate(345, 108)">
          <rect x="0" y="-20" width="96" height="40" rx="20" fill="#4F46E5" />
          <text x="48" y="-3" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">CryptoPay</text>
          <line x1="96" y1="0" x2="124" y2="0" stroke="#C7D2FE" strokeWidth="3" />
          <polygon points="124,-6 136,0 124,6" fill="#4F46E5" />
        </g>

        {/* ── Bank Building ── */}
        <g transform="translate(490, 38)">
          {/* Roof */}
          <polygon points="65,0 130,38 0,38" fill="#4F46E5" opacity="0.1" />
          <polygon points="65,5 122,38 8,38" fill="none" stroke="#4F46E5" strokeWidth="2.5" opacity="0.4" />
          {/* Pillars */}
          <rect x="18" y="42" width="14" height="56" rx="4" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
          <rect x="46" y="42" width="14" height="56" rx="4" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
          <rect x="74" y="42" width="14" height="56" rx="4" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
          <rect x="102" y="42" width="14" height="56" rx="4" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
          {/* Base */}
          <rect x="4" y="98" width="122" height="16" rx="4" fill="#E0E7FF" stroke="#C7D2FE" strokeWidth="1.5" />
          {/* ETB label */}
          <rect x="28" y="122" width="74" height="28" rx="14" fill="#DCFCE7" />
          <text x="65" y="140" textAnchor="middle" fontSize="13" fontWeight="700" fill="#16A34A">ETB ✓</text>
          {/* Bank label */}
          <text x="65" y="168" textAnchor="middle" fontSize="12" fontWeight="600" fill="#6B7280">Bank Payout</text>
        </g>

        {/* ── Flow label ── */}
        <text x="340" y="330" textAnchor="middle" fontSize="13" fontWeight="600" fill="#9CA3AF">
          Non-custodial · ~10 min · $1 flat fee
        </text>
      </svg>
    </div>
  );
}
