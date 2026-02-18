export interface EmailParams {
    to: string;
    subject: string;
    html: string;
    text?: string;
    from?: string;
}

export interface EmailResult {
    messageId: string;
    accepted: boolean;
}

export interface EmailProvider {
    sendEmail(params: EmailParams): Promise<EmailResult>;
}
