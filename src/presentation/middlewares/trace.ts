import type { NextFunction, Request, RequestHandler, Response } from "express";
import {
  runWithTrace,
  startTrace,
  TRACE_ID_HEADER,
  type TraceContext,
} from "../../shared/trace_context.js";

export function traceRequests(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const context = startTrace(req.header("traceparent"));
    res.locals.trace = context;
    res.setHeader(TRACE_ID_HEADER, context.traceId);
    runWithTrace(context, next);
  };
}

export function traceIdOf(res: Response): string | null {
  return (res.locals.trace as TraceContext | undefined)?.traceId ?? null;
}
