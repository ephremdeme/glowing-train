import { expect, test } from '@playwright/test';

test('renders sender and receiver KYC blockers with guided actions', async ({ page }) => {
  await page.route('**/api/client/auth/register', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        customer: {
          customerId: 'cust_test_kyc',
          fullName: 'Diaspora Sender',
          countryCode: 'US'
        },
        session: {
          sessionId: 'csn_test_kyc',
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
        customerId: 'cust_test_kyc',
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

  await page.route('**/api/client/recipients', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ recipientId: 'rcp_test_kyc' })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipients: [
          {
            recipientId: 'rcp_test_kyc',
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

  await page.route('**/api/client/recipients/rcp_test_kyc', async (route, request) => {
    if (request.method() === 'PATCH') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          recipientId: 'rcp_test_kyc',
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
            kycStatus: 'approved',
            nationalIdVerified: true
          }
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipientId: 'rcp_test_kyc',
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

  await page.route('**/api/client/kyc/sender/status', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        kycStatus: 'pending',
        reasonCode: null,
        applicantId: 'sumsub-applicant-1',
        lastReviewedAt: null
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

  await page.goto('/');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByText('Sender KYC blocked: pending')).toBeVisible();
  await page.getByRole('button', { name: 'Restart verification' }).click();

  await page.getByRole('button', { name: 'Save recipient' }).click();
  await expect(page.getByText('Receiver KYC blocked: pending')).toBeVisible();

  await page.getByRole('button', { name: 'Apply receiver KYC update' }).click();
  await expect(page.getByText('Receiver KYC updated.')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Create transfer' })).toBeDisabled();
});
