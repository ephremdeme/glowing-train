import { expect, test } from '@playwright/test';

function mockTransferDetail(status: 'AWAITING_FUNDING' | 'PAYOUT_COMPLETED') {
  const uiStatus = status === 'PAYOUT_COMPLETED' ? 'PAID' : 'AWAITING_DEPOSIT';
  return {
    backendStatus: status,
    uiStatus,
    transfer: {
      transferId: 'tr_test_001',
      quoteId: 'q_test_001',
      senderId: 'cust_test_001',
      recipientId: 'rcp_test_001',
      chain: 'base',
      token: 'USDC',
      sendAmountUsd: 100,
      status,
      createdAt: new Date(Date.now() - 10_000).toISOString(),
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
    funding:
      status === 'PAYOUT_COMPLETED'
        ? {
            eventId: 'evt_1',
            txHash: '0x1',
            amountUsd: 100,
            confirmedAt: new Date(Date.now() - 8_000).toISOString()
          }
        : null,
    payout:
      status === 'PAYOUT_COMPLETED'
        ? {
            payoutId: 'pay_1',
            method: 'bank',
            amountEtb: 13860,
            status: 'PAYOUT_COMPLETED',
            providerReference: 'provider-1',
            updatedAt: new Date().toISOString()
          }
        : null,
    transitions:
      status === 'PAYOUT_COMPLETED'
        ? [
            {
              fromState: 'AWAITING_FUNDING',
              toState: 'FUNDING_CONFIRMED',
              occurredAt: new Date(Date.now() - 8_000).toISOString()
            },
            {
              fromState: 'PAYOUT_INITIATED',
              toState: 'PAYOUT_COMPLETED',
              occurredAt: new Date().toISOString()
            }
          ]
        : []
  };
}

test('multipage happy path: signup -> login -> quote -> transfer -> status -> history', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  let transferStatusCalls = 0;

  await page.route('**/api/client/auth/sign-up/email', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({
        customer: {
          customerId: 'cust_test_001',
          fullName: 'Diaspora Sender',
          countryCode: 'US'
        }
      })
    });
  });

  await page.route('**/api/client/auth/sign-in/email', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        session: {
          sessionId: 'csn_test_001',
          expiresAt: new Date(Date.now() + 3600_000).toISOString()
        },
        customer: {
          customerId: 'cust_test_001',
          fullName: 'Diaspora Sender',
          countryCode: 'US'
        }
      })
    });
  });

  await page.route('**/api/client/auth/session/exchange', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        token: 'customer-access-token',
        customerId: 'cust_test_001',
        sessionId: 'csn_test_001',
        expiresAt: new Date(Date.now() + 300_000).toISOString()
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

  await page.route('**/api/client/transfers**', async (route, request) => {
    if (request.url().includes('/api/client/transfers/tr_test_001')) {
      await route.fallback();
      return;
    }

    if (request.method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          items: [
            {
              transferId: 'tr_test_001',
              quoteId: 'q_test_001',
              recipientId: 'rcp_test_001',
              recipientName: 'Abebe Kebede',
              chain: 'base',
              token: 'USDC',
              sendAmountUsd: 100,
              status: 'PAYOUT_COMPLETED',
              depositAddress: 'dep_test_001',
              createdAt: new Date().toISOString()
            }
          ],
          count: 1
        })
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
    transferStatusCalls += 1;
    const payload = transferStatusCalls > 1 ? mockTransferDetail('PAYOUT_COMPLETED') : mockTransferDetail('AWAITING_FUNDING');
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload)
    });
  });

  await page.goto('/');

  await page.getByRole('link', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/signup/);

  await page.getByLabel('Full name').fill('Diaspora Sender');
  await page.getByLabel('Country').selectOption('US');
  await page.getByLabel('Email').fill('sender@example.com');
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/quote');
  await page.getByRole('button', { name: 'Lock quote' }).click();
  await expect(page.getByText('Quote locked. Continue to transfer setup.')).toBeVisible();

  await page.getByRole('link', { name: 'Continue to transfer' }).click();
  await expect(page).toHaveURL('/transfer');

  await page.getByRole('button', { name: 'Create transfer' }).click();
  await expect(page.getByRole('heading', { name: 'Deposit instructions' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open Coinbase Wallet' })).toBeVisible();

  await page.getByRole('link', { name: 'Track transfer status' }).click();
  await expect(page).toHaveURL(/\/transfers\/tr_test_001/);
  await expect(page.getByText('UI status: PAID')).toBeVisible({ timeout: 12_000 });

  await page.getByRole('navigation').getByRole('link', { name: 'History' }).click();
  await expect(page).toHaveURL('/history');
  await expect(page.getByText('tr_test_001')).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
