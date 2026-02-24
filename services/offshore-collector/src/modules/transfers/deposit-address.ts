/**
 * Chain-aware funding route generation.
 *
 * Base uses a unique address route per transfer.
 * Solana uses the shared remittance-program treasury ATA plus a per-transfer
 * reference hash for wallet-pay verification.
 */

import type { SupportedChain, SupportedToken } from '@cryptopay/domain';
import { createHash } from 'node:crypto';

type DepositRouteKind = 'address_route' | 'solana_program_pay';

const DEVNET_SOLANA_TREASURY_ATAS: Record<SupportedToken, string> = {
    USDC: '89sfbTtBCGX3zCCooh4zGoxaATFEvZNWdkNjDGzCeqBu',
    USDT: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR'
};

export interface DepositAddressStrategy {
    /** Generate a funding route for the given chain/token/transfer. */
    generateAddress(params: {
        chain: SupportedChain;
        token: SupportedToken;
        transferId: string;
    }): DepositAddressResult;
}

export interface DepositAddressResult {
    depositAddress: string;
    depositMemo: string | null;
    routeKind: DepositRouteKind;
    referenceHash: string | null;
    /** Derivation metadata for audit/recovery. */
    derivationPath?: string;
}

/**
 * Funding route generator.
 *
 * Base routes remain deterministic pseudo-addresses for local/dev testing.
 * Solana routes are wallet-pay routes that point to the configured treasury ATA.
 */
export class HdWalletDepositStrategy implements DepositAddressStrategy {
    constructor(
        private readonly masterSeed: string = process.env.DEPOSIT_MASTER_SEED ?? 'dev-master-seed'
    ) { }

    generateAddress(params: { chain: SupportedChain; token: SupportedToken; transferId: string }): DepositAddressResult {
        const { chain, token, transferId } = params;

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
                routeKind: 'address_route',
                referenceHash: null,
                derivationPath
            };
        }

        if (chain === 'solana') {
            const referenceHash = createHash('sha256').update(transferId).digest('hex');
            return {
                depositAddress: this.readSolanaTreasuryAta(token),
                depositMemo: transferId,
                routeKind: 'solana_program_pay',
                referenceHash,
                derivationPath: `solana:program-pay:${token}`
            };
        }

        // Fallback for future chains
        return {
            depositAddress: `dep_${indexHash.slice(0, 32)}`,
            depositMemo: null
            ,
            routeKind: 'address_route',
            referenceHash: null
        };
    }

    private readSolanaTreasuryAta(token: SupportedToken): string {
        const envKey = token === 'USDC' ? 'SOLANA_USDC_TREASURY_ATA' : 'SOLANA_USDT_TREASURY_ATA';
        const nextPublicEnvKey =
            token === 'USDC' ? 'NEXT_PUBLIC_SOLANA_USDC_TREASURY_ATA' : 'NEXT_PUBLIC_SOLANA_USDT_TREASURY_ATA';

        const configured = process.env[envKey] ?? process.env[nextPublicEnvKey];
        if (configured && configured.trim()) {
            return configured.trim();
        }

        const cluster =
            (process.env.SOLANA_CLUSTER ?? process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet').trim().toLowerCase();
        if (cluster === 'devnet') {
            return DEVNET_SOLANA_TREASURY_ATAS[token];
        }

        throw new Error(`Missing required Solana treasury ATA config (${envKey}) for ${token}.`);
    }

    private derivationIndex(hash: string): number {
        // Take the first 4 bytes of the hash as a uint32 derivation index
        return parseInt(hash.slice(0, 8), 16) % 2_147_483_647; // max hardened index
    }
}
