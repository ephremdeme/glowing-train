'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import {
    verificationAlertVariant,
    verificationAlertTitle,
} from '@/components/transfer/solana-pay-panel';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmBaseWalletPayment } from '@/features/remittance/hooks';
import { submitBasePayment, type BasePaymentResult } from '@/lib/evm/base-payment';
import { walletMode } from '@/lib/wallet/evm';
import type { TransferSummary } from '@/lib/contracts';

const BASE_SIG_KEY_PREFIX = 'cryptopay:web:base-last-txhash:';
const AUTO_VERIFY_MAX_MS = 10 * 60_000;

function storedTxHashKey(transferId: string): string {
    return `${BASE_SIG_KEY_PREFIX}${transferId}`;
}

function readStoredTxHash(transferId: string): string | null {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(storedTxHashKey(transferId));
}

function writeStoredTxHash(transferId: string, hash: string): void {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(storedTxHashKey(transferId), hash);
}

function autoVerifyDelayMs(elapsedMs: number): number {
    if (elapsedMs < 2 * 60_000) return 5_000;
    if (elapsedMs < 4 * 60_000) return 10_000;
    if (elapsedMs < 6 * 60_000) return 20_000;
    return 40_000;
}

type VerifyState = 'idle' | 'verifying' | 'confirmed' | 'duplicate' | 'pending' | 'failed';

export function BasePayPanel({ transfer }: { transfer: TransferSummary }) {
    const { quote } = transfer;
    const [evmAddress, setEvmAddress] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [payResult, setPayResult] = useState<BasePaymentResult | null>(null);
    const [verifyMessage, setVerifyMessage] = useState<string | null>(null);
    const [verifyResult, setVerifyResult] = useState<VerifyState>('idle');
    const [lastTxHash, setLastTxHash] = useState<string | null>(() => readStoredTxHash(transfer.transferId));
    const autoVerifyTimerRef = useRef<number | null>(null);
    const autoVerifyStartedAtRef = useRef<number | null>(null);
    const confirmPaymentMutation = useConfirmBaseWalletPayment();
    const isMock = walletMode() === 'mock';

    function clearAutoVerifyTimer(): void {
        if (autoVerifyTimerRef.current !== null && typeof window !== 'undefined') {
            window.clearTimeout(autoVerifyTimerRef.current);
        }
        autoVerifyTimerRef.current = null;
    }

    function stopAutoVerify(): void {
        clearAutoVerifyTimer();
        autoVerifyStartedAtRef.current = null;
    }

    function scheduleAutoVerify(txHash: string): void {
        if (typeof window === 'undefined') return;

        const now = Date.now();
        if (autoVerifyStartedAtRef.current === null) {
            autoVerifyStartedAtRef.current = now;
        }

        const elapsedMs = now - autoVerifyStartedAtRef.current;
        if (elapsedMs >= AUTO_VERIFY_MAX_MS) {
            stopAutoVerify();
            setVerifyResult('pending');
            setVerifyMessage(
                'Auto-check stopped after 10 minutes. Your payment may still be processing. Tap Retry to check again.'
            );
            return;
        }

        clearAutoVerifyTimer();
        autoVerifyTimerRef.current = window.setTimeout(() => {
            void verifyBackendConfirmation(txHash);
        }, autoVerifyDelayMs(elapsedMs));
    }

    useEffect(() => {
        stopAutoVerify();
        setPayError(null);
        setPayResult(null);
        setVerifyMessage(null);
        setVerifyResult('idle');
        setLastTxHash(readStoredTxHash(transfer.transferId));
    }, [transfer.transferId]);

    useEffect(() => () => stopAutoVerify(), []);

    function handleWalletConnected(_chain: string, address: string) {
        setEvmAddress(address);
    }

    async function submitPayment(): Promise<void> {
        if (!window.ethereum) {
            setPayError('No Ethereum wallet detected. Please install MetaMask or Coinbase Wallet.');
            return;
        }

        setSubmitting(true);
        setPayError(null);
        setVerifyMessage(null);
        setVerifyResult('idle');

        try {
            const result = await submitBasePayment({
                provider: window.ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
                token: quote.token,
                depositAddress: transfer.depositAddress,
                amountUsd: quote.sendAmountUsd,
            });
            setPayResult(result);
            writeStoredTxHash(transfer.transferId, result.txHash);
            setLastTxHash(result.txHash);
            await verifyBackendConfirmation(result.txHash);
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Base payment failed.';
            setPayError(message);
        } finally {
            setSubmitting(false);
        }
    }

    async function verifyBackendConfirmation(txHash: string): Promise<void> {
        setVerifyResult('verifying');
        setVerifyMessage('Verifying on backend...');

        try {
            const confirmation = await confirmPaymentMutation.mutateAsync({
                transferId: transfer.transferId,
                txHash,
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
            scheduleAutoVerify(txHash);
        } catch (error) {
            stopAutoVerify();
            setVerifyResult('failed');
            setVerifyMessage(error instanceof Error ? error.message : 'Could not verify Base payment.');
        }
    }

    const canRetryVerification = Boolean(lastTxHash) && verifyResult !== 'confirmed' && verifyResult !== 'duplicate';

    return (
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="grid gap-1.5">
                <p className="text-sm font-semibold">Pay on Base</p>
                <p className="text-xs text-muted-foreground">
                    Connect your wallet and approve the {quote.token} transfer to fund this remittance.
                </p>
            </div>

            {!evmAddress && !isMock ? (
                <WalletConnectPanel chain="base" onConnected={handleWalletConnected} />
            ) : null}

            {evmAddress ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    Connected: <code className="font-mono text-foreground">{evmAddress}</code>
                </div>
            ) : null}

            {payError ? (
                <Alert variant="destructive">
                    <AlertTitle>Payment failed</AlertTitle>
                    <AlertDescription>{payError}</AlertDescription>
                </Alert>
            ) : null}

            {payResult ? (
                <Alert variant="info">
                    <AlertTitle>Transaction submitted</AlertTitle>
                    <AlertDescription>
                        <span className="block">Your wallet sent the transaction. Waiting for confirmations...</span>
                        <span className="mt-1 block break-all text-xs">Tx: {payResult.txHash}</span>
                        <a
                            href={payResult.explorerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-primary underline"
                        >
                            View on BaseScan
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
                onClick={submitPayment}
                disabled={submitting || Boolean(payResult) || (!evmAddress && !isMock)}
            >
                {submitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending {quote.token} on Base...
                    </>
                ) : (
                    `Pay ${quote.sendAmountUsd} ${quote.token} with wallet`
                )}
            </Button>

            {canRetryVerification ? (
                <Button
                    variant="outline"
                    onClick={() => {
                        if (lastTxHash) {
                            stopAutoVerify();
                            void verifyBackendConfirmation(lastTxHash);
                        }
                    }}
                    disabled={verifyResult === 'verifying'}
                >
                    {verifyResult === 'verifying' ? 'Verifying...' : 'Retry verification'}
                </Button>
            ) : null}
        </div>
    );
}
