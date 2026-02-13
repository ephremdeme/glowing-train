import type { SupportedChain, SupportedToken, TransferState } from '@cryptopay/domain';

export type KycStatus = 'approved' | 'pending' | 'rejected';

export interface CreateTransferInput {
  quoteId: string;
  senderId: string;
  receiverId: string;
  senderKycStatus: KycStatus;
  receiverKycStatus: KycStatus;
  receiverNationalIdVerified: boolean;
  idempotencyKey: string;
}

export interface QuoteSnapshot {
  quoteId: string;
  chain: SupportedChain;
  token: SupportedToken;
  sendAmountUsd: number;
  expiresAt: Date;
}

export interface ReceiverKycProfileSnapshot {
  receiverId: string;
  kycStatus: KycStatus;
  nationalIdVerified: boolean;
}

export interface TransferRecord {
  transferId: string;
  quoteId: string;
  senderId: string;
  receiverId: string;
  senderKycStatus: KycStatus;
  receiverKycStatus: KycStatus;
  receiverNationalIdVerified: boolean;
  chain: SupportedChain;
  token: SupportedToken;
  sendAmountUsd: number;
  status: TransferState;
  createdAt: Date;
}

export interface DepositRouteRecord {
  routeId: string;
  transferId: string;
  chain: SupportedChain;
  token: SupportedToken;
  depositAddress: string;
  depositMemo: string | null;
  status: 'active' | 'retired';
  createdAt: Date;
}

export interface TransferCreationResult {
  transfer: TransferRecord;
  depositRoute: DepositRouteRecord;
}

export interface IdempotencyRecord {
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: TransferCreationResult;
  expiresAt: Date;
}

export interface TransferRepositoryPort {
  findQuoteById(quoteId: string): Promise<QuoteSnapshot | null>;
  findReceiverKycProfile(receiverId: string): Promise<ReceiverKycProfileSnapshot | null>;
  findIdempotency(key: string): Promise<IdempotencyRecord | null>;
  persistTransferWithRoute(params: {
    transfer: Omit<TransferRecord, 'createdAt'>;
    route: Omit<DepositRouteRecord, 'createdAt'>;
  }): Promise<TransferCreationResult>;
  saveIdempotencyRecord(params: {
    key: string;
    requestHash: string;
    responseStatus: number;
    responseBody: TransferCreationResult;
    now: Date;
  }): Promise<void>;
}
