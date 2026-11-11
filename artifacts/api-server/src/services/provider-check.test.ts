import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

test("POST /api/config/check tests live access with synthetic input and safe results", { concurrency: false }, async t => {
  const originalEnv = process.env;
  const originalFetch = globalThis.fetch;
  const base = "https://provider.example/v1";
  let calls = 0;
  let mode: "success" | "rejected" = "success";
  let sentBody: Record<string, any> | undefined;
  process.env = {
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    OPENAI_BASE_URL: base,
    OPENAI_MODEL: "private-fixture-model",
    OPENAI_API_KEY: "private-fixture-key",
  };
  globalThis.fetch = async (_input, init) => {
    calls++;
    sentBody = JSON.parse(String(init?.body));
    return mode === "success"
      ? Response.json({ choices: [{ message: { content: JSON.stringify({ suggested: "<button aria-label=\"Search\"></button>", explanation: "Synthetic check.", correction: "Adds a name." }) }, finish_reason: "stop" }] })
      : Response.json({ error: { message: "private-fixture-provider-response" } }, { status: 401 });
  };

  const server = http.createServer();
  t.after(async () => {
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      globalThis.fetch = originalFetch;
      process.env = originalEnv;
    }
  });

  const { default: router } = await import("../routes/copilot");
  const app = express();
  app.use("/api", router);
  server.on("request", app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  async function check() {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const request = http.request({
        hostname: "127.0.0.1",
        port,
        path: "/api/config/check",
        method: "POST",
        agent: false,
      }, response => {
        let text = "";
        response.setEncoding("utf8");
        response.on("data", chunk => { text += chunk; });
        response.on("end", () => resolve({ status: response.statusCode!, body: JSON.parse(text) }));
        response.on("error", reject);
      });
      request.on("error", reject);
      request.end();
    });
  }

  const success = await check();
  assert.equal(success.status, 200);
  assert.deepEqual(success.body, {
    status: "available",
    provider: "openai-compatible",
    message: "Live OpenAI-compatible provider access verified.",
  });
  assert.equal(calls, 1);
  assert.ok(sentBody!.messages[1].content.includes("<button></button>"));
  assert.doesNotMatch(JSON.stringify(success.body), /private-fixture/);

  process.env = { NODE_ENV: "production", LOG_LEVEL: "silent", OPENAI_BASE_URL: base };
  const incomplete = await check();
  assert.equal(incomplete.body.status, "unavailable");
  assert.equal(incomplete.body.provider, "configuration-error");
  assert.match(incomplete.body.message, /configuration is incomplete/);
  assert.equal(calls, 1, "incomplete settings must not contact the provider");

  process.env = {
    NODE_ENV: "production",
    LOG_LEVEL: "silent",
    OPENAI_BASE_URL: base,
    OPENAI_MODEL: "private-fixture-model",
    OPENAI_API_KEY: "private-fixture-key",
  };
  mode = "rejected";
  const rejected = await check();
  assert.equal(rejected.body.status, "unavailable");
  assert.match(rejected.body.message, /rejected the API key/);
  assert.doesNotMatch(JSON.stringify(rejected.body), /private-fixture/);
  assert.equal(calls, 2, "a rejected credential is tested once, without a retry");
});
