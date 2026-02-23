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
  await expect(page.getByRole('heading', { name: 'Send crypto.' })).toBeVisible();
  await expect(page.getByText('Sender Journey')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();

  await page.getByLabel('You send (USD)').fill('200');
  await expect(page.getByText(/27,860/)).toBeVisible();

  await page.getByRole('button', { name: 'Get quote' }).click();
  await expect(page).toHaveURL(/\/signup\?next=%2Ftransfer/);

  const draft = await page.evaluate(() => window.sessionStorage.getItem('cryptopay:web:flow-draft'));
  expect(draft).toContain('q_land_001');
});

test('landing lock quote routes authenticated sender directly to transfer', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    sessionStorage.setItem(
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
  await page.getByRole('button', { name: 'Get quote' }).click();
  await expect(page).toHaveURL('/transfer');
});
