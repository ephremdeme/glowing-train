import { describe, expect, it } from 'vitest';
import { MockSmsProvider } from '../src/sms/mock.js';

describe('MockSmsProvider', () => {
    it('stores and returns sent messages', async () => {
        const provider = new MockSmsProvider();

        const result = await provider.sendSms({
            to: '+251911123456',
            message: 'Your CryptoPay code is 123456. Valid for 5 minutes.'
        });

        expect(result.accepted).toBe(true);
        expect(result.messageId).toMatch(/^mock_sms_/);

        const messages = provider.getSentMessages();
        expect(messages).toHaveLength(1);
        expect(messages[0]?.to).toBe('+251911123456');
        expect(messages[0]?.message).toContain('123456');
    });

    it('returns last message', async () => {
        const provider = new MockSmsProvider();

        await provider.sendSms({ to: '+251911111111', message: 'Code: 111111' });
        await provider.sendSms({ to: '+251922222222', message: 'Code: 222222' });

        expect(provider.getLastMessage()?.to).toBe('+251922222222');
    });

    it('can clear stored messages', async () => {
        const provider = new MockSmsProvider();
        await provider.sendSms({ to: '+251911000000', message: 'Code: 000000' });
        expect(provider.getSentMessages()).toHaveLength(1);

        provider.clear();
        expect(provider.getSentMessages()).toHaveLength(0);
    });
});
