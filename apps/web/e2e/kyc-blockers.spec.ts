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
    localStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    localStorage.setItem(
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

  await page.route('**/api/client/quotes', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        quoteId: 'q_kyc_001',
        chain: 'base',
        token: 'USDC',
        sendAmountUsd: 120,
        feeUsd: 1,
        fxRateUsdToEtb: 140,
        recipientAmountEtb: 16660,
        expiresAt: new Date(Date.now() + 300_000).toISOString()
      })
    });
  });

  await page.route('**/api/client/kyc/sender/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kycStatus: 'rejected',
        reasonCode: 'document_mismatch',
        applicantId: 'sumsub-applicant-1',
        lastReviewedAt: new Date().toISOString()
      })
    });
  });

  await page.route('**/api/client/kyc/sender/sumsub-token', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'sumsub-token',
        applicantId: 'sumsub-applicant-1',
        provider: 'sumsub'
      })
    });
  });

  await page.goto('/quote');
  await expect(page.getByText('Verification required')).toBeVisible();

  await page.getByRole('button', { name: 'Lock quote' }).click();
  await expect(page.getByText('Sender KYC must be approved first.')).toBeVisible();

  await page.getByRole('button', { name: 'Refresh status' }).click();
  await expect(page.getByRole('button', { name: 'Restart verification' })).toBeVisible();

  await page.getByRole('button', { name: 'Restart verification' }).click();
  await expect(page.getByText('Verification session started.')).toBeVisible();
});

test('receiver blocker prevents transfer until recipient KYC remediation succeeds', async ({ page }) => {
  let receiverApproved = false;

  await page.addInitScript((draft) => {
    localStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
    localStorage.setItem(
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
    if (request.method() === 'PATCH') {
      receiverApproved = true;
    }

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
          kycStatus: receiverApproved ? 'approved' : 'pending',
          nationalIdVerified: receiverApproved
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
  await expect(page.getByText('Receiver must pass KYC before transfer creation.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create transfer' })).toBeDisabled();

  await page.getByRole('button', { name: 'Apply receiver KYC update' }).click();
  await expect(page.getByText('Receiver KYC updated.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Create transfer' })).toBeEnabled();

  await page.getByRole('button', { name: 'Create transfer' }).click();
  await expect(page.getByText('Deposit instructions')).toBeVisible();
});
