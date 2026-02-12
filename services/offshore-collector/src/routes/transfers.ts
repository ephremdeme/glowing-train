import { z } from 'zod';
import {
  IdempotencyConflictError,
  QuoteExpiredError,
  QuoteNotFoundError,
  TransferValidationError,
  type TransferService
} from '../modules/transfers/index.js';

const createTransferPayloadSchema = z.object({
  quoteId: z.string().min(1),
  senderId: z.string().min(1),
  receiverId: z.string().min(1),
  senderKycStatus: z.enum(['approved', 'pending', 'rejected']),
  receiverKycStatus: z.enum(['approved', 'pending', 'rejected']),
  receiverNationalIdVerified: z.boolean(),
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
