export interface LedgerPosting {
  transferId: string;
  debitAccount: string;
  creditAccount: string;
  amountUsd: number;
  description?: string;
}

export interface LedgerJournalResult {
  journalId: string;
  transferId: string;
  totalDebitUsd: number;
  totalCreditUsd: number;
  balanced: boolean;
}
