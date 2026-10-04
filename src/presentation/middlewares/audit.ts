import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { Uuid } from "../../domain/entities/base_entity.js";
import type { AuditSink } from "../../domain/ports/audit_sink.js";

const SENSITIVE_KEY = /password|secret|token|hash/i;
const REDACTED = "[REDACTED]";

export interface AuditOptions {
  before?: (req: Request) => Promise<unknown>;
  resourceId?: (req: Request, body: unknown) => string | null;
  captureResponse?: boolean;
}

export type Audit = (
  resource: string,
  options?: AuditOptions,
) => RequestHandler;

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SENSITIVE_KEY.test(key) ? REDACTED : redact(item),
      ]),
    );
  }
  return value;
}

export function toSnapshot(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined || typeof value !== "object") {
    return null;
  }
  const plain = redact(JSON.parse(JSON.stringify(value)));
  return Array.isArray(plain)
    ? { items: plain }
    : (plain as Record<string, unknown>);
}

function defaultResourceId(req: Request, body: unknown): string | null {
  const params = Object.values(req.params ?? {}).filter(Boolean);
  if (params.length > 0) return params.join(":");
  const id = (body as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? id : null;
}

export function createAudit(
  sink: AuditSink,
  actorOf: (res: Response) => Uuid | null,
): Audit {
  return (resource, options = {}) =>
    async (req: Request, res: Response, next: NextFunction) => {
      const before = options.before
        ? await options.before(req).catch(() => null)
        : null;

      let body: unknown;
      const json = res.json.bind(res);
      res.json = (payload: unknown) => {
        body = payload;
        return json(payload);
      };

      res.on("finish", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return;
        const capture =
          options.captureResponse !== false && req.method !== "DELETE";
        sink.record({
          userId: actorOf(res),
          action: req.method,
          resource,
          resourceId: (options.resourceId ?? defaultResourceId)(req, body),
          oldValue: toSnapshot(before),
          newValue: capture ? toSnapshot(body) : null,
          ipAddress: req.ip?.slice(0, 50) ?? null,
          userAgent: req.header("user-agent")?.slice(0, 500) ?? null,
        });
      });
      next();
    };
}
