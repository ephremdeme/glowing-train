'use client';

import { useMemo, useState } from 'react';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import { WalletConnectPanel } from '@/components/wallet/wallet-connect-panel';
import {
    usePaymentVerification,
    verificationAlertVariant,
    verificationAlertTitle,
} from '@/hooks/use-payment-verification';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useConfirmSolanaWalletPayment } from '@/features/remittance/hooks';
import { getMintConfig } from '@/lib/solana/remittance-config';
import {
    submitPayTransaction,
    type SubmitPayTransactionResult
} from '@/lib/solana/remittance-acceptor';
import type { TransferSummary } from '@/lib/contracts';

export function SolanaPayPanel({ transfer, onConfirmed }: { transfer: TransferSummary; onConfirmed?: () => void }) {
    const { quote } = transfer;
    const { connection } = useConnection();
    const wallet = useWallet();
    const [submitting, setSubmitting] = useState(false);
    const [solanaError, setSolanaError] = useState<string | null>(null);
    const [solanaResult, setSolanaResult] = useState<SubmitPayTransactionResult | null>(null);
    const confirmMutation = useConfirmSolanaWalletPayment();

    const verification = usePaymentVerification({
        transferId: transfer.transferId,
        storageKeyPrefix: 'cryptopay:web:solana-last-signature:',
        confirmFn: (signature) => confirmMutation.mutateAsync({ transferId: transfer.transferId, signature }),
        onConfirmed,
    });

    const mintConfigValidation = useMemo(() => {
        if (quote.chain !== 'solana') return { valid: true, message: null as string | null };
        try {
            getMintConfig(quote.token);
            return { valid: true, message: null as string | null };
        } catch (error) {
            return { valid: false, message: error instanceof Error ? error.message : 'Token config is invalid.' };
        }
    }, [quote.chain, quote.token]);

    async function submitSolanaPayment(): Promise<void> {
        setSubmitting(true);
        setSolanaError(null);

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
            await verification.submitAndVerify(result.signature);
        } catch (error) {
            setSolanaError(error instanceof Error ? error.message : 'Solana payment failed.');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="grid gap-4 rounded-2xl border border-border/70 bg-muted/20 p-4">
            <div className="grid gap-1.5">
                <p className="text-sm font-semibold">Pay on Solana</p>
                <p className="text-xs text-muted-foreground">
                    Approve the payment in your wallet to fund this transfer.
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
                            View on Solana Explorer <ExternalLink className="h-3.5 w-3.5" />
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

            <Button
                onClick={submitSolanaPayment}
                disabled={submitting || Boolean(solanaResult) || !wallet.connected || !wallet.publicKey || !mintConfigValidation.valid}
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

            {verification.canRetry ? (
                <Button variant="outline" onClick={verification.retryVerification} disabled={verification.verifyState === 'verifying'}>
                    {verification.verifyState === 'verifying' ? 'Verifying...' : 'Retry backend verification'}
                </Button>
            ) : null}
        </div>
    );
}
