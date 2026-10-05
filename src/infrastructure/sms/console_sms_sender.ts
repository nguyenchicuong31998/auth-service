import type { SmsSender } from "../../domain/ports/sms_sender.js";

export class ConsoleSmsSender implements SmsSender {
  async sendSms(to: string, message: string): Promise<void> {
    console.log(`[SMS -> ${to}] ${message}`);
  }
}
