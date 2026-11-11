import { test } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";

const base = "https://private-fixture-provider.example/custom/v1";
const model = "private-fixture-openai-model";
const openaiKey = "private-fixture-openai-key";
const geminiKey = "private-fixture-gemini-key";

const incomplete = "OpenAI-compatible configuration is incomplete. Set both OPENAI_BASE_URL and OPENAI_MODEL; OPENAI_API_KEY is optional. No provider fallback was made.";
const invalidUrl = "OPENAI_BASE_URL must be an HTTP(S) API base URL without credentials, a query or a fragment.";
const invalidHeader = "OPENAI_API_KEY contains invalid header characters. Check server configuration.";
const invalidModel = "GEMINI_MODEL is invalid. Ask the app owner to check configuration.";

interface ConfigurationCase {
  name: string;
  env: NodeJS.ProcessEnv;
  message: string;
}

const openaiCases: ConfigurationCase[] = [];
const keys = ["OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_API_KEY"] as const;
const values = [base, model, openaiKey];
for (let mask = 1; mask < 8; mask++) {
  if ((mask & 3) === 3) continue; // Base URL + model is complete; auth is optional.
  const env: NodeJS.ProcessEnv = {};
  keys.forEach((key, index) => {
    if (mask & (1 << index)) env[key] = values[index];
  });
  openaiCases.push({ name: `partial OpenAI settings ${mask}`, env, message: incomplete });
}
for (const [name, env] of [
  ["empty base URL", { OPENAI_BASE_URL: "", OPENAI_MODEL: model }],
  ["whitespace base URL", { OPENAI_BASE_URL: "  ", OPENAI_MODEL: model }],
  ["empty model", { OPENAI_BASE_URL: base, OPENAI_MODEL: "" }],
  ["whitespace model", { OPENAI_BASE_URL: base, OPENAI_MODEL: "  " }],
  ["empty key alone", { OPENAI_API_KEY: "" }],
] as const) openaiCases.push({ name, env, message: incomplete });

for (const url of [
  "private-fixture-not-a-url",
  "file:///private-fixture-path",
  "ftp://private-fixture-provider.example/v1",
  "https://private-fixture-user:private-fixture-password@provider.example/v1",
  `${base}?key=private-fixture-query-key`,
  `${base}#private-fixture-fragment`,
]) openaiCases.push({
  name: `invalid base URL ${openaiCases.length}`,
  env: { OPENAI_BASE_URL: url, OPENAI_MODEL: model, OPENAI_API_KEY: openaiKey },
  message: invalidUrl,
});

for (const [name, separator] of [["CR", "\r"], ["LF", "\n"], ["CRLF", "\r\n"]]) {
  openaiCases.push({
    name: `OpenAI key with ${name}`,
    env: { OPENAI_BASE_URL: base, OPENAI_MODEL: model, OPENAI_API_KEY: `${openaiKey}${separator}private-fixture-header` },
    message: invalidHeader,
  });
}

test("GET /api/config exposes safe configuration errors, never provider values", { concurrency: false }, async t => {
  // Keep only the environment object reference for restoration: never inspect or
  // copy real credential values. Import the router only after isolation so its
  // dependencies cannot initialize with real provider, auth or database secrets.
  const originalEnv = process.env;
  process.env = { NODE_ENV: "production", LOG_LEVEL: "silent" };
  const server = http.createServer();
  t.after(async () => {
    try {
      if (server.listening) {
        await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      }
    } finally {
      process.env = originalEnv;
    }
  });

  // The config route must not contact any provider. Use node:http for the
  // in-process test server so this guard catches all provider fetch attempts.
  const providerFetch = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("Provider requests are forbidden in configuration tests");
  });
  const { default: router } = await import("../routes/copilot");
  const app = express();
  app.use("/api", router);
  server.on("request", app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;

  async function getConfig(env: NodeJS.ProcessEnv) {
    process.env = { NODE_ENV: "production", LOG_LEVEL: "silent", ...env };
    const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
      const request = http.get({ hostname: "127.0.0.1", port, path: "/api/config", agent: false }, res => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", chunk => { text += chunk; });
        res.on("end", () => {
          assert.match(String(res.headers["content-type"]), /application\/json/);
          resolve({ status: res.statusCode!, text });
        });
        res.on("error", reject);
      });
      request.on("error", reject);
    });
    assert.equal(response.status, 200);
    // Check the entire serialized response, not only the error message. The
    // marker also catches leaked URL components or partially redacted keys.
    assert.doesNotMatch(response.text, /private-fixture/i);
    for (const value of Object.values(env)) {
      if (value?.trim()) {
        assert.equal(response.text.includes(JSON.stringify(value).slice(1, -1)), false, "Configured value leaked");
      }
    }
    assert.equal(providerFetch.mock.callCount(), 0);
    return JSON.parse(response.text);
  }

  async function expectError(fixture: ConfigurationCase, env = fixture.env) {
    const body = await getConfig(env);
    assert.deepEqual(Object.keys(body).sort(), ["gemini", "history", "provider", "providerError", "retention"]);
    assert.equal(body.provider, "configuration-error");
    // Exact public message ensures only known-safe setting names/instructions,
    // never raw exceptions, stack traces or configured values, are exposed.
    assert.equal(body.providerError, fixture.message);
    assert.equal(body.gemini, Boolean(env.GEMINI_API_KEY));
    assert.equal(body.history, false);
    assert.equal(typeof body.retention, "string");
  }

  for (const fixture of openaiCases) {
    for (const gemini of [false, true]) {
      await t.test(`${fixture.name}${gemini ? " with Gemini configured" : ""}`, async () => {
        await expectError(fixture, { ...fixture.env, ...(gemini ? { GEMINI_API_KEY: geminiKey } : {}) });
      });
    }
  }

  for (const invalid of ["../private-fixture-model", "private-fixture/model", "private-fixture model", "private-fixture?key=value", "private-fixture\nmodel"]) {
    await t.test(`invalid Gemini model ${JSON.stringify(invalid)}`, async () => {
      await expectError({
        name: "invalid Gemini model",
        env: { GEMINI_API_KEY: geminiKey, GEMINI_MODEL: invalid },
        message: invalidModel,
      });
    });
  }

  // Positive controls prevent a route that always returns configuration-error
  // from satisfying the redaction and precedence assertions above.
  for (const [provider, env] of [
    ["deterministic", {}],
    ["gemini", { GEMINI_API_KEY: geminiKey }],
    ["openai-compatible", { OPENAI_BASE_URL: base, OPENAI_MODEL: model }],
    ["openai-compatible", { OPENAI_BASE_URL: base, OPENAI_MODEL: model, OPENAI_API_KEY: openaiKey, GEMINI_API_KEY: geminiKey }],
  ] as const) {
    await t.test(`valid ${provider} configuration with ${Object.keys(env).length} settings`, async () => {
      const body = await getConfig(env);
      assert.equal(body.provider, provider);
      assert.equal(body.gemini, Boolean((env as NodeJS.ProcessEnv).GEMINI_API_KEY));
      assert.equal(Object.hasOwn(body, "providerError"), false);
    });
  }
});
