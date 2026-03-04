'use client';

import { useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import {
    usePaymentVerification,
    verificationAlertVariant,
    verificationAlertTitle,
} from '@/hooks/use-payment-verification';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useConfirmBaseWalletPayment } from '@/features/remittance/hooks';
import { submitBasePayment, type BasePaymentResult } from '@/lib/evm/base-payment';
import { walletMode } from '@/lib/wallet/evm';
import type { TransferSummary } from '@/lib/contracts';

export function BasePayPanel({ transfer, onConfirmed }: { transfer: TransferSummary; onConfirmed?: () => void }) {
    const { quote } = transfer;
    const [evmAddress, setEvmAddress] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [payError, setPayError] = useState<string | null>(null);
    const [payResult, setPayResult] = useState<BasePaymentResult | null>(null);
    const [manualTxHash, setManualTxHash] = useState('');
    const confirmMutation = useConfirmBaseWalletPayment();
    const isMock = walletMode() === 'mock';

    const verification = usePaymentVerification({
        transferId: transfer.transferId,
        storageKeyPrefix: 'cryptopay:web:base-last-txhash:',
        confirmFn: (txHash, submissionSource) =>
            confirmMutation.mutateAsync({
                transferId: transfer.transferId,
                txHash,
                submissionSource
            }),
        onConfirmed,
    });

    async function submitPayment(): Promise<void> {
        if (!window.ethereum) {
            setPayError('No Ethereum wallet detected. Please install MetaMask or Coinbase Wallet.');
            return;
        }

        setSubmitting(true);
        setPayError(null);

        try {
            const result = await submitBasePayment({
                provider: window.ethereum as { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> },
                token: quote.token,
                depositAddress: transfer.depositAddress,
                amountUsd: quote.sendAmountUsd,
            });
            setPayResult(result);
            await verification.submitAndVerify(result.txHash, 'wallet_pay');
        } catch (error) {
            setPayError(error instanceof Error ? error.message : 'Base payment failed.');
        } finally {
            setSubmitting(false);
        }
    }

    async function submitManualTxHash(): Promise<void> {
        const txHash = manualTxHash.trim();
        if (!txHash) return;

        setPayError(null);
        try {
            await verification.submitAndVerify(txHash, 'manual_copy_address');
        } catch (error) {
            setPayError(error instanceof Error ? error.message : 'Could not verify the provided transaction hash.');
        }
    }

    return (
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="grid gap-1.5">
                <p className="text-sm font-semibold">Pay on Base</p>
                <p className="text-xs text-muted-foreground">
                    Connect your wallet and approve the {quote.token} transfer to fund this remittance.
                </p>
            </div>

            {!evmAddress && !isMock ? (
                <WalletConnectPanel chain="base" onConnected={(_chain, address) => setEvmAddress(address)} />
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
                        <a href={payResult.explorerUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary underline">
                            View on BaseScan <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                    </AlertDescription>
                </Alert>
            ) : null}

            {verification.verifyMessage ? (
                <Alert variant={verificationAlertVariant(verification.verifyState)}>
                    <AlertTitle>{verificationAlertTitle(verification.verifyState)}</AlertTitle>
                    <AlertDescription>{verification.verifyMessage}</AlertDescription>
                </Alert>
            ) : null}

            <Button onClick={submitPayment} disabled={submitting || Boolean(payResult) || (!evmAddress && !isMock)}>
                {submitting ? (
                    <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Sending {quote.token} on Base...
                    </>
                ) : (
                    `Pay ${quote.sendAmountUsd} ${quote.token} with wallet`
                )}
            </Button>

            <div className="grid gap-2 rounded-xl border border-border/60 bg-background/40 p-3">
                <p className="text-xs font-medium text-muted-foreground">Already paid from another wallet app?</p>
                <Input
                    value={manualTxHash}
                    onChange={(event) => setManualTxHash(event.target.value)}
                    placeholder="Paste Base transaction hash"
                />
                <Button
                    variant="outline"
                    onClick={submitManualTxHash}
                    disabled={!manualTxHash.trim() || verification.verifyState === 'verifying'}
                >
                    {verification.verifyState === 'verifying' ? 'Verifying...' : 'Verify existing transaction'}
                </Button>
            </div>

            {verification.canRetry ? (
                <Button variant="outline" onClick={verification.retryVerification} disabled={verification.verifyState === 'verifying'}>
                    {verification.verifyState === 'verifying' ? 'Verifying...' : 'Retry verification'}
                </Button>
            ) : null}
        </div>
    );
}
