/**
 * Base chain configuration for wallet payments.
 */

export const BASE_CHAIN_IDS = {
    mainnet: 8453,
    sepolia: 84532,
} as const;

export type BaseNetwork = keyof typeof BASE_CHAIN_IDS;

/** USDC and USDT contract addresses on Base. */
export const BASE_TOKEN_CONTRACTS: Record<string, Record<string, string>> = {
    mainnet: {
        USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        USDT: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2',
    },
    sepolia: {
        USDC: process.env.NEXT_PUBLIC_BASE_SEPOLIA_USDC_CONTRACT ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        USDT: process.env.NEXT_PUBLIC_BASE_SEPOLIA_USDT_CONTRACT ?? '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
    },
};

/** Read the configured Base network. */
export function getBaseNetwork(): BaseNetwork {
    const configured = (process.env.NEXT_PUBLIC_BASE_NETWORK ?? 'sepolia').toLowerCase();
    if (configured === 'mainnet') return 'mainnet';
    return 'sepolia';
}

/** Get the chain ID for the current Base network. */
export function getBaseChainId(): number {
    return BASE_CHAIN_IDS[getBaseNetwork()];
}

/** Get the token contract address for the current Base network. */
export function getBaseTokenContract(token: string): string {
    const network = getBaseNetwork();
    const address = BASE_TOKEN_CONTRACTS[network]?.[token.toUpperCase()];
    if (!address) {
        throw new Error(`No ${token} contract configured for Base ${network}`);
    }
    return address;
}

/** Get the Base explorer URL for a transaction hash. */
export function getBaseExplorerTxUrl(txHash: string): string {
    const network = getBaseNetwork();
    const base = network === 'mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org';
    return `${base}/tx/${txHash}`;
}

/**
 * Switch the connected wallet to the Base network.
 * @param provider The injected EIP-1193 provider (window.ethereum)
 */
export async function ensureBaseNetwork(provider: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> }): Promise<void> {
    const targetChainId = getBaseChainId();
    const targetHex = `0x${targetChainId.toString(16)}`;

    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: targetHex }],
        });
    } catch (error: unknown) {
        const switchError = error as { code?: number };
        // 4902 = chain not added to wallet
        if (switchError.code === 4902) {
            const network = getBaseNetwork();
            await provider.request({
                method: 'wallet_addEthereumChain',
                params: [{
                    chainId: targetHex,
                    chainName: network === 'mainnet' ? 'Base' : 'Base Sepolia',
                    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                    rpcUrls: [network === 'mainnet' ? 'https://mainnet.base.org' : 'https://sepolia.base.org'],
                    blockExplorerUrls: [network === 'mainnet' ? 'https://basescan.org' : 'https://sepolia.basescan.org'],
                }],
            });
        } else {
            throw error;
        }
    }
}
