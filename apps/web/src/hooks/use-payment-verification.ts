'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

/* ───── Types ───── */

export type VerifyState = 'idle' | 'verifying' | 'confirmed' | 'duplicate' | 'pending' | 'failed';
export type PaymentSubmissionSource = 'manual_copy_address' | 'wallet_pay';

export interface PaymentVerificationResult {
    result: 'confirmed' | 'duplicate' | 'pending_verification';
    code?: 'FUNDING_AMOUNT_ADJUSTED';
}

export interface UsePaymentVerificationOptions {
    transferId: string;
    storageKeyPrefix: string;
    confirmFn: (
        txIdentifier: string,
        submissionSource: PaymentSubmissionSource
    ) => Promise<PaymentVerificationResult>;
    autoVerifyMaxMs?: number | undefined;
    onConfirmed?: (() => void) | undefined;
}

export interface UsePaymentVerificationReturn {
    verifyState: VerifyState;
    verifyMessage: string | null;
    lastTxIdentifier: string | null;
    canRetry: boolean;
    submitAndVerify: (
        txIdentifier: string,
        submissionSource?: PaymentSubmissionSource
    ) => Promise<void>;
    retryVerification: () => void;
    stopAutoVerify: () => void;
}

/* ───── Auto-verify delay schedule ───── */

const DEFAULT_AUTO_VERIFY_MAX_MS = 10 * 60_000;
const FAST_WINDOW_MS = 2 * 60_000;

function autoVerifyDelayMs(elapsedMs: number): number {
    if (elapsedMs < FAST_WINDOW_MS) return 5_000;
    if (elapsedMs < 4 * 60_000) return 10_000;
    if (elapsedMs < 6 * 60_000) return 20_000;
    if (elapsedMs < 8 * 60_000) return 40_000;
    return 60_000;
}

/* ───── Session storage helpers ───── */

function readStored(key: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(key);
}

function writeStored(key: string, value: string): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, value);
}

/* ───── Hook ───── */

/**
 * Shared auto-verify logic for both Solana and Base payment panels.
 *
 * Handles:
 *  - Session storage of last tx identifier
 *  - Exponential backoff auto-verify polling
 *  - State management (idle → verifying → confirmed/pending/failed)
 *  - Toast + redirect on confirmation
 *  - Manual retry
 */
export function usePaymentVerification(options: UsePaymentVerificationOptions): UsePaymentVerificationReturn {
    const { transferId, storageKeyPrefix, confirmFn, onConfirmed } = options;
    const autoVerifyMaxMs = options.autoVerifyMaxMs ?? DEFAULT_AUTO_VERIFY_MAX_MS;
    const router = useRouter();

    const storageKey = `${storageKeyPrefix}${transferId}`;

    const [verifyState, setVerifyState] = useState<VerifyState>('idle');
    const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
    const [lastTxIdentifier, setLastTxIdentifier] = useState<string | null>(() => readStored(storageKey));

    const autoVerifyTimerRef = useRef<number | null>(null);
    const autoVerifyStartedAtRef = useRef<number | null>(null);
    const autoVerifyTxRef = useRef<string | null>(null);
    const autoVerifySourceRef = useRef<PaymentSubmissionSource>('manual_copy_address');

    /* ── Timer management ── */

    const clearTimer = useCallback(() => {
        if (autoVerifyTimerRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(autoVerifyTimerRef.current);
        }
        autoVerifyTimerRef.current = null;
    }, []);

    const stopAutoVerify = useCallback(() => {
        clearTimer();
        autoVerifyStartedAtRef.current = null;
        autoVerifyTxRef.current = null;
    }, [clearTimer]);

    /* ── Verification logic ── */

    const verifyBackend = useCallback(async (txIdentifier: string, submissionSource: PaymentSubmissionSource): Promise<void> => {
        setVerifyState('verifying');
        setVerifyMessage('Verifying on backend...');

        try {
            const confirmation = await confirmFn(txIdentifier, submissionSource);

            if (confirmation.result === 'confirmed') {
                stopAutoVerify();
                setVerifyState('confirmed');
                setVerifyMessage(
                    confirmation.code === 'FUNDING_AMOUNT_ADJUSTED'
                        ? 'Your payment was confirmed. The funded amount was adjusted to match the on-chain transfer.'
                        : 'Your payment was confirmed successfully.'
                );
                toast.success('Payment confirmed!', {
                    description: 'Transfer is now funded successfully.',
                });
                onConfirmed?.();
                setTimeout(() => {
                    router.push(`/transfers/${transferId}` as any);
                }, 1500);
                return;
            }

            if (confirmation.result === 'duplicate') {
                stopAutoVerify();
                setVerifyState('duplicate');
                setVerifyMessage('This payment was already linked to your transfer.');
                return;
            }

            // pending_verification
            setVerifyState('pending');
            setVerifyMessage(
                'Your payment was submitted. We are waiting for network confirmation and will keep checking automatically.'
            );
            scheduleAutoVerify(txIdentifier, submissionSource);
        } catch (error) {
            stopAutoVerify();
            setVerifyState('failed');
            setVerifyMessage(error instanceof Error ? error.message : 'Could not verify payment.');
        }
    }, [confirmFn, stopAutoVerify, onConfirmed, router, transferId]);

    const scheduleAutoVerify = useCallback((txIdentifier: string, submissionSource: PaymentSubmissionSource) => {
        if (typeof window === 'undefined') return;

        const now = Date.now();
        if (autoVerifyTxRef.current !== txIdentifier || autoVerifyStartedAtRef.current === null) {
            autoVerifyTxRef.current = txIdentifier;
            autoVerifyStartedAtRef.current = now;
        }
        autoVerifySourceRef.current = submissionSource;

        const elapsedMs = now - (autoVerifyStartedAtRef.current ?? now);
        if (elapsedMs >= autoVerifyMaxMs) {
            stopAutoVerify();
            setVerifyState('pending');
            setVerifyMessage(
                'Auto-check stopped after 10 minutes. Your payment may still be processing. Tap Retry to check again.'
            );
            return;
        }

        clearTimer();
        autoVerifyTimerRef.current = window.setTimeout(() => {
            const tx = autoVerifyTxRef.current;
            if (tx) void verifyBackend(tx, autoVerifySourceRef.current);
        }, autoVerifyDelayMs(elapsedMs));
    }, [autoVerifyMaxMs, clearTimer, stopAutoVerify, verifyBackend]);

    /* ── Reset on transferId change ── */

    useEffect(() => {
        stopAutoVerify();
        setVerifyState('idle');
        setVerifyMessage(null);
        setLastTxIdentifier(readStored(storageKey));
        autoVerifySourceRef.current = 'manual_copy_address';
    }, [transferId, storageKey, stopAutoVerify]);

    /* ── Cleanup on unmount ── */
    useEffect(() => () => stopAutoVerify(), [stopAutoVerify]);

    /* ── Public API ── */

    const submitAndVerify = useCallback(async (
        txIdentifier: string,
        submissionSource: PaymentSubmissionSource = 'manual_copy_address'
    ) => {
        writeStored(storageKey, txIdentifier);
        setLastTxIdentifier(txIdentifier);
        autoVerifySourceRef.current = submissionSource;
        await verifyBackend(txIdentifier, submissionSource);
    }, [storageKey, verifyBackend]);

    const retryVerification = useCallback(() => {
        if (lastTxIdentifier) {
            stopAutoVerify();
            void verifyBackend(lastTxIdentifier, autoVerifySourceRef.current);
        }
    }, [lastTxIdentifier, stopAutoVerify, verifyBackend]);

    const canRetry = Boolean(lastTxIdentifier) && verifyState !== 'confirmed' && verifyState !== 'duplicate';

    return {
        verifyState,
        verifyMessage,
        lastTxIdentifier,
        canRetry,
        submitAndVerify,
        retryVerification,
        stopAutoVerify,
    };
}

/* ───── Shared UI helpers ───── */

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
