export interface SmsParams {
    to: string;
    message: string;
}

export interface SmsResult {
    messageId: string;
    accepted: boolean;
}

export interface SmsProvider {
    sendSms(params: SmsParams): Promise<SmsResult>;
}
