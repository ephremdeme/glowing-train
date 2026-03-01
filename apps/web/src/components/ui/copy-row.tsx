'use client';

import { useState } from 'react';
import { CheckCircle, Copy } from 'lucide-react';

interface CopyRowProps {
    label: string;
    value: string;
}

export function CopyRow({ label, value }: CopyRowProps) {
    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState<string | null>(null);

    async function copy() {
        try {
            await navigator.clipboard.writeText(value);
            setCopyError(null);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            setCopyError('Copy failed');
            setCopied(false);
        }
    }

    return (
        <div className="grid gap-1.5">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5">
                <code className="flex-1 truncate text-sm font-mono text-foreground">{value}</code>
                <button
                    onClick={copy}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-primary/15 hover:text-primary"
                    aria-label={`Copy ${label}`}
                >
                    {copied ? <CheckCircle className="h-4 w-4 text-accent" /> : <Copy className="h-4 w-4" />}
                </button>
            </div>
            {copyError ? <p className="text-xs text-muted-foreground">{copyError}</p> : null}
        </div>
    );
}
