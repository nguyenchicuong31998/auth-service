import assert from "node:assert/strict";
import { createServer, type IncomingHttpHeaders, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import express from "express";
import { traceRequests } from "../src/presentation/middlewares/trace.js";
import {
  currentTraceId,
  formatTraceparent,
  parseTraceparent,
  propagateTraceOnFetch,
  startTrace,
  withNewTrace,
} from "../src/shared/trace_context.js";

const TRACE_ID = "4bf92f3577b34da6a3ce929d0e0e4736";
const INCOMING = `00-${TRACE_ID}-00f067aa0ba902b7-01`;

let upstream: Server;
let app: Server;
let upstreamUrl = "";
let appUrl = "";
const received: IncomingHttpHeaders[] = [];

const listen = async (server: Server) => {
  server.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

before(async () => {
  propagateTraceOnFetch();
  upstream = createServer((req, res) => {
    received.push(req.headers);
    res.end("{}");
  });
  upstreamUrl = await listen(upstream);
  const api = express();
  api.use(traceRequests());
  api.get("/call", async (_req, res) => {
    await new Promise((resolve) => setTimeout(resolve, 5));
    await fetch(upstreamUrl);
    res.json({ traceId: currentTraceId() });
  });
  app = createServer(api);
  appUrl = await listen(app);
});

after(() => {
  upstream?.close();
  app?.close();
});

describe("trace context", () => {
  it("parses only valid W3C traceparent headers", () => {
    assert.deepEqual(parseTraceparent(INCOMING), {
      traceId: TRACE_ID,
      parentSpanId: "00f067aa0ba902b7",
      sampled: true,
    });
    for (const bad of [
      undefined,
      "",
      "garbage",
      `01-${TRACE_ID}-00f067aa0ba902b7-01`,
      `00-${"0".repeat(32)}-00f067aa0ba902b7-01`,
      `00-${TRACE_ID}-${"0".repeat(16)}-01`,
      `00-${TRACE_ID}-00f067aa0ba902b7-01; drop table`,
    ]) {
      assert.equal(parseTraceparent(bad), null, String(bad));
    }
  });

  it("starts a new trace or continues the caller's one", () => {
    const fresh = startTrace();
    assert.match(fresh.traceId, /^[0-9a-f]{32}$/);
    assert.match(fresh.spanId, /^[0-9a-f]{16}$/);
    assert.equal(fresh.parentSpanId, null);
    const child = startTrace(INCOMING);
    assert.equal(child.traceId, TRACE_ID);
    assert.equal(child.parentSpanId, "00f067aa0ba902b7");
    assert.notEqual(child.spanId, "00f067aa0ba902b7");
    assert.match(formatTraceparent(child), /^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
  });

  it("returns the trace id and forwards it to other services", async () => {
    received.length = 0;
    const res = await fetch(`${appUrl}/call`, {
      headers: { traceparent: INCOMING },
    });
    const body = (await res.json()) as { traceId: string };
    assert.equal(res.headers.get("x-trace-id"), TRACE_ID);
    assert.equal(body.traceId, TRACE_ID);
    const forwarded = parseTraceparent(received[0].traceparent as string);
    assert.equal(forwarded?.traceId, TRACE_ID);
    assert.notEqual(forwarded?.parentSpanId, "00f067aa0ba902b7");
  });

  it("gives every request without a traceparent its own trace", async () => {
    const [a, b] = await Promise.all([
      fetch(`${appUrl}/call`),
      fetch(`${appUrl}/call`, { headers: { traceparent: "bogus" } }),
    ]);
    const idA = a.headers.get("x-trace-id");
    const idB = b.headers.get("x-trace-id");
    assert.match(idA ?? "", /^[0-9a-f]{32}$/);
    assert.match(idB ?? "", /^[0-9a-f]{32}$/);
    assert.notEqual(idA, idB);
  });

  it("traces background jobs and leaves untraced calls alone", async () => {
    received.length = 0;
    await fetch(upstreamUrl);
    assert.equal(received[0].traceparent, undefined);
    const jobTrace = await withNewTrace(async () => {
      await fetch(upstreamUrl, { headers: { "x-test": "1" } });
      return currentTraceId();
    });
    assert.equal(
      parseTraceparent(received[1].traceparent as string)?.traceId,
      jobTrace,
    );
    assert.equal(received[1]["x-test"], "1");
  });
});
