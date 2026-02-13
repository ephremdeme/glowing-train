import { expect, test } from '@playwright/test';

test('landing estimator updates and unauthenticated lock quote redirects to signup with preserved draft', async ({ page }) => {
  await page.route('**/api/client/quotes', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'q_land_001',
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 200,
        feeUsd: 1,
        fxRateUsdToEtb: 140,
        recipientAmountEtb: 27860,
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    });
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Convert stablecoins to ETB payouts in minutes.' })).toBeVisible();
  await expect(page.getByText('Sender Journey')).toHaveCount(0);
  await expect(page.getByText(/Step\\s+\\d+/)).toHaveCount(0);

  await page.getByLabel('You send (USD)').fill('200');
  await expect(page.getByText(/27,860/)).toBeVisible();

  await page.getByRole('button', { name: 'Lock real quote' }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Ftransfer/);

  const draft = await page.evaluate(() => window.sessionStorage.getItem('cryptopay:web:flow-draft'));
  expect(draft).toContain('q_land_001');
});

test('landing lock quote routes authenticated sender directly to transfer', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    localStorage.setItem(
      'cryptopay:web:auth-session',
      JSON.stringify({
        token: 'customer-access-token',
        customerId: 'cust_land_1',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        lastSyncedAt: new Date().toISOString()
      })
    );
  });

  await page.route('**/api/client/quotes', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'q_land_002',
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 100,
        feeUsd: 1,
        fxRateUsdToEtb: 140,
        recipientAmountEtb: 13860,
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    });
  });

  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_land_1',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        status: 'active',
        senderKyc: {
          kycStatus: 'approved',
          applicantId: 'sumsub-applicant-1',
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
      body: JSON.stringify({ recipients: [] })
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Lock real quote' }).click();
  await expect(page).toHaveURL('/transfer');
});
