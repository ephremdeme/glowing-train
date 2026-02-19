/**
 * Transfer Status Notification Service
 *
 * Sends email/SMS notifications to customers when their transfers
 * reach key milestones: funding confirmed, payout completed,
 * payout failed, or transfer expired.
 */

import type { EmailProvider, SmsProvider } from '@cryptopay/adapters';
import { log } from '@cryptopay/observability';

export type NotificationEvent =
    | 'FUNDING_CONFIRMED'
    | 'PAYOUT_COMPLETED'
    | 'PAYOUT_FAILED'
    | 'EXPIRED';

export interface NotificationContext {
    transferId: string;
    senderName: string;
    receiverName: string;
    sendAmountUsd: number;
    receiveAmountEtb: number;
    /** Sender email (if available). */
    senderEmail?: string;
    /** Sender phone in E.164 (if available). */
    senderPhone?: string;
}

export interface NotificationResult {
    emailSent: boolean;
    smsSent: boolean;
}

const EMAIL_TEMPLATES: Record<NotificationEvent, { subject: string; body: (ctx: NotificationContext) => string }> = {
    FUNDING_CONFIRMED: {
        subject: 'Your transfer has been funded',
        body: (ctx) =>
            `Hi ${ctx.senderName},\n\nYour transfer of $${ctx.sendAmountUsd.toFixed(2)} USD to ${ctx.receiverName} has been funded and is being processed.\n\nTransfer ID: ${ctx.transferId}\n\nWe'll notify you when the payout is complete.\n\n— CryptoPay`
    },
    PAYOUT_COMPLETED: {
        subject: 'Your transfer is complete!',
        body: (ctx) =>
            `Hi ${ctx.senderName},\n\nGreat news! Your transfer to ${ctx.receiverName} has been completed.\n\nAmount sent: $${ctx.sendAmountUsd.toFixed(2)} USD\nAmount received: ${ctx.receiveAmountEtb.toFixed(2)} ETB\nTransfer ID: ${ctx.transferId}\n\nThank you for using CryptoPay!\n\n— CryptoPay`
    },
    PAYOUT_FAILED: {
        subject: 'Transfer payout issue',
        body: (ctx) =>
            `Hi ${ctx.senderName},\n\nWe encountered an issue processing the payout for your transfer to ${ctx.receiverName}.\n\nTransfer ID: ${ctx.transferId}\nAmount: $${ctx.sendAmountUsd.toFixed(2)} USD\n\nOur team is reviewing this and will resolve it promptly. You'll receive an update soon.\n\n— CryptoPay`
    },
    EXPIRED: {
        subject: 'Transfer expired',
        body: (ctx) =>
            `Hi ${ctx.senderName},\n\nYour transfer of $${ctx.sendAmountUsd.toFixed(2)} USD to ${ctx.receiverName} has expired because we didn't receive funding in time.\n\nTransfer ID: ${ctx.transferId}\n\nPlease create a new transfer if you'd still like to send money.\n\n— CryptoPay`
    }
};

const SMS_TEMPLATES: Record<NotificationEvent, (ctx: NotificationContext) => string> = {
    FUNDING_CONFIRMED: (ctx) =>
        `CryptoPay: Your $${ctx.sendAmountUsd.toFixed(2)} transfer to ${ctx.receiverName} is funded and processing. ID: ${ctx.transferId.slice(0, 8)}`,
    PAYOUT_COMPLETED: (ctx) =>
        `CryptoPay: Transfer complete! ${ctx.receiverName} received ${ctx.receiveAmountEtb.toFixed(2)} ETB. ID: ${ctx.transferId.slice(0, 8)}`,
    PAYOUT_FAILED: (ctx) =>
        `CryptoPay: Issue with payout to ${ctx.receiverName}. Our team is on it. ID: ${ctx.transferId.slice(0, 8)}`,
    EXPIRED: (ctx) =>
        `CryptoPay: Your $${ctx.sendAmountUsd.toFixed(2)} transfer to ${ctx.receiverName} expired. Create a new one to resend. ID: ${ctx.transferId.slice(0, 8)}`
};

export class TransferNotificationService {
    constructor(
        private readonly emailProvider: EmailProvider,
        private readonly smsProvider: SmsProvider,
        private readonly fromEmail: string = process.env.NOTIFICATION_FROM_EMAIL ?? 'noreply@cryptopay.com'
    ) { }

    async notify(event: NotificationEvent, context: NotificationContext): Promise<NotificationResult> {
        const result: NotificationResult = { emailSent: false, smsSent: false };

        // Send email if available
        if (context.senderEmail) {
            try {
                const template = EMAIL_TEMPLATES[event];
                const textBody = template.body(context);
                await this.emailProvider.sendEmail({
                    to: context.senderEmail,
                    from: this.fromEmail,
                    subject: template.subject,
                    html: textBody.replaceAll('\n', '<br/>'),
                    text: textBody
                });
                result.emailSent = true;
            } catch (error) {
                log('error', 'Failed to send notification email', {
                    event,
                    transferId: context.transferId,
                    error: (error as Error).message
                });
            }
        }

        // Send SMS if available
        if (context.senderPhone) {
            try {
                const message = SMS_TEMPLATES[event](context);
                await this.smsProvider.sendSms({
                    to: context.senderPhone,
                    message
                });
                result.smsSent = true;
            } catch (error) {
                log('error', 'Failed to send notification SMS', {
                    event,
                    transferId: context.transferId,
                    error: (error as Error).message
                });
            }
        }

        if (result.emailSent || result.smsSent) {
            log('info', 'Transfer notification sent', {
                event,
                transferId: context.transferId,
                emailSent: result.emailSent,
                smsSent: result.smsSent
            });
        }

        return result;
    }
}
