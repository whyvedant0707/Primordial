import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Child processes deliberately receive no inherited application configuration.
function runLiveCheck(environment: Record<string, string>) {
  const result = spawnSync(process.execPath, [
    "--import", "tsx", "--test",
    fileURLToPath(new URL("./mongo-live.test.ts", import.meta.url)),
  ], {
    env: { PATH: process.env.PATH, MONGODB_LIVE_TEST: "1", ...environment },
    encoding: "utf8",
    timeout: 15_000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, 1, "Unsafe or missing configuration must fail, not skip");
  return result.stdout + result.stderr;
}

test("live check fails rather than skips when the dedicated URI is missing", () => {
  assert.match(runLiveCheck({}), /Set MONGODB_TEST_URI/);
});

test("live check rejects application configuration before connecting", () => {
  const applicationUri = "mongodb://dummy-user:dummy-password@127.0.0.1:1/application";
  const output = runLiveCheck({
    MONGODB_URI: applicationUri,
    MONGODB_TEST_URI: "mongodb://127.0.0.1:1/history_test",
  });
  assert.match(output, /Refusing to run with application MONGODB_URI present/);
  assert.ok(!output.includes(applicationUri), "Application connection details must not be logged");
});

test("live check rejects a non-test database without logging connection details", () => {
  const uri = "mongodb://dummy-user:dummy-password@127.0.0.1:1/application";
  const output = runLiveCheck({ MONGODB_TEST_URI: uri });
  assert.match(output, /dedicated database ending in test/);
  assert.ok(!output.includes(uri));
});

test("live check rejects malformed URIs without logging their values", () => {
  const uri = "not-a-uri-with-dummy-credentials";
  const output = runLiveCheck({ MONGODB_TEST_URI: uri });
  assert.match(output, /must be a valid MongoDB URI/);
  assert.ok(!output.includes(uri));
});
