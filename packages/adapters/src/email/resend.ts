import type { EmailParams, EmailProvider, EmailResult } from './types.js';

/**
 * Resend email provider.
 * Uses the Resend REST API directly (no SDK dependency) for simplicity.
 * @see https://resend.com/docs/api-reference/emails/send-email
 */
export class ResendEmailProvider implements EmailProvider {
    private readonly apiKey: string;
    private readonly defaultFrom: string;
    private readonly apiUrl = 'https://api.resend.com/emails';

    constructor(options: { apiKey: string; defaultFrom: string }) {
        this.apiKey = options.apiKey;
        this.defaultFrom = options.defaultFrom;
    }

    async sendEmail(params: EmailParams): Promise<EmailResult> {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                from: params.from ?? this.defaultFrom,
                to: [params.to],
                subject: params.subject,
                html: params.html,
                ...(params.text ? { text: params.text } : {})
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Resend API error (${response.status}): ${error}`);
        }

        const data = (await response.json()) as { id: string };
        return {
            messageId: data.id,
            accepted: true
        };
    }
}
