import { describe, expect, it } from 'vitest';
import { MockEmailProvider } from '../src/email/mock.js';

describe('MockEmailProvider', () => {
    it('stores and returns sent emails', async () => {
        const provider = new MockEmailProvider();

        const result = await provider.sendEmail({
            to: 'user@example.com',
            subject: 'Your Magic Link',
            html: '<a href="https://app.cryptopay.com/verify?token=abc123">Login</a>'
        });

        expect(result.accepted).toBe(true);
        expect(result.messageId).toMatch(/^mock_email_/);

        const emails = provider.getSentEmails();
        expect(emails).toHaveLength(1);
        expect(emails[0]?.to).toBe('user@example.com');
        expect(emails[0]?.subject).toBe('Your Magic Link');
    });

    it('returns last email', async () => {
        const provider = new MockEmailProvider();

        await provider.sendEmail({ to: 'a@example.com', subject: 'First', html: '<p>1</p>' });
        await provider.sendEmail({ to: 'b@example.com', subject: 'Second', html: '<p>2</p>' });

        expect(provider.getLastEmail()?.to).toBe('b@example.com');
    });

    it('can clear stored emails', async () => {
        const provider = new MockEmailProvider();
        await provider.sendEmail({ to: 'test@example.com', subject: 'Test', html: '<p>test</p>' });
        expect(provider.getSentEmails()).toHaveLength(1);

        provider.clear();
        expect(provider.getSentEmails()).toHaveLength(0);
    });
});
