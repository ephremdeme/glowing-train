/**
 * Chain-aware funding route generation.
 *
 * Base uses CREATE2 deterministic deposit addresses via a DepositFactory contract.
 * Solana supports two modes:
 *  - legacy shared remittance-program treasury ATA + reference hash
 *  - unique per-transfer SPL token account addresses (copy-address deterministic flow)
 */

import type { SupportedChain, SupportedToken } from '@cryptopay/domain';
import { createHash } from 'node:crypto';
import { keccak_256 } from '@noble/hashes/sha3.js';
import bs58 from 'bs58';
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';

type DepositRouteKind = 'address_route' | 'solana_program_pay';

const DEVNET_SOLANA_TREASURY_ATAS: Record<SupportedToken, string> = {
    USDC: '89sfbTtBCGX3zCCooh4zGoxaATFEvZNWdkNjDGzCeqBu',
    USDT: 'FFn5nBjuZLj4WBxyzUvXTs185LxpAXt4wLSRqs6KabqR'
};

const DEVNET_SOLANA_MINTS: Record<SupportedToken, string> = {
    USDC: '6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km',
    USDT: '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn'
};

const SOLANA_TOKEN_PROGRAM_ID = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
const TOKEN_ACCOUNT_SPACE = 165;

export class SolanaRouteProvisioningError extends Error {
    public readonly code = 'SOLANA_ROUTE_PROVISIONING_FAILED';

    constructor(message: string) {
        super(message);
        this.name = 'SolanaRouteProvisioningError';
    }
}

export interface DepositAddressStrategy {
    /** Generate a funding route for the given chain/token/transfer. */
    generateAddress(params: {
        chain: SupportedChain;
        token: SupportedToken;
        transferId: string;
    }): Promise<DepositAddressResult>;
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

interface SolanaUniqueRouteConfig {
    enabled: boolean;
    rpcUrl: string;
    ownerPrivateKey: Uint8Array;
    mintByToken: Record<SupportedToken, string>;
}

/**
 * Compute a CREATE2 deposit address deterministically.
 *
 * address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
 *
 * Uses @noble/hashes keccak256 to match the Solidity contract exactly.
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

    const hash = Buffer.from(keccak_256(payload));
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

function parseBooleanEnv(name: string, fallback: boolean): boolean {
    const raw = (process.env[name] ?? '').trim().toLowerCase();
    if (!raw) {
        return fallback;
    }
    if (['1', 'true', 'yes', 'on'].includes(raw)) {
        return true;
    }
    if (['0', 'false', 'no', 'off'].includes(raw)) {
        return false;
    }
    return fallback;
}

function parsePrivateKey(raw: string): Uint8Array {
    const trimmed = raw.trim();
    if (!trimmed) {
        throw new SolanaRouteProvisioningError('SOLANA_TREASURY_OWNER_PRIVATE_KEY is required.');
    }

    if (trimmed.startsWith('[')) {
        try {
            const parsed = JSON.parse(trimmed);
            if (!Array.isArray(parsed) || parsed.length === 0) {
                throw new Error('empty');
            }
            return Uint8Array.from(parsed as number[]);
        } catch {
            throw new SolanaRouteProvisioningError('SOLANA_TREASURY_OWNER_PRIVATE_KEY JSON format is invalid.');
        }
    }

    try {
        return bs58.decode(trimmed);
    } catch {
        throw new SolanaRouteProvisioningError('SOLANA_TREASURY_OWNER_PRIVATE_KEY must be base58 or JSON array.');
    }
}

function readSolanaUniqueRouteConfig(): SolanaUniqueRouteConfig {
    const enabled = parseBooleanEnv('SOLANA_UNIQUE_ADDRESS_ROUTES_ENABLED', false);
    const cluster = (process.env.SOLANA_CLUSTER ?? process.env.NEXT_PUBLIC_SOLANA_CLUSTER ?? 'devnet').trim().toLowerCase();
    const useDevnetDefaults = cluster === 'devnet';
    const mintByToken: Record<SupportedToken, string> = {
        USDC: process.env.SOLANA_USDC_MINT ?? process.env.NEXT_PUBLIC_SOLANA_USDC_MINT ?? (useDevnetDefaults ? DEVNET_SOLANA_MINTS.USDC : ''),
        USDT: process.env.SOLANA_USDT_MINT ?? process.env.NEXT_PUBLIC_SOLANA_USDT_MINT ?? (useDevnetDefaults ? DEVNET_SOLANA_MINTS.USDT : '')
    };

    if (!enabled) {
        return {
            enabled: false,
            rpcUrl: process.env.SOLANA_RPC_URL ?? '',
            ownerPrivateKey: new Uint8Array(),
            mintByToken
        };
    }

    const rpcUrl = (process.env.SOLANA_RPC_URL ?? '').trim();
    if (!rpcUrl) {
        throw new SolanaRouteProvisioningError('SOLANA_RPC_URL is required when SOLANA_UNIQUE_ADDRESS_ROUTES_ENABLED=true.');
    }
    if (!mintByToken.USDC || !mintByToken.USDT) {
        throw new SolanaRouteProvisioningError('SOLANA mint configuration is incomplete for unique address routing.');
    }

    return {
        enabled: true,
        rpcUrl,
        ownerPrivateKey: parsePrivateKey(process.env.SOLANA_TREASURY_OWNER_PRIVATE_KEY ?? ''),
        mintByToken
    };
}

function buildSolanaSeed(transferId: string, token: SupportedToken): string {
    // createAccountWithSeed seed max length is 32 chars.
    return createHash('sha256').update(`route:${token}:${transferId}`).digest('hex').slice(0, 32);
}

function buildInitializeAccount3Instruction(params: {
    account: PublicKey;
    mint: PublicKey;
    owner: PublicKey;
}): TransactionInstruction {
    return new TransactionInstruction({
        programId: SOLANA_TOKEN_PROGRAM_ID,
        keys: [
            { pubkey: params.account, isSigner: false, isWritable: true },
            { pubkey: params.mint, isSigner: false, isWritable: false }
        ],
        // InitializeAccount3 instruction discriminator + owner pubkey
        data: Buffer.concat([Buffer.from([18]), params.owner.toBuffer()])
    });
}

/**
 * Funding route generator using CREATE2 for Base and treasury ATAs for Solana.
 *
 * Base routes use deterministic CREATE2 addresses — no gas spent until sweep.
 * Solana routes are wallet-pay routes that point to the configured treasury ATA.
 */
export class Create2DepositStrategy implements DepositAddressStrategy {
    private create2Config: Create2Config | null;
    private readonly solanaUniqueRouteConfig: SolanaUniqueRouteConfig;

    constructor(create2Config?: Create2Config) {
        this.create2Config = create2Config ?? null;
        this.solanaUniqueRouteConfig = readSolanaUniqueRouteConfig();
    }

    async generateAddress(params: { chain: SupportedChain; token: SupportedToken; transferId: string }): Promise<DepositAddressResult> {
        const { chain, token, transferId } = params;

        if (chain === 'base') {
            const create2Config = this.getCreate2Config();
            const salt = '0x' + Buffer.from(keccak_256(Buffer.from(transferId))).toString('hex');
            const initCodeHash = token === 'USDC' ? create2Config.initCodeHashUsdc : create2Config.initCodeHashUsdt;
            const depositAddress = computeCreate2Address(
                create2Config.factoryAddress,
                salt,
                initCodeHash
            );
            return {
                depositAddress,
                depositMemo: null,
                routeKind: 'address_route',
                referenceHash: null,
                derivationPath: `create2:${create2Config.factoryAddress}:${salt}`
            };
        }

        if (chain === 'solana') {
            if (this.solanaUniqueRouteConfig.enabled) {
                const uniqueAddress = await this.provisionUniqueSolanaAddress(token, transferId);
                return {
                    depositAddress: uniqueAddress,
                    depositMemo: transferId,
                    routeKind: 'address_route',
                    referenceHash: null,
                    derivationPath: `solana:unique-token-account:${token}`
                };
            }

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
        const fallbackHash = Buffer.from(keccak_256(Buffer.from(transferId))).toString('hex');
        return {
            depositAddress: `dep_${fallbackHash.slice(0, 32)}`,
            depositMemo: null,
            routeKind: 'address_route',
            referenceHash: null
        };
    }

    private getCreate2Config(): Create2Config {
        if (!this.create2Config) {
            this.create2Config = readCreate2Config();
        }
        return this.create2Config;
    }

    private async provisionUniqueSolanaAddress(token: SupportedToken, transferId: string): Promise<string> {
        try {
            const connection = new Connection(this.solanaUniqueRouteConfig.rpcUrl, 'confirmed');
            const ownerKeypair = this.keypairFromSecret(this.solanaUniqueRouteConfig.ownerPrivateKey);
            const mint = new PublicKey(this.solanaUniqueRouteConfig.mintByToken[token]);
            const seed = buildSolanaSeed(transferId, token);
            const derivedAddress = await PublicKey.createWithSeed(ownerKeypair.publicKey, seed, SOLANA_TOKEN_PROGRAM_ID);
            const rentLamports = await connection.getMinimumBalanceForRentExemption(TOKEN_ACCOUNT_SPACE);

            const tx = new Transaction();
            tx.add(
                SystemProgram.createAccountWithSeed({
                    fromPubkey: ownerKeypair.publicKey,
                    basePubkey: ownerKeypair.publicKey,
                    seed,
                    newAccountPubkey: derivedAddress,
                    lamports: rentLamports,
                    space: TOKEN_ACCOUNT_SPACE,
                    programId: SOLANA_TOKEN_PROGRAM_ID
                })
            );
            tx.add(
                buildInitializeAccount3Instruction({
                    account: derivedAddress,
                    mint,
                    owner: ownerKeypair.publicKey
                })
            );

            try {
                await sendAndConfirmTransaction(connection, tx, [ownerKeypair], {
                    commitment: 'confirmed',
                    preflightCommitment: 'confirmed'
                });
            } catch (error) {
                const message = (error as Error).message?.toLowerCase() ?? '';
                if (!message.includes('already in use')) {
                    throw error;
                }
            }

            return derivedAddress.toBase58();
        } catch (error) {
            if (error instanceof SolanaRouteProvisioningError) throw error;
            const message = error instanceof Error ? error.message : 'Unknown provisioning error';
            throw new SolanaRouteProvisioningError(
                `Could not provision Solana unique deposit address: ${message}`
            );
        }
    }

    private keypairFromSecret(secret: Uint8Array): Keypair {
        return Keypair.fromSecretKey(secret);
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
