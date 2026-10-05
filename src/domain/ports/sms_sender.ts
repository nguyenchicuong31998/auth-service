export interface SmsSender {
  sendSms(to: string, message: string): Promise<void>;
}
