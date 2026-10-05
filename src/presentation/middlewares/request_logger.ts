import type { NextFunction, Request, RequestHandler, Response } from "express";

type Actor =
  { kind: "user"; userId: string } | { kind: "service"; service: string };

function actorOf(res: Response): string {
  const principal = res.locals.principal as Actor | undefined;
  if (principal?.kind === "service") return `service:${principal.service}`;
  if (principal?.kind === "user") return `user:${principal.userId}`;
  const auth = res.locals.auth as { userId?: string } | undefined;
  return auth?.userId ? `user:${auth.userId}` : "-";
}

export function createRequestLogger(service: string): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    const path = req.originalUrl.split("?")[0];
    let errorMessage: string | null = null;

    const json = res.json.bind(res);
    res.json = (body?: unknown) => {
      if (res.statusCode >= 400 && body && typeof body === "object") {
        const { message, error } = body as {
          message?: unknown;
          error?: unknown;
        };
        const text = message ?? error;
        if (typeof text === "string") errorMessage = text;
      }
      return json(body);
    };

    res.on("finish", () => {
      const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
      const line = [
        new Date().toISOString(),
        `[${service}]`,
        req.method,
        path,
        res.statusCode,
        `${ms.toFixed(1)}ms`,
        `ip=${req.ip ?? "-"}`,
        actorOf(res),
      ].join(" ");
      const log = res.statusCode >= 500 ? console.error : console.log;
      log(errorMessage ? `${line} – ${errorMessage}` : line);
    });

    next();
  };
}
