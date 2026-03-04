import { afterEach, describe, expect, it, vi } from 'vitest';
import { Create2DepositStrategy } from '../src/modules/transfers/deposit-address.js';

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  process.env = { ...ORIGINAL_ENV };
}

describe('Create2DepositStrategy', () => {
  afterEach(() => {
    resetEnv();
    vi.restoreAllMocks();
  });

  it('does not require Base CREATE2 env for Solana route generation', async () => {
    delete process.env.BASE_DEPOSIT_FACTORY_ADDRESS;
    delete process.env.BASE_USDC_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_USDT_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_TREASURY_ADDRESS;

    process.env.SOLANA_UNIQUE_ADDRESS_ROUTES_ENABLED = 'false';
    process.env.SOLANA_CLUSTER = 'devnet';

    const strategy = new Create2DepositStrategy();
    const route = await strategy.generateAddress({
      chain: 'solana',
      token: 'USDC',
      transferId: 'tr_lazy_solana_1'
    });

    expect(route.routeKind).toBe('solana_program_pay');
    expect(route.depositAddress).toBeTruthy();
    expect(route.referenceHash).toHaveLength(64);
  });

  it('still requires Base CREATE2 env when generating Base routes', async () => {
    delete process.env.BASE_DEPOSIT_FACTORY_ADDRESS;
    delete process.env.BASE_USDC_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_USDT_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_DEPOSIT_PROXY_INIT_CODE_HASH;
    delete process.env.BASE_TREASURY_ADDRESS;
    process.env.SOLANA_UNIQUE_ADDRESS_ROUTES_ENABLED = 'false';

    const strategy = new Create2DepositStrategy();

    await expect(
      strategy.generateAddress({
        chain: 'base',
        token: 'USDC',
        transferId: 'tr_base_missing_config'
      })
    ).rejects.toThrow('Missing CREATE2 config');
  });

  it('uses unique Solana routes when enabled', async () => {
    process.env.SOLANA_UNIQUE_ADDRESS_ROUTES_ENABLED = 'true';
    process.env.SOLANA_RPC_URL = 'https://api.devnet.solana.com';
    process.env.SOLANA_TREASURY_OWNER_PRIVATE_KEY = JSON.stringify(Array.from({ length: 64 }, (_v, i) => (i % 255) + 1));
    process.env.SOLANA_USDC_MINT = '6bDUveKHvCojQNt5VzsvLpScyQyDwScFVzw7mGTRP3Km';
    process.env.SOLANA_USDT_MINT = '2Seg9ZgkCyyqdEgTkNcxG2kszh9S2GrAzcY6XjPhtGJn';

    const strategy = new Create2DepositStrategy();
    const provisionSpy = vi.spyOn(strategy as any, 'provisionUniqueSolanaAddress').mockResolvedValue('UniqueRouteAddress11111111111111111111111111111');

    const route = await strategy.generateAddress({
      chain: 'solana',
      token: 'USDC',
      transferId: 'tr_unique_solana_1'
    });

    expect(provisionSpy).toHaveBeenCalledOnce();
    expect(route.routeKind).toBe('address_route');
    expect(route.referenceHash).toBeNull();
    expect(route.depositAddress).toBe('UniqueRouteAddress11111111111111111111111111111');
  });
});
