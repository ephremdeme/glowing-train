import { expect, test } from '@playwright/test';

test('login page starts Google OAuth without password login', async ({ page }) => {
  await page.route('**/api/client/auth/sign-in/google**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        authUrl: 'http://127.0.0.1:3100/google-oauth-mock'
      })
    });
  });

  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveURL('/google-oauth-mock');

  const pendingNext = await page.evaluate(() => window.sessionStorage.getItem('cryptopay:web:google-next'));
  expect(pendingNext).toBe('/quote');
});

test('google callback writes session and redirects to authenticated quote page', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('cryptopay:web:google-next', '/quote');
  });

  await page.route('**/api/client/auth/session/exchange', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'google-access-token',
        customerId: 'cust_google_1',
        sessionId: 'csn_google_1',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    });
  });

  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_google_1',
        fullName: 'Google Sender',
        countryCode: 'US',
        status: 'active',
        senderKyc: {
          kycStatus: 'pending',
          applicantId: 'sumsub-applicant-google',
          reasonCode: null,
          lastReviewedAt: null
        }
      })
    });
  });

  await page.goto('/auth/google/callback?state=abc123&code=xyz789');
  await expect(page).toHaveURL('/quote');

  const token = await page.evaluate(() => window.sessionStorage.getItem('cryptopay:web:access-token'));
  expect(token).toBe('google-access-token');
});
