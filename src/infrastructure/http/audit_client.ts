import type { AuditEvent, AuditSink } from "../../domain/ports/audit_sink.js";
interface TokenProvider {
  getToken(): Promise<string>;
}

const TIMEOUT_MS = 5000;
const RETRY_DELAYS_MS = [1000, 5000, 15_000];

export class AuditClient implements AuditSink {
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenProvider,
    private readonly retryDelaysMs: number[] = RETRY_DELAYS_MS,
  ) {}

  record(event: AuditEvent): void {
    void this.send(event, 0);
  }

  private async send(event: AuditEvent, attempt: number): Promise<void> {
    try {
      const res = await fetch(new URL("/api/audit-logs", this.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${await this.tokens.getToken()}`,
        },
        body: JSON.stringify(event),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return;
      if (res.status < 500) {
        console.error(
          `Audit event rejected (HTTP ${res.status}): ${event.action} ${event.resource}`,
        );
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (error) {
      const delay = this.retryDelaysMs[attempt];
      if (delay === undefined) {
        console.error(
          `Audit event dropped after ${attempt + 1} attempts: ${event.action} ${event.resource}`,
          (error as Error).message,
        );
        return;
      }
      setTimeout(() => void this.send(event, attempt + 1), delay).unref();
    }
  }
}

export class DisabledAuditSink implements AuditSink {
  record(): void {}
}
