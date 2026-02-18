/**
 * API Versioning Middleware
 *
 * Supports URL-based versioning (/v1/..., /v2/...) with
 * sunset/deprecation headers for old versions.
 *
 * Strategy:
 * - v1 routes are currently active and the default
 * - When v2 is introduced, v1 gets Sunset/Deprecation headers
 * - Unversioned /admin/* routes are for internal ops only
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { log } from '@cryptopay/observability';

export interface ApiVersion {
    version: string;
    /** RFC 7231 date when this version becomes sunset (deprecated). */
    sunsetDate?: string;
    /** Whether this version is deprecated. */
    deprecated: boolean;
}

export const API_VERSIONS: Record<string, ApiVersion> = {
    v1: { version: 'v1', deprecated: false }
    // v2: { version: 'v2', deprecated: false }
    // When v2 is added, update v1:
    // v1: { version: 'v1', deprecated: true, sunsetDate: '2027-01-01' }
};

export function registerVersionHeaders(app: FastifyInstance): void {
    app.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply) => {
        const path = request.url;

        // Extract version from URL
        const versionMatch = path.match(/^\/(v\d+)\//);
        if (!versionMatch) return;

        const versionKey = versionMatch[1];
        if (!versionKey) return;

        const versionInfo = API_VERSIONS[versionKey];
        if (!versionInfo) return;

        // Add API-Version header
        reply.header('api-version', versionInfo.version);

        // Add deprecation/sunset headers for deprecated versions
        if (versionInfo.deprecated) {
            reply.header('deprecation', 'true');
            if (versionInfo.sunsetDate) {
                reply.header('sunset', versionInfo.sunsetDate);
            }
            reply.header('link', '</v2/>; rel="successor-version"');

            log('info', 'Deprecated API version accessed', {
                version: versionInfo.version,
                path,
                method: request.method
            });
        }
    });
}

/**
 * Helper to check if a given version is currently supported.
 * Useful for conditionally registering routes.
 */
export function isVersionSupported(version: string): boolean {
    const info = API_VERSIONS[version];
    return info !== undefined;
}
