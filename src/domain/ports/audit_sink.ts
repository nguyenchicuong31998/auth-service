import type { Uuid } from "../entities/base_entity.js";

export interface AuditEvent {
  userId: Uuid | null;
  action: string;
  resource: string;
  resourceId: string | null;
  oldValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface AuditSink {
  record(event: AuditEvent): void;
}
