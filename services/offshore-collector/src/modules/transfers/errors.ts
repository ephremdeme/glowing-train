export class TransferValidationError extends Error {
  readonly code = 'TRANSFER_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'TransferValidationError';
  }
}

export class QuoteNotFoundError extends Error {
  readonly code = 'QUOTE_NOT_FOUND';

  constructor(quoteId: string) {
    super(`Quote ${quoteId} was not found.`);
    this.name = 'QuoteNotFoundError';
  }
}

export class QuoteExpiredError extends Error {
  readonly code = 'QUOTE_EXPIRED';

  constructor(quoteId: string, expiresAt: Date) {
    super(`Quote ${quoteId} expired at ${expiresAt.toISOString()}.`);
    this.name = 'QuoteExpiredError';
  }
}

export class IdempotencyConflictError extends Error {
  readonly code = 'IDEMPOTENCY_CONFLICT';

  constructor(key: string) {
    super(`Idempotency key ${key} was reused with a different request payload.`);
    this.name = 'IdempotencyConflictError';
  }
}
