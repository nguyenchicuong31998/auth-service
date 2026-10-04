import type { NotificationSender } from "../../domain/ports/notification_sender.js";
import type { ServiceTokenProvider } from "../security/service_token_provider.js";

const TIMEOUT_MS = 10_000;

export class NotificationClient implements NotificationSender {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceTokens: ServiceTokenProvider,
  ) {}

  async sendEmail(
    templateKey: string,
    to: string,
    variables: Record<string, string>,
  ): Promise<void> {
    const token = await this.serviceTokens.getToken();
    const res = await fetch(new URL("/api/emails", this.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ templateKey, to, variables }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`notification-service responded HTTP ${res.status}`);
    }
  }
}
