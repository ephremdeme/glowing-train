/**
 * Base chain ERC-20 payment submission.
 * Sends a USDC/USDT transfer() call via the connected EVM wallet.
 */

import { ensureBaseNetwork, getBaseExplorerTxUrl, getBaseTokenContract } from './base-config';

const ERC20_TRANSFER_SELECTOR = '0xa9059cbb'; // transfer(address,uint256)

export interface BasePaymentParams {
    /** Injected EIP-1193 provider (window.ethereum or similar) */
    provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
    /** USDC or USDT */
    token: string;
    /** The deposit address to send tokens to */
    depositAddress: string;
    /** Amount in USD (e.g. 100.50) */
    amountUsd: number;
}

export interface BasePaymentResult {
    txHash: string;
    explorerUrl: string;
}

/**
 * Convert a decimal USD amount to base units (6 decimals for USDC/USDT).
 */
function usdToBaseUnits(amountUsd: number): bigint {
    const cents = Math.round(amountUsd * 100);
    return BigInt(cents) * 10_000n;
}

/**
 * Encode an ERC-20 transfer(address, uint256) call.
 */
function encodeTransfer(to: string, amount: bigint): string {
    const addressPadded = to.toLowerCase().replace('0x', '').padStart(64, '0');
    const amountHex = amount.toString(16).padStart(64, '0');
    return `${ERC20_TRANSFER_SELECTOR}${addressPadded}${amountHex}`;
}

/**
 * Submit a Base chain ERC-20 transfer via the user's connected wallet.
 *
 * 1. Ensures the wallet is on the correct Base network
 * 2. Encodes the ERC-20 transfer(address, uint256) call
 * 3. Sends the transaction via eth_sendTransaction
 * 4. Returns the tx hash and explorer URL
 */
export async function submitBasePayment(params: BasePaymentParams): Promise<BasePaymentResult> {
    const { provider, token, depositAddress, amountUsd } = params;

    // Ensure correct network
    await ensureBaseNetwork(provider);

    // Get sender address
    const accounts = await provider.request({ method: 'eth_requestAccounts' }) as string[];
    const sender = accounts[0];
    if (!sender) {
        throw new Error('No wallet account available. Please connect your wallet.');
    }

    // Get token contract
    const tokenContract = getBaseTokenContract(token);

    // Encode transfer data
    const amountBaseUnits = usdToBaseUnits(amountUsd);
    const data = encodeTransfer(depositAddress, amountBaseUnits);

    // Send transaction
    const txHash = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
            from: sender,
            to: tokenContract,
            data,
            // Gas will be estimated by the wallet
        }],
    }) as string;

    return {
        txHash,
        explorerUrl: getBaseExplorerTxUrl(txHash),
    };
}
