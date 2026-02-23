import { expect, test } from '@playwright/test';

const quoteDraft = {
  recipientId: null,
  recipient: null,
  quote: {
    quoteId: 'q_kyc_001',
    chain: 'base',
    token: 'USDC',
    sendAmountUsd: 120,
    feeUsd: 1,
    fxRateUsdToEtb: 140,
    recipientAmountEtb: 16660,
    expiresAt: new Date(Date.now() + 300_000).toISOString()
  },
  transfer: null,
  updatedAt: new Date().toISOString()
};

test('sender blocker shows pending/rejected guidance and restart action', async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    sessionStorage.setItem(
      'cryptopay:web:auth-session',
      JSON.stringify({
        token: 'customer-access-token',
        customerId: 'cust_kyc_1',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        lastSyncedAt: new Date().toISOString()
      })
    );
  });

  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_kyc_1',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        status: 'active',
        senderKyc: {
          kycStatus: 'pending',
          applicantId: 'sumsub-applicant-1',
          reasonCode: null,
          lastReviewedAt: null
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
            recipientId: 'rcp_kyc_pending',
            fullName: 'Pending Sender Recipient',
            bankAccountName: 'Pending Sender Recipient',
            bankAccountNumber: '99998888',
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

  await page.route('**/api/client/recipients/rcp_kyc_pending', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipientId: 'rcp_kyc_pending',
        fullName: 'Pending Sender Recipient',
        bankAccountName: 'Pending Sender Recipient',
        bankAccountNumber: '99998888',
        bankCode: 'CBE',
        phoneE164: null,
        countryCode: 'ET',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        receiverKyc: {
          kycStatus: 'rejected',
          nationalIdVerified: false
        }
      })
    });
  });

  await page.goto('/transfer');
  await expect(page.getByText('Sender verification required')).toBeVisible();
  await expect(page.getByText('Transfer creation unlocks after sender KYC approval.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create transfer' })).toHaveCount(0);
  await expect(page.getByText('Recipient ready')).toBeVisible();
});

test('receiver KYC state no longer blocks transfer creation', async ({ page }) => {
  await page.addInitScript((draft) => {
    sessionStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    sessionStorage.setItem(
      'cryptopay:web:auth-session',
      JSON.stringify({
        token: 'customer-access-token',
        customerId: 'cust_kyc_2',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        lastSyncedAt: new Date().toISOString()
      })
    );
    sessionStorage.setItem('cryptopay:web:flow-draft', JSON.stringify(draft));
  }, quoteDraft);

  await page.route('**/api/client/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        customerId: 'cust_kyc_2',
        fullName: 'Diaspora Sender',
        countryCode: 'US',
        status: 'active',
        senderKyc: {
          kycStatus: 'approved',
          applicantId: 'sumsub-applicant-2',
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
            recipientId: 'rcp_kyc_001',
            fullName: 'Blocked Receiver',
            bankAccountName: 'Blocked Receiver',
            bankAccountNumber: '11111111',
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

  await page.route('**/api/client/recipients/rcp_kyc_001', async (route, request) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipientId: 'rcp_kyc_001',
        fullName: 'Blocked Receiver',
        bankAccountName: 'Blocked Receiver',
        bankAccountNumber: '11111111',
        bankCode: 'CBE',
        phoneE164: null,
        countryCode: 'ET',
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        receiverKyc: {
          kycStatus: 'pending',
          nationalIdVerified: false
        }
      })
    });
  });

  await page.route('**/api/client/transfers', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        transferId: 'tr_kyc_001',
        status: 'AWAITING_FUNDING',
        depositAddress: 'dep_kyc_001',
        quote: quoteDraft.quote
      })
    });
  });

  await page.goto('/transfer');
  await expect(page.getByRole('button', { name: 'Create transfer' })).toBeEnabled();

  await page.getByRole('button', { name: 'Create transfer' }).click();
  await expect(page.getByRole('heading', { name: 'Deposit instructions' })).toBeVisible();
  await expect(page.getByText('Receiver must pass KYC before transfer creation.')).toHaveCount(0);
});
