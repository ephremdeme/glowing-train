export type { EmailParams, EmailProvider, EmailResult } from './types.js';
export { ResendEmailProvider } from './resend.js';
export { MockEmailProvider } from './mock.js';

import type { EmailProvider } from './types.js';
import { ResendEmailProvider } from './resend.js';
import { MockEmailProvider } from './mock.js';

export interface EmailProviderConfig {
    provider: 'resend' | 'mock';
    resendApiKey?: string;
    defaultFrom?: string;
}

export function createEmailProvider(config: EmailProviderConfig): EmailProvider {
    switch (config.provider) {
        case 'resend':
            if (!config.resendApiKey) {
                throw new Error('RESEND_API_KEY is required when EMAIL_PROVIDER=resend');
            }
            return new ResendEmailProvider({
                apiKey: config.resendApiKey,
                defaultFrom: config.defaultFrom ?? 'noreply@cryptopay.com'
            });
        case 'mock':
            return new MockEmailProvider();
        default:
            throw new Error(`Unknown email provider: ${config.provider as string}`);
    }
}
