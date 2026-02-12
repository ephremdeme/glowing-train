import { z } from 'zod';
import { QuoteExpiredError, QuoteNotFoundError, QuoteValidationError, type QuoteService } from '../modules/quotes/index.js';

const createQuotePayloadSchema = z.object({
  chain: z.enum(['base', 'solana']),
  token: z.enum(['USDC', 'USDT']),
  sendAmountUsd: z.number().positive(),
  fxRateUsdToEtb: z.number().positive(),
  feeUsd: z.number().min(0),
  expiresInSeconds: z.number().int().positive().max(1800).default(300)
});

interface HttpSuccess<T> {
  status: number;
  body: T;
}

interface HttpError {
  status: number;
  body: {
    error: {
      code: string;
      message: string;
    };
  };
}

type HttpResponse<T> = HttpSuccess<T> | HttpError;

function mapError(error: unknown): HttpError {
  if (error instanceof QuoteNotFoundError) {
    return { status: 404, body: { error: { code: error.code, message: error.message } } };
  }

  if (error instanceof QuoteExpiredError) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } };
  }

  if (error instanceof QuoteValidationError || error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'QUOTE_VALIDATION_ERROR',
          message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Invalid payload' : error.message
        }
      }
    };
  }

  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error.' } } };
}

export function buildQuoteRoutes(service: QuoteService) {
  return {
    create: async (payload: unknown): Promise<HttpResponse<{ quoteId: string; expiresAt: string }>> => {
      try {
        const input = createQuotePayloadSchema.parse(payload);
        const quote = await service.createQuote(input);
        return {
          status: 201,
          body: {
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt.toISOString()
          }
        };
      } catch (error) {
        return mapError(error);
      }
    },

    get: async (quoteId: string): Promise<HttpResponse<{ quoteId: string; expiresAt: string }>> => {
      try {
        const quote = await service.getQuote(quoteId);
        return {
          status: 200,
          body: {
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt.toISOString()
          }
        };
      } catch (error) {
        return mapError(error);
      }
    }
  };
}
