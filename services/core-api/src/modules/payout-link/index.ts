import { z } from 'zod';

const payoutLinkSchema = z.object({
  transferId: z.string().min(1),
  method: z.literal('bank'),
  recipientAccountRef: z.string().min(3),
  amountEtb: z.number().positive(),
  idempotencyKey: z.string().min(8)
});

export interface PayoutOrchestratorClient {
  initiate(input: {
    transferId: string;
    method: 'bank';
    recipientAccountRef: string;
    amountEtb: number;
    idempotencyKey: string;
  }): Promise<{
    status: 'initiated' | 'review_required';
    payoutId: string;
    transferId: string;
  }>;
}

export function buildPayoutLink(client: PayoutOrchestratorClient) {
  return {
    initiate: async (payload: unknown) => {
      const input = payoutLinkSchema.parse(payload);
      return client.initiate(input);
    }
  };
}
