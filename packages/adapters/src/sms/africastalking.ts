import type { SmsParams, SmsProvider, SmsResult } from './types.js';

/**
 * Africa's Talking SMS provider.
 * Uses the REST API directly for minimal dependencies.
 * @see https://developers.africastalking.com/docs/sms/sending/bulk
 */
export class AfricasTalkingSmsProvider implements SmsProvider {
    private readonly apiKey: string;
    private readonly username: string;
    private readonly senderId: string | undefined;
    private readonly apiUrl: string;

    constructor(options: { apiKey: string; username: string; senderId?: string }) {
        this.apiKey = options.apiKey;
        this.username = options.username;
        this.senderId = options.senderId;
        // Sandbox vs production URL
        this.apiUrl = options.username === 'sandbox'
            ? 'https://api.sandbox.africastalking.com/version1/messaging'
            : 'https://api.africastalking.com/version1/messaging';
    }

    async sendSms(params: SmsParams): Promise<SmsResult> {
        const body = new URLSearchParams({
            username: this.username,
            to: params.to,
            message: params.message,
            ...(this.senderId ? { from: this.senderId } : {})
        });

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'apiKey': this.apiKey,
                'Content-Type': 'application/x-www-form-urlencoded',
                'Accept': 'application/json'
            },
            body: body.toString()
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Africa's Talking API error (${response.status}): ${error}`);
        }

        const data = (await response.json()) as {
            SMSMessageData: {
                Message: string;
                Recipients: Array<{
                    statusCode: number;
                    number: string;
                    cost: string;
                    messageId: string;
                    status: string;
                }>;
            };
        };

        const recipient = data.SMSMessageData.Recipients[0];
        if (!recipient || recipient.statusCode !== 101) {
            throw new Error(
                `SMS delivery failed: ${recipient?.status ?? 'No recipient in response'}`
            );
        }

        return {
            messageId: recipient.messageId,
            accepted: true
        };
    }
}
