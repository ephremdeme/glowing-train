'use client';

import { useEffect, useRef, useState } from 'react';
import { getBaseChainId, getBaseTokenContract } from '@/lib/evm/base-config';

interface QrDepositProps {
    chain: 'base' | 'solana';
    depositAddress: string;
    token: string;
    amountUsd: number;
    /** Solana: treasury ATA mint address */
    mint?: string;
    /** Solana: reference hash */
    reference?: string;
}

/**
 * Builds a payment URI for QR encoding.
 *
 * Base: EIP-681 format — ethereum:<contract>@<chainId>/transfer?address=<deposit>&uint256=<amount>
 * Solana: Solana Pay format — solana:<treasury>?amount=<amount>&spl-token=<mint>&reference=<ref>
 */
function buildPaymentUri(props: QrDepositProps): string {
    const { chain, depositAddress, token, amountUsd } = props;

    if (chain === 'base') {
        const contract = getBaseTokenContract(token);
        const chainId = getBaseChainId();
        const amountWei = BigInt(Math.round(amountUsd * 100)) * 10_000n;
        return `ethereum:${contract}@${chainId}/transfer?address=${depositAddress}&uint256=${amountWei.toString()}`;
    }

    // Solana Pay URI
    const parts = [`solana:${depositAddress}?amount=${amountUsd}`];
    if (props.mint) parts.push(`spl-token=${props.mint}`);
    if (props.reference) parts.push(`reference=${props.reference}`);
    return parts.join('&');
}

/**
 * Renders a QR code canvas for a payment URI.
 * Uses a lightweight inline QR encoder (no external dependency).
 */
export function QrDeposit(props: QrDepositProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [error, setError] = useState<string | null>(null);
    const uri = buildPaymentUri(props);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Dynamic import to keep the initial bundle small
        void import('qrcode')
            .then((mod) => {
                // Handle both ESM default export and CJS module.exports
                const QRCode = ('default' in mod ? mod.default : mod) as typeof import('qrcode');
                void QRCode.toCanvas(canvas, uri, {
                    width: 220,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#ffffff'
                    },
                    errorCorrectionLevel: 'M'
                });
                setError(null);
            })
            .catch(() => {
                setError('QR generation failed. Use the address above.');
            });
    }, [uri]);

    return (
        <div className="grid gap-3">
            <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Scan with mobile wallet
            </p>
            <div className="flex items-center justify-center rounded-2xl border border-border/50 bg-white p-4">
                <canvas ref={canvasRef} className="max-w-[220px]" />
            </div>
            {error ? (
                <p className="text-xs text-muted-foreground">{error}</p>
            ) : (
                <p className="text-center text-[10px] text-muted-foreground/60 break-all font-mono">
                    {uri}
                </p>
            )}
        </div>
    );
}
