import { z } from 'zod';
import { log } from '@cryptopay/observability';
import type { FxRateProvider } from '@cryptopay/adapters';
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

export interface QuoteRouteOptions {
  fxProvider?: FxRateProvider;
  /** Maximum allowed divergence between client and server FX rate (0-100). Default 2%. */
  fxRateTolerancePercent?: number;
}

export function buildQuoteRoutes(service: QuoteService, options?: QuoteRouteOptions) {
  const fxProvider = options?.fxProvider;
  const tolerancePercent = options?.fxRateTolerancePercent ?? 2;

  return {
    create: async (payload: unknown): Promise<HttpResponse<{ quoteId: string; expiresAt: string; serverFxRate?: number }>> => {
      try {
        const input = createQuotePayloadSchema.parse(payload);

        // Validate FX rate against server-side rate if provider is available
        let serverRate: number | undefined;
        if (fxProvider) {
          try {
            const fx = await fxProvider.getRate('USD', 'ETB');
            serverRate = fx.rate;
            const fxRate = fx.rate;

            const divergencePercent = Math.abs(input.fxRateUsdToEtb - fxRate) / fxRate * 100;
            if (divergencePercent > tolerancePercent) {
              return {
                status: 400,
                body: {
                  error: {
                    code: 'FX_RATE_DIVERGENCE',
                    message: `Client FX rate ${input.fxRateUsdToEtb} diverges ${divergencePercent.toFixed(1)}% from server rate ${serverRate}. Max allowed: ${tolerancePercent}%.`
                  }
                }
              };
            }

            log('info', 'FX rate validated', {
              clientRate: input.fxRateUsdToEtb,
              serverRate,
              divergencePercent: divergencePercent.toFixed(2)
            });
          } catch (fxError) {
            // FX provider unavailable — allow client rate as fallback
            log('warn', 'FX rate provider unavailable, accepting client rate', {
              clientRate: input.fxRateUsdToEtb,
              error: (fxError as Error).message
            });
          }
        }

        const quote = await service.createQuote(input);
        return {
          status: 201,
          body: {
            quoteId: quote.quoteId,
            expiresAt: quote.expiresAt.toISOString(),
            ...(serverRate !== undefined ? { serverFxRate: serverRate } : {})
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
