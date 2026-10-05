import type { SmsSender } from "../../domain/ports/sms_sender.js";

/**
 * Prints SMS to the console instead of sending them. Swap for a real
 * provider (Twilio, eSMS, SpeedSMS...) by implementing SmsSender.
 */
export class ConsoleSmsSender implements SmsSender {
  async sendSms(to: string, message: string): Promise<void> {
    console.log(`[SMS -> ${to}] ${message}`);
  }
}
