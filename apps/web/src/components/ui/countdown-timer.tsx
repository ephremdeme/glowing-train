'use client';

import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';

interface CountdownTimerProps {
    /** ISO 8601 expiry timestamp */
    expiresAt: string;
    /** Called when the timer reaches zero */
    onExpired?: () => void;
}

function formatRemaining(ms: number): string {
    if (ms <= 0) return '0:00';
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function urgencyClass(ms: number): string {
    if (ms <= 0) return 'text-destructive';
    if (ms <= 30_000) return 'text-destructive animate-pulse';
    if (ms <= 120_000) return 'text-amber-500';
    return 'text-muted-foreground';
}

export function CountdownTimer({ expiresAt, onExpired }: CountdownTimerProps) {
    const [remainingMs, setRemainingMs] = useState(() => {
        return new Date(expiresAt).getTime() - Date.now();
    });

    useEffect(() => {
        const interval = setInterval(() => {
            const ms = new Date(expiresAt).getTime() - Date.now();
            setRemainingMs(ms);
            if (ms <= 0) {
                clearInterval(interval);
                onExpired?.();
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [expiresAt, onExpired]);

    const expired = remainingMs <= 0;

    return (
        <div className={`inline-flex items-center gap-1.5 text-sm font-medium ${urgencyClass(remainingMs)}`}>
            <Clock className="h-3.5 w-3.5" />
            {expired ? (
                <span>Quote expired</span>
            ) : (
                <span>{formatRemaining(remainingMs)} remaining</span>
            )}
        </div>
    );
}
