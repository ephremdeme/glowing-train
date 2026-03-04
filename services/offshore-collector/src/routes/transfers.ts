import { z } from 'zod';
import {
  IdempotencyConflictError,
  QuoteExpiredError,
  QuoteNotFoundError,
  SolanaRouteProvisioningError,
  TransferValidationError,
  type TransferService
} from '../modules/transfers/index.js';

const createTransferPayloadSchema = z.object({
  quoteId: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  senderKycStatus: z.enum(['approved', 'pending', 'rejected']),
  idempotencyKey: z.string().min(8)
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

  if (error instanceof IdempotencyConflictError) {
    return { status: 409, body: { error: { code: error.code, message: error.message } } };
  }

  if (error instanceof TransferValidationError || error instanceof z.ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'TRANSFER_VALIDATION_ERROR',
          message: error instanceof z.ZodError ? error.issues[0]?.message ?? 'Invalid payload' : error.message
        }
      }
    };
  }

  if (error instanceof SolanaRouteProvisioningError) {
    return {
      status: 503,
      body: {
        error: {
          code: error.code,
          message: error.message
        }
      }
    };
  }

  const dbError = error as { code?: string; constraint?: string; message?: string } | undefined;
  if (dbError?.code === '23505' && dbError.constraint === 'idx_deposit_routes_chain_token_address') {
    return {
      status: 409,
      body: {
        error: {
          code: 'DEPOSIT_ROUTE_CONFLICT',
          message:
            'Legacy deposit route uniqueness rule is blocking shared Solana treasury routes. Apply the latest DB migrations and retry.'
        }
      }
    };
  }

  return {
    status: 500,
    body: {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected error.'
      }
    }
  };
}

export function buildTransferRoutes(service: TransferService) {
  return {
    create: async (payload: unknown): Promise<HttpResponse<{ transferId: string; depositAddress: string; status: string }>> => {
      try {
        const input = createTransferPayloadSchema.parse(payload);
        const result = await service.createTransfer(input);

        return {
          status: 201,
          body: {
            transferId: result.transfer.transferId,
            depositAddress: result.depositRoute.depositAddress,
            status: result.transfer.status
          }
        };
      } catch (error) {
        return mapError(error);
      }
    }
  };
}
