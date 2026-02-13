import { expect, test } from '@playwright/test';

test('history page and printable receipt render from customer transfer APIs', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('cryptopay:web:access-token', 'customer-access-token');
  });

  await page.route('**/api/client/transfers?**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        items: [
          {
            transferId: 'tr_hist_001',
            quoteId: 'q_hist_001',
            recipientId: 'rcp_hist_001',
            recipientName: 'Abebe Kebede',
            chain: 'base',
            token: 'USDC',
            sendAmountUsd: 150,
            status: 'PAYOUT_COMPLETED',
            depositAddress: 'dep_hist_001',
            createdAt: new Date().toISOString()
          }
        ],
        count: 1
      })
    });
  });

  await page.route('**/api/client/transfers/tr_hist_001', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        backendStatus: 'PAYOUT_COMPLETED',
        uiStatus: 'PAID',
        transfer: {
          transferId: 'tr_hist_001',
          quoteId: 'q_hist_001',
          senderId: 'cust_1',
          recipientId: 'rcp_hist_001',
          chain: 'base',
          token: 'USDC',
          sendAmountUsd: 150,
          status: 'PAYOUT_COMPLETED',
          createdAt: new Date().toISOString(),
          depositAddress: 'dep_hist_001',
          depositMemo: null
        },
        quote: {
          quoteId: 'q_hist_001',
          fxRateUsdToEtb: 140,
          feeUsd: 1,
          recipientAmountEtb: 20860,
          expiresAt: new Date().toISOString()
        },
        recipient: {
          recipientId: 'rcp_hist_001',
          fullName: 'Abebe Kebede',
          bankAccountName: 'Abebe Kebede',
          bankAccountNumber: '1002003004005',
          bankCode: 'CBE',
          phoneE164: null
        },
        funding: {
          eventId: 'evt_hist_1',
          txHash: '0xhist',
          amountUsd: 150,
          confirmedAt: new Date().toISOString()
        },
        payout: {
          payoutId: 'pay_hist_1',
          method: 'bank',
          amountEtb: 20860,
          status: 'PAYOUT_INITIATED',
          providerReference: 'provider-hist',
          updatedAt: new Date().toISOString()
        },
        transitions: [
          {
            fromState: 'PAYOUT_INITIATED',
            toState: 'PAYOUT_COMPLETED',
            occurredAt: new Date().toISOString()
          }
        ]
      })
    });
  });

  await page.goto('/history');
  await expect(page.getByText('Sender Transfer History')).toBeVisible();
  await expect(page.getByText('tr_hist_001')).toBeVisible();

  await page.getByRole('link', { name: 'Receipt' }).click();
  await expect(page).toHaveURL(/\/receipts\/tr_hist_001/);
  await expect(page.getByText('CryptoPay Transfer Receipt')).toBeVisible();
  await expect(page.getByText('Transfer ID')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print receipt' })).toBeVisible();
});
