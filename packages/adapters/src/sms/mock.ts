import { log } from '@cryptopay/observability';
import type { SmsParams, SmsProvider, SmsResult } from './types.js';

/**
 * Mock SMS provider that logs messages and stores them in memory.
 * Used for local development and testing.
 */
export class MockSmsProvider implements SmsProvider {
    private readonly sentMessages: SmsParams[] = [];
    private messageCounter = 0;

    async sendSms(params: SmsParams): Promise<SmsResult> {
        this.sentMessages.push(params);
        this.messageCounter++;
        const messageId = `mock_sms_${this.messageCounter}`;

        log('info', '[MockSms] SMS sent', {
            messageId,
            to: params.to,
            messageLength: params.message.length
        });

        return {
            messageId,
            accepted: true
        };
    }

    /** Get all sent messages (for test assertions). */
    getSentMessages(): ReadonlyArray<SmsParams> {
        return this.sentMessages;
    }

    /** Get the last sent message. */
    getLastMessage(): SmsParams | undefined {
        return this.sentMessages[this.sentMessages.length - 1];
    }

    /** Clear sent message history. */
    clear(): void {
        this.sentMessages.length = 0;
    }
}
