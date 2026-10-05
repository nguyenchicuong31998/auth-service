import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";

export interface TraceContext {
  traceId: string;
  spanId: string;
  parentSpanId: string | null;
  sampled: boolean;
}

export const TRACE_ID_HEADER = "X-Trace-Id";

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;
const INVALID_TRACE_ID = "0".repeat(32);
const INVALID_SPAN_ID = "0".repeat(16);

const storage = new AsyncLocalStorage<TraceContext>();

const newId = (bytes: number) => randomBytes(bytes).toString("hex");

export function parseTraceparent(
  header: string | undefined | null,
): Omit<TraceContext, "spanId"> | null {
  const match = header?.trim().toLowerCase().match(TRACEPARENT);
  if (!match) return null;
  const [, traceId, parentSpanId, flags] = match;
  if (traceId === INVALID_TRACE_ID || parentSpanId === INVALID_SPAN_ID) {
    return null;
  }
  return {
    traceId,
    parentSpanId,
    sampled: (Number.parseInt(flags, 16) & 1) === 1,
  };
}

export function startTrace(traceparent?: string | null): TraceContext {
  const parent = parseTraceparent(traceparent);
  return {
    traceId: parent?.traceId ?? newId(16),
    spanId: newId(8),
    parentSpanId: parent?.parentSpanId ?? null,
    sampled: parent?.sampled ?? true,
  };
}

export function formatTraceparent(context: TraceContext): string {
  return `00-${context.traceId}-${context.spanId}-${context.sampled ? "01" : "00"}`;
}

export function currentTrace(): TraceContext | null {
  return storage.getStore() ?? null;
}

export function currentTraceId(): string | null {
  return storage.getStore()?.traceId ?? null;
}

export function runWithTrace<T>(context: TraceContext, run: () => T): T {
  return storage.run(context, run);
}

export function withNewTrace<T>(run: () => T): T {
  return storage.run(startTrace(), run);
}

let propagating = false;

export function propagateTraceOnFetch(): void {
  if (propagating) return;
  propagating = true;
  const send = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const context = storage.getStore();
    if (!context) return send(input, init);
    const headers = new Headers(
      init?.headers ?? (input instanceof Request ? input.headers : undefined),
    );
    if (!headers.has("traceparent")) {
      headers.set(
        "traceparent",
        formatTraceparent({ ...context, spanId: newId(8) }),
      );
    }
    return send(input, { ...init, headers });
  };
}
