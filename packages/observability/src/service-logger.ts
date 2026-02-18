/**
 * Production-grade structured logger.
 *
 * Enhances the base logger with:
 * - Service name context
 * - Log levels (debug, info, warn, error)
 * - Request correlation ID tracking
 * - Sensitive field redaction
 * - Environment-aware verbosity
 */

import { log as baseLog, type LogLevel } from './logger.js';

export type ExtendedLogLevel = LogLevel | 'debug';

export interface ServiceLoggerConfig {
    /** Service name injected into every log line. */
    service: string;
    /** Minimum log level (default: 'info' in production, 'debug' elsewhere). */
    minLevel?: ExtendedLogLevel;
    /** Fields to redact from metadata (default: password, token, secret, etc.). */
    redactFields?: string[];
}

const LOG_LEVEL_ORDER: Record<ExtendedLogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3
};

const DEFAULT_REDACT_FIELDS = [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'refreshToken',
    'refresh_token',
    'accessToken',
    'access_token',
    'apiKey',
    'api_key',
    'privateKey',
    'private_key'
];

function redactMetadata(
    metadata: Record<string, unknown>,
    redactFields: string[]
): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
        if (redactFields.some((f) => key.toLowerCase().includes(f.toLowerCase()))) {
            result[key] = '[REDACTED]';
        } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
            result[key] = redactMetadata(value as Record<string, unknown>, redactFields);
        } else {
            result[key] = value;
        }
    }
    return result;
}

export function createServiceLogger(config: ServiceLoggerConfig) {
    const env = process.env.NODE_ENV ?? 'development';
    const minLevel = config.minLevel ?? (env === 'production' ? 'info' : 'debug');
    const minLevelOrder = LOG_LEVEL_ORDER[minLevel];
    const redactFields = config.redactFields ?? DEFAULT_REDACT_FIELDS;

    // Correlation ID store (per-request, set via middleware)
    let currentCorrelationId: string | undefined;

    return {
        setCorrelationId(id: string | undefined): void {
            currentCorrelationId = id;
        },

        debug(message: string, metadata?: Record<string, unknown>): void {
            if (minLevelOrder > LOG_LEVEL_ORDER.debug) return;
            // Debug goes to info channel since baseLog doesn't have debug
            this._emit('info', message, metadata);
        },

        info(message: string, metadata?: Record<string, unknown>): void {
            this._emit('info', message, metadata);
        },

        warn(message: string, metadata?: Record<string, unknown>): void {
            this._emit('warn', message, metadata);
        },

        error(message: string, metadata?: Record<string, unknown>): void {
            this._emit('error', message, metadata);
        },

        _emit(level: LogLevel, message: string, metadata?: Record<string, unknown>): void {
            if (LOG_LEVEL_ORDER[level] < minLevelOrder) return;

            const enriched: Record<string, unknown> = {
                service: config.service,
                ...(currentCorrelationId ? { correlationId: currentCorrelationId } : {}),
                ...(metadata ? redactMetadata(metadata, redactFields) : {})
            };

            baseLog(level, message, enriched);
        }
    };
}
