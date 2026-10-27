import { test } from "node:test";
import assert from "node:assert/strict";
import { api } from "../src/components/client-api.ts";

test("a non-JSON success is an API error rather than broken booking data", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("upstream unavailable", { status: 200 }));
  const result = await api("/availability");
  assert.equal(result.ok, false);
  assert.match(result.error, /try again/i);
});

test("a stalled availability request ends with a retryable error", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal;
  t.mock.method(globalThis, "fetch", (_url, init) => {
    signal = init.signal;
    return new Promise((_resolve, reject) => signal?.addEventListener("abort", () => reject(signal.reason)));
  });
  const request = api("/availability");
  assert.ok(signal instanceof AbortSignal, "requests must have a deadline");
  t.mock.timers.tick(30_001);
  const result = await request;
  assert.equal(result.ok, false);
  assert.match(result.error, /try again/i);
});
