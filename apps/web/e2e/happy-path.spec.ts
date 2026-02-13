import { expect, test } from '@playwright/test';

test('quote to transfer to status polling happy path', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  let statusCalls = 0;

  await page.route('**/api/client/auth/register', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        customer: {
          customerId: 'cust_test_001',
          fullName: 'Diaspora Sender',
          countryCode: 'US'
        },
        session: {
          sessionId: 'csn_test_001',
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
        customerId: 'cust_test_001',
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

  await page.route('**/api/client/recipients', async (route, request) => {
    if (request.method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ recipientId: 'rcp_test_001' })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipients: [
          {
            recipientId: 'rcp_test_001',
            fullName: 'Abebe Kebede',
            bankAccountName: 'Abebe Kebede',
            bankAccountNumber: '1002003004005',
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

  await page.route('**/api/client/recipients/rcp_test_001', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        recipientId: 'rcp_test_001',
        fullName: 'Abebe Kebede',
        bankAccountName: 'Abebe Kebede',
        bankAccountNumber: '1002003004005',
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
        quoteId: 'q_test_001',
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
        transferId: 'tr_test_001',
        status: 'AWAITING_FUNDING',
        depositAddress: 'dep_test_001',
        quote: {
          quoteId: 'q_test_001',
          chain: 'base',
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

  await page.route('**/api/client/transfers/tr_test_001', async (route) => {
    statusCalls += 1;

    if (statusCalls === 1) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          backendStatus: 'AWAITING_FUNDING',
          uiStatus: 'AWAITING_DEPOSIT',
          transfer: {
            transferId: 'tr_test_001',
            quoteId: 'q_test_001',
            senderId: 'cust_test_001',
            recipientId: 'rcp_test_001',
            chain: 'base',
            token: 'USDC',
            sendAmountUsd: 100,
            status: 'AWAITING_FUNDING',
            createdAt: new Date().toISOString(),
            depositAddress: 'dep_test_001',
            depositMemo: null
          },
          quote: {
            quoteId: 'q_test_001',
            fxRateUsdToEtb: 140,
            feeUsd: 1,
            recipientAmountEtb: 13860,
            expiresAt: new Date(Date.now() + 300_000).toISOString()
          },
          recipient: {
            recipientId: 'rcp_test_001',
            fullName: 'Abebe Kebede',
            bankAccountName: 'Abebe Kebede',
            bankAccountNumber: '1002003004005',
            bankCode: 'CBE',
            phoneE164: null
          },
          funding: null,
          payout: null,
          transitions: []
        })
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        backendStatus: 'PAYOUT_COMPLETED',
        uiStatus: 'PAID',
        transfer: {
          transferId: 'tr_test_001',
          quoteId: 'q_test_001',
          senderId: 'cust_test_001',
          recipientId: 'rcp_test_001',
          chain: 'base',
          token: 'USDC',
          sendAmountUsd: 100,
          status: 'PAYOUT_COMPLETED',
          createdAt: new Date(Date.now() - 10000).toISOString(),
          depositAddress: 'dep_test_001',
          depositMemo: null
        },
        quote: {
          quoteId: 'q_test_001',
          fxRateUsdToEtb: 140,
          feeUsd: 1,
          recipientAmountEtb: 13860,
          expiresAt: new Date(Date.now() + 300_000).toISOString()
        },
        recipient: {
          recipientId: 'rcp_test_001',
          fullName: 'Abebe Kebede',
          bankAccountName: 'Abebe Kebede',
          bankAccountNumber: '1002003004005',
          bankCode: 'CBE',
          phoneE164: null
        },
        funding: {
          eventId: 'evt_1',
          txHash: '0x1',
          amountUsd: 100,
          confirmedAt: new Date(Date.now() - 8000).toISOString()
        },
        payout: {
          payoutId: 'pay_1',
          method: 'bank',
          amountEtb: 13860,
          status: 'PAYOUT_INITIATED',
          providerReference: 'provider-1',
          updatedAt: new Date().toISOString()
        },
        transitions: [
          {
            fromState: 'AWAITING_FUNDING',
            toState: 'FUNDING_CONFIRMED',
            occurredAt: new Date(Date.now() - 8000).toISOString()
          },
          {
            fromState: 'PAYOUT_INITIATED',
            toState: 'PAYOUT_COMPLETED',
            occurredAt: new Date().toISOString()
          }
        ]
      })
    });
  });

  await page.goto('/');

  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByText('Sender KYC: approved')).toBeVisible();

  await page.getByRole('button', { name: 'Save recipient' }).click();
  await expect(page.getByText(/Recipient saved/)).toBeVisible();

  await page.getByRole('button', { name: 'Lock quote' }).click();
  await expect(page.getByText(/Quote locked until/)).toBeVisible();

  await page.getByRole('button', { name: 'Create transfer' }).click();
  await expect(page.getByText('Transfer ID: tr_test_001')).toBeVisible();
  await expect(page.getByText('dep_test_001')).toBeVisible();

  await page.getByRole('link', { name: 'Track transfer status' }).click();
  await expect(page).toHaveURL(/\/transfers\/tr_test_001/);
  await expect(page.getByText('UI status: PAID')).toBeVisible({ timeout: 12_000 });

  expect(consoleErrors).toEqual([]);
});
