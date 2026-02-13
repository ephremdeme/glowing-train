import { expect, test } from '@playwright/test';

function seedAuthAndQuote(page: import('@playwright/test').Page, chain: 'base' | 'solana', token: 'USDC' | 'USDT') {
  return page.addInitScript(
    ({ selectedChain, selectedToken }) => {
      localStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
      localStorage.setItem(
        'cryptopay:web:auth-session',
        JSON.stringify({
          token: 'customer-access-token',
          customerId: 'cust_wallet',
          fullName: 'Wallet Sender',
          countryCode: 'US',
          lastSyncedAt: new Date().toISOString()
        })
      );

      sessionStorage.setItem(
        'cryptopay:web:flow-draft',
        JSON.stringify({
          recipientId: null,
          recipient: null,
          quote: {
            quoteId: 'q_wallet_1',
            chain: selectedChain,
            token: selectedToken,
            sendAmountUsd: 100,
            feeUsd: 1,
            fxRateUsdToEtb: 140,
            recipientAmountEtb: 13860,
            expiresAt: new Date(Date.now() + 300_000).toISOString()
          },
          transfer: null,
          updatedAt: new Date().toISOString()
        })
      );
    },
    { selectedChain: chain, selectedToken: token }
  );
}

async function mockCommonRoutes(page: import('@playwright/test').Page, chain: 'base' | 'solana', token: 'USDC' | 'USDT') {
  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_wallet',
        fullName: 'Wallet Sender',
        countryCode: 'US',
        status: 'active',
        senderKyc: {
          kycStatus: 'approved',
          applicantId: 'sumsub-applicant-wallet',
          reasonCode: null,
          lastReviewedAt: new Date().toISOString()
        }
      })
    });
  });

  await page.route('**/api/client/recipients', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipients: [
          {
            recipientId: 'rcp_wallet_1',
            fullName: 'Wallet Receiver',
            bankAccountName: 'Wallet Receiver',
            bankAccountNumber: '123123123',
            bankCode: 'CBE',
            phoneE164: null,
            countryCode: 'ET',
            status: 'active',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          }
        ]
      })
    });
  });

  await page.route('**/api/client/recipients/rcp_wallet_1', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipientId: 'rcp_wallet_1',
        fullName: 'Wallet Receiver',
        bankAccountName: 'Wallet Receiver',
        bankAccountNumber: '123123123',
        bankCode: 'CBE',
        phoneE164: null,
        countryCode: 'ET',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        receiverKyc: {
          kycStatus: 'approved',
          nationalIdVerified: true
        }
      })
    });
  });

  await page.route('**/api/client/transfers', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        transferId: 'tr_wallet_1',
        status: 'AWAITING_FUNDING',
        depositAddress: 'dep_wallet_1',
        quote: {
          quoteId: 'q_wallet_1',
          chain,
          token,
          sendAmountUsd: 100,
          feeUsd: 1,
          fxRateUsdToEtb: 140,
          recipientAmountEtb: 13860,
          expiresAt: new Date(Date.now() + 300_000).toISOString()
        }
      })
    });
  });
}

test('solana route renders coinbase + phantom deeplink presets', async ({ page }) => {
  await seedAuthAndQuote(page, 'solana', 'USDC');
  await mockCommonRoutes(page, 'solana', 'USDC');

  await page.goto('/transfer');
  await page.getByRole('button', { name: 'Create transfer' }).click();

  const coinbase = page.getByRole('link', { name: 'Open Coinbase Wallet' });
  const phantom = page.getByRole('link', { name: 'Open Phantom' });

  await expect(coinbase).toBeVisible();
  await expect(phantom).toBeVisible();
  await expect(coinbase).toHaveAttribute('href', /network=solana/);
  await expect(phantom).toHaveAttribute('href', /splToken=/);
});

test('base route renders coinbase deeplink without phantom preset', async ({ page }) => {
  await seedAuthAndQuote(page, 'base', 'USDT');
  await mockCommonRoutes(page, 'base', 'USDT');

  await page.goto('/transfer');
  await page.getByRole('button', { name: 'Create transfer' }).click();

  const coinbase = page.getByRole('link', { name: 'Open Coinbase Wallet' });
  const phantom = page.getByRole('link', { name: 'Open Phantom' });

  await expect(coinbase).toBeVisible();
  await expect(coinbase).toHaveAttribute('href', /network=base/);
  await expect(phantom).toHaveCount(0);
});
