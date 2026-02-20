import { log } from '@cryptopay/observability';
import type { FastifyInstance } from 'fastify';

type CleanupFn = () => Promise<void> | void;

export interface ServiceBootstrapOptions {
  serviceName: string;
  buildApp: () => Promise<FastifyInstance>;
  defaultPort: number;
  portEnv: string;
  hostEnv: string;
  defaultHost?: string;
  onReady?: (app: FastifyInstance) => Promise<void | CleanupFn> | void | CleanupFn;
  onShutdown?: () => Promise<void> | void;
}

function parseHost(raw: string | undefined, fallback: string, envName: string): string {
  const resolved = (raw ?? fallback).trim();
  if (resolved.length === 0) {
    throw new Error(`${envName} must be a non-empty host string.`);
  }
  return resolved;
}

function parsePort(raw: string | undefined, fallback: number, envName: string): number {
  const resolved = raw ?? String(fallback);
  const port = Number(resolved);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`${envName} must be an integer between 1 and 65535.`);
  }
  return port;
}

export async function runService(options: ServiceBootstrapOptions): Promise<void> {
  const app = await options.buildApp();
  const host = parseHost(process.env[options.hostEnv], options.defaultHost ?? '0.0.0.0', options.hostEnv);
  const port = parsePort(process.env[options.portEnv], options.defaultPort, options.portEnv);
  const extraCleanup = await options.onReady?.(app);

  await app.listen({ port, host });
  log('info', `${options.serviceName} listening`, { host, port });

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;

    log('warn', `${options.serviceName} shutting down`, { signal });

    if (extraCleanup) {
      await extraCleanup();
    }

    await app.close();
    await options.onShutdown?.();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

export function runServiceAndExit(options: ServiceBootstrapOptions): void {
  void runService(options).catch((error) => {
    log('error', `${options.serviceName} failed to start`, {
      error: (error as Error).message
    });
    process.exit(1);
  });
}
