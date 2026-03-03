/**
 * Base chain wallet payment verifier.
 *
 * Verifies ERC-20 transfer transactions on-chain by checking the tx receipt
 * for Transfer(from, to, value) events matching the expected deposit address.
 *
 * Mirrors the SolanaPaymentVerificationService pattern.
 */

import { keccak_256 } from '@noble/hashes/sha3.js';
import { log } from '@cryptopay/observability';
import type { TransferRepositoryPort } from '../transfers/types.js';
import {
    BasePaymentVerificationError,
    type VerifiedBasePayment,
    type VerifyBasePaymentInput
} from './types.js';

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

interface BaseVerificationConfig {
    rpcUrl: string;
    tokenContracts: Record<string, string>; // token → contract address
    factoryAddress: string;
    initCodeHashUsdc: string;
    initCodeHashUsdt: string;
    treasuryAddress: string;
}

interface ReceiptLog {
    address: string;
    topics: string[];
    data: string;
    transactionHash: string;
    logIndex: string;
    blockNumber: string;
}

interface TxReceipt {
    status: string;
    transactionHash: string;
    from: string;
    to: string;
    logs: ReceiptLog[];
    blockNumber: string;
}

interface RpcBlock {
    number: string;
    timestamp: string;
}

function envOrDefault(name: string, fallback: string): string {
    const value = process.env[name];
    if (value && value.trim()) return value.trim();
    return fallback;
}

function readVerificationConfig(): BaseVerificationConfig {
    const rpcUrl = process.env.BASE_RPC_URL;
    if (!rpcUrl) {
        throw new BasePaymentVerificationError('Base RPC is not configured.', {
            code: 'BASE_RPC_URL_MISSING',
            status: 503
        });
    }

    const network = envOrDefault('BASE_NETWORK', 'sepolia');
    const isMainnet = network === 'mainnet';

    const usdcContract = envOrDefault(
        'BASE_USDC_CONTRACT',
        isMainnet ? '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    );
    const usdtContract = envOrDefault(
        'BASE_USDT_CONTRACT',
        isMainnet ? '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2' : '0x036CbD53842c5426634e7929541eC2318f3dCF7e'
    );

    const factoryAddress = process.env.BASE_DEPOSIT_FACTORY_ADDRESS ?? '';
    const initCodeHashUsdc = process.env.BASE_USDC_PROXY_INIT_CODE_HASH ?? process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH ?? '';
    const initCodeHashUsdt = process.env.BASE_USDT_PROXY_INIT_CODE_HASH ?? process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH ?? '';
    const treasuryAddress = process.env.BASE_TREASURY_ADDRESS ?? '';

    if (!factoryAddress || !initCodeHashUsdc || !initCodeHashUsdt || !treasuryAddress) {
        throw new BasePaymentVerificationError('Base deposit factory config is incomplete.', {
            code: 'BASE_FACTORY_CONFIG_MISSING',
            status: 503
        });
    }

    return {
        rpcUrl,
        tokenContracts: { USDC: usdcContract, USDT: usdtContract },
        factoryAddress,
        initCodeHashUsdc,
        initCodeHashUsdt,
        treasuryAddress
    };
}

/**
 * Compute CREATE2 deposit address deterministically.
 *
 * address = keccak256(0xff ++ factory ++ salt ++ keccak256(initCode))[12:]
 *
 * Uses @noble/hashes keccak256 to match the Solidity contract exactly.
 */
function computeCreate2Address(factoryAddress: string, salt: string, initCodeHash: string): string {
    const factoryBytes = Buffer.from(factoryAddress.toLowerCase().replace('0x', ''), 'hex');
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

function isRetryableRpcError(error: unknown): boolean {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    return (
        message.includes('429') ||
        message.includes('timeout') ||
        message.includes('timed out') ||
        message.includes('fetch failed') ||
        message.includes('rate limit')
    );
}

function parseHexAmount(hexData: string): bigint {
    const trimmed = hexData.replace('0x', '');
    if (!trimmed) return 0n;
    return BigInt('0x' + trimmed);
}

function addressFromTopic(topic: string): string {
    return '0x' + topic.slice(26).toLowerCase();
}

export class BasePaymentVerificationService {
    constructor(
        private readonly repository: TransferRepositoryPort,
        private readonly configReader: () => BaseVerificationConfig = readVerificationConfig
    ) { }

    async verify(input: VerifyBasePaymentInput): Promise<VerifiedBasePayment> {
        log('info', 'base-verifier: starting verification', { transferId: input.transferId, txHash: input.txHash });

        const transferWithRoute = await this.repository.findTransferWithRouteById(input.transferId);
        if (!transferWithRoute) {
            log('warn', 'base-verifier: transfer not found', { transferId: input.transferId });
            throw new BasePaymentVerificationError('Transfer not found.', {
                code: 'TRANSFER_NOT_FOUND',
                status: 404
            });
        }

        const { transfer, depositRoute } = transferWithRoute;
        if (transfer.chain !== 'base') {
            log('warn', 'base-verifier: wrong chain', { transferId: input.transferId, chain: transfer.chain });
            throw new BasePaymentVerificationError('Transfer is not a Base transfer.', {
                code: 'INVALID_TRANSFER_CHAIN',
                status: 400
            });
        }

        const config = this.configReader();

        // Verify the deposit address matches the CREATE2 address for this transfer.
        // salt = '0x' + keccak256(transferId).hex()
        const salt = '0x' + Buffer.from(keccak_256(Buffer.from(transfer.transferId))).toString('hex');
        const initCodeHash = transfer.token === 'USDC' ? config.initCodeHashUsdc : config.initCodeHashUsdt;
        const expectedDepositAddress = computeCreate2Address(
            config.factoryAddress,
            salt,
            initCodeHash
        );

        if (depositRoute.depositAddress.toLowerCase() !== expectedDepositAddress.toLowerCase()) {
            log('error', 'base-verifier: address mismatch', {
                transferId: input.transferId,
                expected: expectedDepositAddress,
                actual: depositRoute.depositAddress,
            });
            throw new BasePaymentVerificationError('Deposit address does not match expected CREATE2 address.', {
                code: 'DEPOSIT_ADDRESS_MISMATCH',
                status: 400
            });
        }

        log('info', 'base-verifier: address matched, fetching receipt', { transferId: input.transferId, depositAddress: expectedDepositAddress });

        // Fetch the transaction receipt
        let receipt: TxReceipt;
        try {
            receipt = await this.getTransactionReceipt(config.rpcUrl, input.txHash);
        } catch (error) {
            log('error', 'base-verifier: RPC failure', { transferId: input.transferId, error: (error as Error).message });
            throw new BasePaymentVerificationError('Failed to read Base transaction from RPC.', {
                code: 'BASE_RPC_READ_FAILED',
                status: 502,
                retryable: isRetryableRpcError(error)
            });
        }

        // Check transaction success
        if (receipt.status !== '0x1') {
            log('warn', 'base-verifier: tx failed on-chain', { transferId: input.transferId, txHash: input.txHash });
            throw new BasePaymentVerificationError('Base transaction failed on-chain.', {
                code: 'TX_FAILED',
                status: 400
            });
        }

        let confirmedAt: string;
        try {
            confirmedAt = await this.getBlockConfirmedAt(config.rpcUrl, receipt.blockNumber);
        } catch (error) {
            if (error instanceof BasePaymentVerificationError) {
                throw error;
            }
            throw new BasePaymentVerificationError('Failed to read Base block timestamp from RPC.', {
                code: 'BASE_RPC_READ_FAILED',
                status: 502,
                retryable: isRetryableRpcError(error)
            });
        }

        // Find the ERC-20 Transfer event to the deposit address
        const expectedTokenContract = config.tokenContracts[transfer.token];
        if (!expectedTokenContract) {
            throw new BasePaymentVerificationError(`No token contract configured for ${transfer.token}.`, {
                code: 'TOKEN_CONTRACT_MISSING',
                status: 503
            });
        }

        const transferLog = receipt.logs.find((log) => {
            if (log.address.toLowerCase() !== expectedTokenContract.toLowerCase()) return false;
            if (log.topics.length < 3) return false;
            if (log.topics[0] !== ERC20_TRANSFER_TOPIC) return false;
            const to = addressFromTopic(log.topics[2]!);
            return to === depositRoute.depositAddress.toLowerCase();
        });

        if (!transferLog) {
            throw new BasePaymentVerificationError('Transaction does not contain an ERC-20 transfer to the deposit address.', {
                code: 'TRANSFER_LOG_NOT_FOUND',
                status: 400
            });
        }

        // Parse amount
        const amountBaseUnits = parseHexAmount(transferLog.data);
        const expectedAmountBaseUnits = BigInt(Math.round(transfer.sendAmountUsd * 100)) * 10_000n;

        if (amountBaseUnits !== expectedAmountBaseUnits) {
            throw new BasePaymentVerificationError('Payment amount does not match the transfer funding amount.', {
                code: 'AMOUNT_MISMATCH',
                status: 400
            });
        }

        const payerAddress = addressFromTopic(transferLog.topics[1]!);

        return {
            verified: true,
            transferId: transfer.transferId,
            chain: 'base',
            token: transfer.token,
            txHash: input.txHash,
            amountUsd: transfer.sendAmountUsd,
            depositAddress: depositRoute.depositAddress,
            confirmedAt,
            payerAddress
        };
    }

    private async getTransactionReceipt(rpcUrl: string, txHash: string): Promise<TxReceipt> {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getTransactionReceipt',
                params: [txHash]
            })
        });

        if (!response.ok) {
            throw new Error(`RPC status ${response.status}`);
        }

        const data = (await response.json()) as {
            result: TxReceipt | null;
            error?: { message: string };
        };

        if (data.error) {
            throw new Error(`RPC error: ${data.error.message}`);
        }

        if (!data.result) {
            throw new BasePaymentVerificationError('Transaction receipt not available yet. Retry shortly.', {
                code: 'TX_NOT_FOUND',
                status: 409,
                retryable: true
            });
        }

        return data.result;
    }

    private async getBlockConfirmedAt(rpcUrl: string, blockNumber: string): Promise<string> {
        const response = await fetch(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_getBlockByNumber',
                params: [blockNumber, false]
            })
        });

        if (!response.ok) {
            throw new Error(`RPC status ${response.status}`);
        }

        const data = (await response.json()) as {
            result: RpcBlock | null;
            error?: { message: string };
        };

        if (data.error) {
            throw new Error(`RPC error: ${data.error.message}`);
        }

        if (!data.result?.timestamp) {
            throw new BasePaymentVerificationError('Block timestamp not available yet. Retry shortly.', {
                code: 'TX_NOT_FOUND',
                status: 409,
                retryable: true
            });
        }

        const timestampSeconds = Number.parseInt(data.result.timestamp.replace(/^0x/i, ''), 16);
        if (!Number.isFinite(timestampSeconds) || timestampSeconds <= 0) {
            throw new Error(`invalid block timestamp: ${data.result.timestamp}`);
        }

        return new Date(timestampSeconds * 1000).toISOString();
    }
}
