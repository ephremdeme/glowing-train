export class QuoteValidationError extends Error {
  readonly code = 'QUOTE_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'QuoteValidationError';
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
