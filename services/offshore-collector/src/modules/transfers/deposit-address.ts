/**
 * Deposit address generation strategy.
 *
 * Generates chain-aware deposit addresses for crypto transfers.
 * In production, these would use HD wallet derivation (EVM) or
 * unique program accounts (Solana). This module provides the
 * abstraction + a deterministic derivation-index-based strategy.
 */

import type { SupportedChain } from '@cryptopay/domain';
import { createHash, randomUUID } from 'node:crypto';

export interface DepositAddressStrategy {
    /** Generate a unique deposit address for the given chain and transfer. */
    generateAddress(params: {
        chain: SupportedChain;
        transferId: string;
    }): DepositAddressResult;
}

export interface DepositAddressResult {
    depositAddress: string;
    /** Optional memo/tag for chains that route by memo (e.g. Stellar, some Solana integrations). */
    depositMemo: string | null;
    /** Derivation metadata for audit/recovery. */
    derivationPath?: string;
}

/**
 * HD-wallet-style deposit address generator.
 *
 * Uses a master xpub seed + transfer-derived index to produce
 * deterministic addresses. In a real deployment, this would call
 * an HSM or key management service; here we produce a deterministic
 * hash-based address that's unique per transfer.
 */
export class HdWalletDepositStrategy implements DepositAddressStrategy {
    constructor(
        private readonly masterSeed: string = process.env.DEPOSIT_MASTER_SEED ?? 'dev-master-seed'
    ) { }

    generateAddress(params: { chain: SupportedChain; transferId: string }): DepositAddressResult {
        const { chain, transferId } = params;

        // Derive a deterministic index from the transferId
        const indexHash = createHash('sha256')
            .update(`${this.masterSeed}:${transferId}`)
            .digest('hex');

        if (chain === 'base') {
            // EVM: derive a 20-byte address (0x-prefixed)
            const addressBytes = indexHash.slice(0, 40);
            const derivationPath = `m/44'/60'/0'/0/${this.derivationIndex(indexHash)}`;
            return {
                depositAddress: `0x${addressBytes}`,
                depositMemo: null,
                derivationPath
            };
        }

        if (chain === 'solana') {
            // Solana: derive a 32-byte base58-like address (shortened hash)
            const nonce = randomUUID().slice(0, 8);
            const solAddress = createHash('sha256')
                .update(`${indexHash}:sol:${nonce}`)
                .digest('hex')
                .slice(0, 44);
            return {
                depositAddress: solAddress,
                depositMemo: transferId.slice(0, 16),
                derivationPath: `solana:account:${this.derivationIndex(indexHash)}`
            };
        }

        // Fallback for future chains
        return {
            depositAddress: `dep_${indexHash.slice(0, 32)}`,
            depositMemo: null
        };
    }

    private derivationIndex(hash: string): number {
        // Take the first 4 bytes of the hash as a uint32 derivation index
        return parseInt(hash.slice(0, 8), 16) % 2_147_483_647; // max hardened index
    }
}
