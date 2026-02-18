export type { SmsParams, SmsProvider, SmsResult } from './types.js';
export { AfricasTalkingSmsProvider } from './africastalking.js';
export { MockSmsProvider } from './mock.js';

import type { SmsProvider } from './types.js';
import { AfricasTalkingSmsProvider } from './africastalking.js';
import { MockSmsProvider } from './mock.js';

export interface SmsProviderConfig {
    provider: 'africastalking' | 'mock';
    atApiKey?: string;
    atUsername?: string;
    atSenderId?: string;
}

export function createSmsProvider(config: SmsProviderConfig): SmsProvider {
    switch (config.provider) {
        case 'africastalking':
            if (!config.atApiKey || !config.atUsername) {
                throw new Error('AT_API_KEY and AT_USERNAME are required when SMS_PROVIDER=africastalking');
            }
            return new AfricasTalkingSmsProvider({
                apiKey: config.atApiKey,
                username: config.atUsername,
                ...(config.atSenderId ? { senderId: config.atSenderId } : {})
            });
        case 'mock':
            return new MockSmsProvider();
        default:
            throw new Error(`Unknown SMS provider: ${config.provider as string}`);
    }
}
