import { log } from '@cryptopay/observability';
import type { EmailParams, EmailProvider, EmailResult } from './types.js';

/**
 * Mock email provider that logs emails to console and stores them in memory.
 * Used for local development and testing.
 */
export class MockEmailProvider implements EmailProvider {
    private readonly sentEmails: EmailParams[] = [];
    private messageCounter = 0;

    async sendEmail(params: EmailParams): Promise<EmailResult> {
        this.sentEmails.push(params);
        this.messageCounter++;
        const messageId = `mock_email_${this.messageCounter}`;

        log('info', '[MockEmail] Email sent', {
            messageId,
            to: params.to,
            subject: params.subject
        });

        return {
            messageId,
            accepted: true
        };
    }

    /** Get all sent emails (for test assertions). */
    getSentEmails(): ReadonlyArray<EmailParams> {
        return this.sentEmails;
    }

    /** Get the last sent email. */
    getLastEmail(): EmailParams | undefined {
        return this.sentEmails[this.sentEmails.length - 1];
    }

    /** Clear sent email history. */
    clear(): void {
        this.sentEmails.length = 0;
    }
}
