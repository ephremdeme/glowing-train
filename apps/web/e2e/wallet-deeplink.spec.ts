import { expect, test } from '@playwright/test';

test('renders chain/token wallet deeplink presets', async ({ page }) => {
  await page.route('**/api/client/auth/register', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        customer: {
          customerId: 'cust_wallet_1',
          fullName: 'Wallet Sender',
          countryCode: 'US'
        },
        session: {
          sessionId: 'csn_wallet_1',
          accessToken: 'customer-access-token',
          refreshToken: 'refresh-token',
          csrfToken: 'csrf-token',
          expiresAt: new Date(Date.now() + 3600_000).toISOString()
        }
      })
    });
  });

  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_wallet_1',
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

  await page.route('**/api/client/recipients', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ recipientId: 'rcp_wallet_1' })
      });
      return;
    }

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

  await page.route('**/api/client/quotes', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'q_wallet_1',
        chain: 'solana',
        token: 'USDC',
        sendAmountUsd: 100,
        feeUsd: 1,
        fxRateUsdToEtb: 140,
        recipientAmountEtb: 13860,
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    });
  });

  await page.route('**/api/client/transfers', async (route, request) => {
    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [], count: 0 })
      });
      return;
    }

    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        transferId: 'tr_wallet_1',
        status: 'AWAITING_FUNDING',
        depositAddress: 'dep_wallet_1',
        quote: {
          quoteId: 'q_wallet_1',
          chain: 'solana',
          token: 'USDC',
          sendAmountUsd: 100,
          feeUsd: 1,
          fxRateUsdToEtb: 140,
          recipientAmountEtb: 13860,
          expiresAt: new Date(Date.now() + 300_000).toISOString()
        }
      })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Save recipient' }).click();
  await page.getByRole('button', { name: 'Lock quote' }).click();
  await page.getByRole('button', { name: 'Create transfer' }).click();

  const coinbase = page.getByRole('link', { name: 'Open Coinbase Wallet' });
  const phantom = page.getByRole('link', { name: 'Open Phantom' });

  await expect(coinbase).toBeVisible();
  await expect(phantom).toBeVisible();
  await expect(coinbase).toHaveAttribute('href', /network=solana/);
  await expect(phantom).toHaveAttribute('href', /splToken=/);
});
