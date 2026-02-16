'use client';

import { cn } from '@/lib/utils';

/**
 * Transfer journey illustration — wallet sending to bank via bridge.
 * Clean line-art style for light background.
 */
export function TransferJourneyScene({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center', className)}>
      <svg viewBox="0 0 400 200" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full max-w-[400px]">
        <ellipse cx="200" cy="110" rx="180" ry="80" fill="#F0FDF4" opacity="0.5" />

        {/* Source: Wallet icon */}
        <g transform="translate(30, 50)">
          <rect x="0" y="10" width="60" height="48" rx="8" fill="#EEF2FF" stroke="#C7D2FE" strokeWidth="1.5" />
          <rect x="0" y="10" width="60" height="18" rx="8" fill="#4F46E5" opacity="0.1" />
          <circle cx="48" cy="40" r="6" fill="#4F46E5" opacity="0.15" />
          <text x="10" y="24" fontSize="7" fontWeight="600" fill="#4F46E5">WALLET</text>
          <text x="30" y="76" textAnchor="middle" fontSize="8" fill="#6B7280">You send</text>
        </g>

        {/* Arrow 1 */}
        <line x1="100" y1="60" x2="145" y2="60" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="3 3" />
        <polygon points="145,56 153,60 145,64" fill="#4F46E5" opacity="0.6" />

        {/* Bridge: CryptoPay */}
        <g transform="translate(155, 35)">
          <rect x="0" y="0" width="90" height="52" rx="12" fill="#fff" stroke="#4F46E5" strokeWidth="1.5" strokeDasharray="0" />
          <text x="45" y="22" textAnchor="middle" fontSize="9" fontWeight="700" fill="#4F46E5">CryptoPay</text>
          <text x="45" y="36" textAnchor="middle" fontSize="7" fill="#6B7280">Convert & settle</text>
          {/* Small shield */}
          <circle cx="45" cy="60" r="10" fill="#DCFCE7" />
          <text x="45" y="64" textAnchor="middle" fontSize="8" fill="#16A34A">✓</text>
        </g>

        {/* Arrow 2 */}
        <line x1="250" y1="60" x2="295" y2="60" stroke="#D1D5DB" strokeWidth="1.5" strokeDasharray="3 3" />
        <polygon points="295,56 303,60 295,64" fill="#16A34A" opacity="0.6" />

        {/* Destination: Bank */}
        <g transform="translate(308, 35)">
          <rect x="0" y="0" width="62" height="52" rx="8" fill="#F0FDF4" stroke="#BBF7D0" strokeWidth="1.5" />
          <text x="31" y="24" textAnchor="middle" fontSize="9" fontWeight="700" fill="#16A34A">ETB</text>
          <text x="31" y="38" textAnchor="middle" fontSize="7" fill="#6B7280">Bank</text>
          <text x="31" y="72" textAnchor="middle" fontSize="8" fill="#6B7280">They receive</text>
        </g>

        {/* Timeline bar */}
        <g transform="translate(80, 140)">
          <line x1="0" y1="0" x2="240" y2="0" stroke="#E5E7EB" strokeWidth="2" />
          <circle cx="0" cy="0" r="4" fill="#4F46E5" />
          <circle cx="120" cy="0" r="4" fill="#4F46E5" opacity="0.5" />
          <circle cx="240" cy="0" r="4" fill="#16A34A" />
          <text x="0" y="16" textAnchor="middle" fontSize="7" fill="#6B7280">Funded</text>
          <text x="120" y="16" textAnchor="middle" fontSize="7" fill="#6B7280">Settling</text>
          <text x="240" y="16" textAnchor="middle" fontSize="7" fill="#6B7280">Delivered</text>
        </g>
      </svg>
    </div>
  );
}
