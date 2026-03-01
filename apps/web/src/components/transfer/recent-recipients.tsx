'use client';

import { useEffect, useState } from 'react';
import { Clock, User } from 'lucide-react';

export interface RecentRecipient {
    id: string;
    fullName: string;
    bankCode: string;
    bankAccountNumber: string;
    lastUsedAt: string;
}

const STORAGE_KEY = 'cryptopay:recent_recipients';
const MAX_RECENT = 5;

/** Read recent recipients from localStorage. */
export function readRecentRecipients(): RecentRecipient[] {
    if (typeof window === 'undefined') return [];
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        return JSON.parse(raw) as RecentRecipient[];
    } catch {
        return [];
    }
}

/** Save a recipient to the front of the recent list. */
export function saveRecentRecipient(recipient: Omit<RecentRecipient, 'lastUsedAt'>): void {
    if (typeof window === 'undefined') return;
    try {
        const existing = readRecentRecipients().filter((r) => r.id !== recipient.id);
        const updated: RecentRecipient[] = [
            { ...recipient, lastUsedAt: new Date().toISOString() },
            ...existing,
        ].slice(0, MAX_RECENT);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch {
        // localStorage quota or privacy mode — silently ignore
    }
}

interface RecentRecipientsProps {
    /** Called when the user selects a recent recipient. */
    onSelect: (recipient: RecentRecipient) => void;
}

/**
 * Quick-select chips showing the user's most recent recipients.
 * Data is stored in localStorage — no backend call needed.
 */
export function RecentRecipients({ onSelect }: RecentRecipientsProps) {
    const [recipients, setRecipients] = useState<RecentRecipient[]>([]);

    useEffect(() => {
        setRecipients(readRecentRecipients());
    }, []);

    if (recipients.length === 0) return null;

    return (
        <div className="grid gap-2">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Recent recipients
            </p>
            <div className="flex flex-wrap gap-2">
                {recipients.map((r) => (
                    <button
                        key={r.id}
                        type="button"
                        onClick={() => onSelect(r)}
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-primary active:scale-[0.97]"
                    >
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[120px] truncate">{r.fullName}</span>
                        <span className="text-muted-foreground">·</span>
                        <span className="font-mono text-muted-foreground">{r.bankAccountNumber.slice(-4)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
