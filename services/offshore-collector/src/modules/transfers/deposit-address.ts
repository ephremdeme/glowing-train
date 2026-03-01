/**
 * Chain-aware funding route generation.
 *
 * Base uses CREATE2 deterministic deposit addresses via a DepositFactory contract.
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

interface Create2Config {
    factoryAddress: string;
    initCodeHashUsdc: string;
    initCodeHashUsdt: string;
    treasuryAddress: string;
}

/**
 * Compute a CREATE2 deposit address deterministically.
 *
 * address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
 *
 * This uses Node's crypto module with 'sha256' as a stand-in for keccak256.
 * For production, replace with a proper keccak256 implementation
 * (e.g. from ethers.js or @noble/hashes).
 */
function computeCreate2Address(factory: string, salt: string, initCodeHash: string): string {
    const factoryBytes = Buffer.from(factory.toLowerCase().replace('0x', ''), 'hex');
    const saltBytes = Buffer.from(salt.replace('0x', ''), 'hex');
    const initHashBytes = Buffer.from(initCodeHash.replace('0x', ''), 'hex');

    const payload = Buffer.concat([
        Buffer.from([0xff]),
        factoryBytes,
        saltBytes,
        initHashBytes
    ]);

    const hash = createHash('sha256').update(payload).digest();
    return '0x' + hash.subarray(12).toString('hex');
}

function readCreate2Config(): Create2Config {
    const factoryAddress = process.env.BASE_DEPOSIT_FACTORY_ADDRESS ?? '';
    const initCodeHashUsdc = process.env.BASE_USDC_PROXY_INIT_CODE_HASH ?? process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH ?? '';
    const initCodeHashUsdt = process.env.BASE_USDT_PROXY_INIT_CODE_HASH ?? process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH ?? '';
    const treasuryAddress = process.env.BASE_TREASURY_ADDRESS ?? '';

    if (!factoryAddress || !initCodeHashUsdc || !initCodeHashUsdt || !treasuryAddress) {
        throw new Error(
            'Missing CREATE2 config. Set BASE_DEPOSIT_FACTORY_ADDRESS, BASE_USDC_PROXY_INIT_CODE_HASH, BASE_USDT_PROXY_INIT_CODE_HASH/BASE_DEPOSIT_PROXY_INIT_CODE_HASH, and BASE_TREASURY_ADDRESS.'
        );
    }

    return { factoryAddress, initCodeHashUsdc, initCodeHashUsdt, treasuryAddress };
}

/**
 * Funding route generator using CREATE2 for Base and treasury ATAs for Solana.
 *
 * Base routes use deterministic CREATE2 addresses — no gas spent until sweep.
 * Solana routes are wallet-pay routes that point to the configured treasury ATA.
 */
export class Create2DepositStrategy implements DepositAddressStrategy {
    private readonly create2Config: Create2Config;

    constructor(create2Config?: Create2Config) {
        this.create2Config = create2Config ?? readCreate2Config();
    }

    generateAddress(params: { chain: SupportedChain; token: SupportedToken; transferId: string }): DepositAddressResult {
        const { chain, token, transferId } = params;

        if (chain === 'base') {
            const salt = '0x' + createHash('sha256').update(transferId).digest('hex');
            const initCodeHash = token === 'USDC' ? this.create2Config.initCodeHashUsdc : this.create2Config.initCodeHashUsdt;
            const depositAddress = computeCreate2Address(
                this.create2Config.factoryAddress,
                salt,
                initCodeHash
            );
            return {
                depositAddress,
                depositMemo: null,
                routeKind: 'address_route',
                referenceHash: null,
                derivationPath: `create2:${this.create2Config.factoryAddress}:${salt}`
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
        const fallbackHash = createHash('sha256').update(transferId).digest('hex');
        return {
            depositAddress: `dep_${fallbackHash.slice(0, 32)}`,
            depositMemo: null,
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
}
