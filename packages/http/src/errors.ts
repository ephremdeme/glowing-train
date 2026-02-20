import type { FastifyReply, FastifyRequest } from 'fastify';

export function errorEnvelope(request: FastifyRequest, code: string, message: string, details?: unknown): { error: Record<string, unknown> } {
  const error: Record<string, unknown> = {
    code,
    message,
    requestId: request.id
  };

  if (details !== undefined) {
    error.details = details;
  }

  return { error };
}

export function deny(params: {
  request: FastifyRequest;
  reply: FastifyReply;
  code: string;
  message: string;
  status?: number;
  details?: unknown;
}): FastifyReply {
  return params.reply.status(params.status ?? 400).send(errorEnvelope(params.request, params.code, params.message, params.details));
}
