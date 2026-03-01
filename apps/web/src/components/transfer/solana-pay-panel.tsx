'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmSolanaWalletPayment } from '@/features/remittance/hooks';
import { getMintConfig } from '@/lib/solana/remittance-config';
import {
    submitPayTransaction,
    type SubmitPayTransactionResult
} from '@/lib/solana/remittance-acceptor';
import type { TransferSummary } from '@/lib/contracts';

const SOLANA_SIG_KEY_PREFIX = 'cryptopay:web:solana-last-signature:';
const SOLANA_AUTO_VERIFY_FAST_WINDOW_MS = 2 * 60_000;
const SOLANA_AUTO_VERIFY_MAX_MS = 10 * 60_000;

function solanaSignatureKey(transferId: string): string {
    return `${SOLANA_SIG_KEY_PREFIX}${transferId}`;
}

function readStoredSolanaSignature(transferId: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(solanaSignatureKey(transferId));
}

function writeStoredSolanaSignature(transferId: string, signature: string): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(solanaSignatureKey(transferId), signature);
}

function solanaAutoVerifyDelayMs(elapsedMs: number): number {
    if (elapsedMs < SOLANA_AUTO_VERIFY_FAST_WINDOW_MS) return 5_000;
    if (elapsedMs < 4 * 60_000) return 10_000;
    if (elapsedMs < 6 * 60_000) return 20_000;
    if (elapsedMs < 8 * 60_000) return 40_000;
    return 60_000;
}

type VerifyState = 'idle' | 'verifying' | 'confirmed' | 'duplicate' | 'pending' | 'failed';

export function verificationAlertVariant(state: VerifyState): 'default' | 'destructive' | 'success' | 'warning' | 'info' {
    if (state === 'failed') return 'destructive';
    if (state === 'confirmed' || state === 'duplicate') return 'success';
    if (state === 'pending') return 'warning';
    if (state === 'verifying') return 'info';
    return 'default';
}

export function verificationAlertTitle(state: VerifyState): string {
    if (state === 'verifying') return 'Confirming payment';
    if (state === 'confirmed') return 'Payment confirmed';
    if (state === 'duplicate') return 'Payment already confirmed';
    if (state === 'pending') return 'Confirmation pending';
    if (state === 'failed') return 'Verification failed';
    return 'Payment status';
}

export function SolanaPayPanel({ transfer }: { transfer: TransferSummary }) {
    const { quote } = transfer;
    const { connection } = useConnection();
    const wallet = useWallet();
    const [submitting, setSubmitting] = useState(false);
    const [solanaError, setSolanaError] = useState<string | null>(null);
    const [solanaResult, setSolanaResult] = useState<SubmitPayTransactionResult | null>(null);
    const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
    const [verifyResult, setVerifyResult] = useState<VerifyState>('idle');
    const [lastSignature, setLastSignature] = useState<string | null>(() => readStoredSolanaSignature(transfer.transferId));
    const autoVerifyTimerRef = useRef<number | null>(null);
    const autoVerifyStartedAtRef = useRef<number | null>(null);
    const autoVerifySignatureRef = useRef<string | null>(null);
    const confirmPaymentMutation = useConfirmSolanaWalletPayment();

    function clearAutoVerifyTimer(): void {
        if (autoVerifyTimerRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(autoVerifyTimerRef.current);
        }
        autoVerifyTimerRef.current = null;
    }

    function stopAutoVerify(): void {
        clearAutoVerifyTimer();
        autoVerifyStartedAtRef.current = null;
        autoVerifySignatureRef.current = null;
    }

    function scheduleAutoVerify(signature: string): void {
        if (typeof window === 'undefined') return;

        const now = Date.now();
        if (autoVerifySignatureRef.current !== signature || autoVerifyStartedAtRef.current === null) {
            autoVerifySignatureRef.current = signature;
            autoVerifyStartedAtRef.current = now;
        }

        const startedAt = autoVerifyStartedAtRef.current;
        const elapsedMs = startedAt ? now - startedAt : 0;
        if (elapsedMs >= SOLANA_AUTO_VERIFY_MAX_MS) {
            stopAutoVerify();
            setVerifyResult('pending');
            setVerifyMessage(
                'Your payment is still waiting for confirmation. Auto-check stopped after 10 minutes. Tap Retry to check again.'
            );
            return;
        }

        const delayMs = solanaAutoVerifyDelayMs(elapsedMs);
        clearAutoVerifyTimer();
        autoVerifyTimerRef.current = window.setTimeout(() => {
            const sig = autoVerifySignatureRef.current;
            if (!sig) return;
            void verifyBackendConfirmation(sig);
        }, delayMs);
    }

    useEffect(() => {
        stopAutoVerify();
        setSolanaError(null);
        setSolanaResult(null);
        setVerifyMessage(null);
        setVerifyResult('idle');
        setLastSignature(readStoredSolanaSignature(transfer.transferId));
    }, [transfer.transferId]);

    useEffect(() => {
        return () => {
            stopAutoVerify();
        };
    }, []);

    const mintConfigValidation = useMemo(() => {
        if (quote.chain !== 'solana') {
            return { valid: true, message: null as string | null };
        }

        try {
            getMintConfig(quote.token);
            return { valid: true, message: null as string | null };
        } catch (error) {
            const message =
                error instanceof Error
                    ? error.message
                    : 'Token config is invalid for this Solana payment.';
            return { valid: false, message };
        }
    }, [quote.chain, quote.token]);
    const canRetryVerification = Boolean(lastSignature) && verifyResult !== 'confirmed' && verifyResult !== 'duplicate';

    async function submitSolanaPayment(): Promise<void> {
        setSubmitting(true);
        setSolanaError(null);
        setVerifyMessage(null);
        setVerifyResult('idle');

        try {
            const result = await submitPayTransaction({
                connection,
                wallet,
                token: quote.token,
                amountDecimal: String(quote.sendAmountUsd),
                transferId: transfer.transferId,
                externalReference: transfer.transferId
            });
            setSolanaResult(result);
            writeStoredSolanaSignature(transfer.transferId, result.signature);
            setLastSignature(result.signature);
            await verifyBackendConfirmation(result.signature);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Solana payment failed.';
            setSolanaError(message);
        } finally {
            setSubmitting(false);
        }
    }

    async function verifyBackendConfirmation(signature: string): Promise<void> {
        setVerifyResult('verifying');
        setVerifyMessage('Verifying on backend...');

        try {
            const confirmation = await confirmPaymentMutation.mutateAsync({
                transferId: transfer.transferId,
                signature
            });

            if (confirmation.result === 'confirmed') {
                stopAutoVerify();
                setVerifyResult('confirmed');
                setVerifyMessage('Your payment was confirmed successfully.');
                return;
            }

            if (confirmation.result === 'duplicate') {
                stopAutoVerify();
                setVerifyResult('duplicate');
                setVerifyMessage('This payment was already linked to your transfer.');
                return;
            }

            setVerifyResult('pending');
            setVerifyMessage(
                'Your payment was submitted. We are waiting for network confirmation and will keep checking automatically.'
            );
            scheduleAutoVerify(signature);
        } catch (error) {
            stopAutoVerify();
            setVerifyResult('failed');
            setVerifyMessage(error instanceof Error ? error.message : 'Could not verify Solana payment.');
        }
    }

    return (
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="grid gap-1.5">
                <p className="text-sm font-semibold">Pay on Solana</p>
                <p className="text-xs text-muted-foreground">
                    Approve the payment in your wallet to fund this transfer.
                </p>
                <p className="text-xs text-muted-foreground">
                    We will confirm the payment automatically after it is broadcast.
                </p>
            </div>

            <div className="text-xs text-muted-foreground">
                Reference is fixed to <code className="font-mono">{transfer.transferId}</code> for this transfer.
            </div>

            {!wallet.connected ? <WalletConnectPanel chain="solana" /> : null}

            {!mintConfigValidation.valid && mintConfigValidation.message ? (
                <Alert variant="destructive">
                    <AlertTitle>Solana payment config error</AlertTitle>
                    <AlertDescription>{mintConfigValidation.message}</AlertDescription>
                </Alert>
            ) : null}

            {solanaError ? (
                <Alert variant="destructive">
                    <AlertTitle>Payment failed</AlertTitle>
                    <AlertDescription>{solanaError}</AlertDescription>
                </Alert>
            ) : null}

            {solanaResult ? (
                <Alert variant="info">
                    <AlertTitle>Transaction submitted</AlertTitle>
                    <AlertDescription>
                        <span className="block">Your wallet sent the transaction. Network confirmation may take a moment.</span>
                        <span className="mt-1 block break-all text-xs">Signature: {solanaResult.signature}</span>
                        <a href={solanaResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline">
                            View on Solana Explorer
                            <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </AlertDescription>
                </Alert>
            ) : null}

            {verifyMessage ? (
                <Alert variant={verificationAlertVariant(verifyResult)}>
                    <AlertTitle>{verificationAlertTitle(verifyResult)}</AlertTitle>
                    <AlertDescription>{verifyMessage}</AlertDescription>
                </Alert>
            ) : null}

            <Button
                onClick={submitSolanaPayment}
                disabled={
                    submitting ||
                    Boolean(solanaResult) ||
                    !wallet.connected ||
                    !wallet.publicKey ||
                    !mintConfigValidation.valid
                }
            >
                {submitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Submitting on-chain payment...
                    </>
                ) : (
                    'Pay with Solana wallet'
                )}
            </Button>

            {canRetryVerification ? (
                <Button
                    variant="outline"
                    onClick={() => {
                        if (lastSignature) {
                            stopAutoVerify();
                            void verifyBackendConfirmation(lastSignature);
                        }
                    }}
                    disabled={verifyResult === 'verifying'}
                >
                    {verifyResult === 'verifying' ? 'Verifying...' : 'Retry backend verification'}
                </Button>
            ) : null}
        </div>
    );
}
