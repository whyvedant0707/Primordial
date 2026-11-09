import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSuggestionText, requestSuggestion, resolveProvider } from "./llm";
import { PublicError } from "./network";
import { logger } from "../lib/logger";

const openaiEnv = { OPENAI_BASE_URL: "https://provider.example/v1", OPENAI_MODEL: "qwen3-coder-next" };
const context = { rule: "button-name", description: "Needs a name", wcag: ["wcag412"], html: "<button></button>", failure: "No name" };
const config = resolveProvider(openaiEnv);
if (config.provider === "deterministic") throw new Error("Invalid test fixture");

test("provider selection preserves Gemini and deterministic operation, with optional OpenAI authentication", () => {
  assert.deepEqual(resolveProvider({}), { provider: "deterministic" });
  assert.equal(resolveProvider({ GEMINI_API_KEY: "test-gemini" }).provider, "gemini");
  assert.equal(resolveProvider({ ...openaiEnv, GEMINI_API_KEY: "test-gemini" }).provider, "openai-compatible");
  const noAuth = resolveProvider(openaiEnv);
  assert.equal(noAuth.provider, "openai-compatible");
  assert.equal(noAuth.apiKey, undefined);
  const auth = resolveProvider({ ...openaiEnv, OPENAI_API_KEY: "test-openai" });
  assert.equal(auth.provider, "openai-compatible");
  assert.equal(auth.apiKey, "test-openai");
});

test("all partial OpenAI settings fail even when Gemini is configured", () => {
  const keys = ["OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_API_KEY"] as const;
  const values = ["https://provider.example/v1", "test-model", "test-key"];
  for (let mask = 1; mask < 8; mask++) {
    if ((mask & 3) === 3) continue; // URL + model is complete, with or without a key.
    const env: NodeJS.ProcessEnv = { GEMINI_API_KEY: "test-gemini" };
    keys.forEach((key, index) => { if (mask & (1 << index)) env[key] = values[index]; });
    assert.throws(() => resolveProvider(env), /configuration is incomplete/);
  }
  for (const env of [
    { OPENAI_BASE_URL: "", OPENAI_MODEL: "model" },
    { OPENAI_BASE_URL: "  ", OPENAI_MODEL: "model" },
    { OPENAI_BASE_URL: openaiEnv.OPENAI_BASE_URL, OPENAI_MODEL: " " },
    { OPENAI_API_KEY: "" },
  ]) assert.throws(() => resolveProvider(env), /configuration is incomplete/);
});

test("base URL construction preserves /v1 and custom prefixes without duplicating them", () => {
  // URL construction only: no connection to the local proxy is attempted.
  for (const [base, expected] of [
    ["http://127.0.0.1:5580/v1", "http://127.0.0.1:5580/v1/chat/completions"],
    ["https://provider.example/v1/", "https://provider.example/v1/chat/completions"],
    ["https://provider.example", "https://provider.example/chat/completions"],
    ["https://provider.example/custom/v1///", "https://provider.example/custom/v1/chat/completions"],
  ]) {
    const result = resolveProvider({ ...openaiEnv, OPENAI_BASE_URL: base });
    assert.equal(result.provider, "openai-compatible");
    if (result.provider === "openai-compatible") assert.equal(result.endpoint, expected);
  }
});

test("invalid base URLs, embedded credentials and invalid Gemini models fail without exposing values", () => {
  for (const base of ["not-url", "file:///private", "https://user:secret@provider.example/v1", "https://provider.example/v1?key=secret", "https://provider.example/v1#secret"]) {
    assert.throws(() => resolveProvider({ ...openaiEnv, OPENAI_BASE_URL: base }), error => {
      assert.ok(error instanceof PublicError);
      assert.match(error.message, /OPENAI_BASE_URL/);
      assert.doesNotMatch(error.message, /secret|user:/);
      return true;
    });
  }
  assert.throws(() => resolveProvider({ GEMINI_API_KEY: "test", GEMINI_MODEL: "../bad" }), /GEMINI_MODEL is invalid/);
  assert.throws(() => resolveProvider({ ...openaiEnv, OPENAI_API_KEY: "test\nkey" }), /invalid header characters/);
});

test("OpenAI-compatible requests support optional Bearer auth, model names, minimal context and no redirects", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const key of [undefined, "test-secret"]) {
      let calls = 0;
      let seen: RequestInit | undefined;
      let url = "";
      globalThis.fetch = async (input, init) => {
        calls++; url = String(input); seen = init;
        return Response.json({ choices: [{ message: { content: '{"suggested":"<button>Search</button>","explanation":"Name missing","correction":"Adds a name"}' }, finish_reason: "stop" }] });
      };
      const resolved = resolveProvider({ ...openaiEnv, OPENAI_API_KEY: key });
      if (resolved.provider === "deterministic") throw new Error("Invalid fixture");
      const result = await requestSuggestion(resolved, context);
      assert.equal(calls, 1);
      assert.equal(url, "https://provider.example/v1/chat/completions");
      assert.equal(result.source, "openai-compatible");
      assert.equal(new Headers(seen?.headers).get("Authorization"), key ? `Bearer ${key}` : null);
      assert.equal(seen?.redirect, "error");
      assert.ok(seen?.signal instanceof AbortSignal);
      const body = JSON.parse(String(seen?.body));
      assert.equal(body.model, "qwen3-coder-next");
      assert.equal(body.stream, false);
      assert.equal(body.messages[0].role, "system");
      assert.deepEqual(JSON.parse(body.messages[1].content), context);
      assert.doesNotMatch(String(seen?.body), /test-secret/);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("OpenAI failures are sanitized and never retried or sent to Gemini", async () => {
  const originalFetch = globalThis.fetch;
  const cases = [
    { status: 400, message: /rejected the request/ },
    { status: 401, message: /API key or access/ },
    { status: 403, message: /API key or access/ },
    { status: 404, message: /model or endpoint was not found/ },
    { status: 429, message: /quota or rate limit/ },
    { status: 500, message: /HTTP 500/ },
    { error: new TypeError("private-network-details"), message: /could not respond/ },
    { error: new DOMException("private-timeout-details", "TimeoutError"), message: /timed out/ },
  ];
  try {
    for (const failure of cases) {
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (failure.error) throw failure.error;
        return Response.json({ error: { message: "private-provider-details test-secret" } }, { status: failure.status });
      };
      await assert.rejects(requestSuggestion(config, context), error => {
        assert.ok(error instanceof PublicError);
        assert.equal(error.status, 503);
        assert.match(error.message, failure.message);
        assert.match(error.message, /No automatic retry/);
        assert.doesNotMatch(error.message, /private-|test-secret/);
        return true;
      });
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("invalid provider envelopes, refusals, truncated responses and malformed response JSON are rejected", async () => {
  const originalFetch = globalThis.fetch;
  try {
    for (const body of [
      "{", "null", "{}", '{"choices":[]}',
      '{"choices":[{"message":{"content":null}}]}',
      '{"choices":[{"message":{"content":[]}}]}',
      '{"choices":[{"message":{"content":"{}"},"finish_reason":"length"}]}',
      '{"choices":[{"message":{"refusal":"Declined"},"finish_reason":"stop"}]}',
    ]) {
      let calls = 0;
      globalThis.fetch = async () => { calls++; return new Response(body); };
      await assert.rejects(requestSuggestion(config, context), /invalid structured response/);
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test("JSON parser unwraps only a full JSON or unlabelled Markdown fence", () => {
  for (const text of ['{"suggested":"ok"}', '```json\n{"suggested":"ok"}\n```', '```\r\n{"suggested":"ok"}\r\n```']) {
    assert.deepEqual(parseSuggestionText(text), { suggested: "ok" });
  }
  for (const text of ['prefix\n```json\n{}\n```', '```javascript\n{}\n```', '```json\n{}', '{} trailing prose', '{"suggested":}']) {
    assert.throws(() => parseSuggestionText(text));
  }
});

test("provider diagnostics log only safe categories, phase and HTTP status without retries", async (t) => {
  const originalFetch = globalThis.fetch;
  const entries: unknown[] = [];
  const warn = t.mock.method(logger, "warn", (fields: unknown) => { entries.push(fields); });
  const privateDetails = "private-credential-url-response";
  const cases = [
    { error: new TypeError(privateDetails, { cause: Object.assign(new Error(privateDetails), { code: "ECONNREFUSED" }) }), category: "connection-refused", phase: "request", status: null },
    { error: new TypeError(privateDetails, { cause: { code: "ENOTFOUND" } }), category: "dns-error", phase: "request", status: null },
    { error: new TypeError(privateDetails, { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } }), category: "timeout", phase: "request", status: null },
    { error: new DOMException(privateDetails, "TimeoutError"), category: "timeout", phase: "request", status: null },
    { error: new TypeError(privateDetails), category: "transport-error", phase: "request", status: null },
    { body: JSON.stringify({ error: { message: privateDetails } }), category: "http-error", phase: "http-response", status: 401 },
    { body: JSON.stringify({ error: { message: privateDetails } }), category: "http-error", phase: "http-response", status: 500 },
    { body: "{", category: "response-parsing-error", phase: "response-body", status: 200 },
    { body: "{}", category: "invalid-response", phase: "response-body", status: 200 },
  ];
  try {
    for (const failure of cases) {
      entries.length = 0;
      let calls = 0;
      globalThis.fetch = async () => {
        calls++;
        if (failure.error) throw failure.error;
        return new Response(failure.body, { status: failure.status! });
      };
      await assert.rejects(requestSuggestion({ ...config, apiKey: privateDetails }, context));
      assert.equal(calls, 1);
      assert.deepEqual(entries, [{
        provider: "openai-compatible", category: failure.category,
        phase: failure.phase, httpStatus: failure.status,
      }]);
      assert.doesNotMatch(JSON.stringify(entries), /private-|Bearer|127\.0\.0\.1/);
    }
  } finally {
    globalThis.fetch = originalFetch;
    warn.mock.restore();
  }
});
