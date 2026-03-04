'use client';

import { useState } from 'react';
import { QrCode, Wallet, Copy } from 'lucide-react';

type Tab = 'qr' | 'wallet' | 'manual';

interface PaymentMethodTabsProps {
    defaultTab?: Tab;
    children: {
        qr: React.ReactNode;
        wallet: React.ReactNode;
        manual: React.ReactNode;
    };
}

const TAB_META: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'qr', label: 'Scan QR', icon: QrCode },
    { id: 'wallet', label: 'Wallet', icon: Wallet },
    { id: 'manual', label: 'Copy', icon: Copy },
];

/**
 * Tabbed view for mobile — lets users choose between scanning a QR code,
 * paying via a connected wallet, or copying the deposit address manually.
 * On desktop, these are stacked vertically; on mobile, tabs save space.
 */
export function PaymentMethodTabs({ children, defaultTab = 'manual' }: PaymentMethodTabsProps) {
    const [active, setActive] = useState<Tab>(defaultTab);

    return (
        <div className="grid gap-4">
            {/* Tab bar */}
            <div className="flex rounded-xl border border-border/60 bg-muted/30 p-1" role="tablist">
                {TAB_META.map(({ id, label, icon: Icon }) => (
                    <button
                        key={id}
                        role="tab"
                        aria-selected={active === id}
                        onClick={() => setActive(id)}
                        className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${active === id
                                ? 'bg-background text-primary shadow-sm'
                                : 'text-muted-foreground hover:text-foreground'
                            }`}
                    >
                        <Icon className="h-3.5 w-3.5" />
                        <span className="hidden xs:inline sm:inline">{label}</span>
                    </button>
                ))}
            </div>

            {/* Tab content */}
            <div role="tabpanel" className="min-h-[120px]">
                {active === 'qr' && children.qr}
                {active === 'wallet' && children.wallet}
                {active === 'manual' && children.manual}
            </div>
        </div>
    );
}
