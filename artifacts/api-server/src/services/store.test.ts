import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Scan } from "@workspace/api-zod";
import {
  createHistoryStore,
  createSavedReportExport,
  HISTORY_RETENTION_MS,
  type HistoryBackend,
} from "./store";
import { getRecord, getOwnedRecord, putScan } from "./store";

function scan(overrides: Partial<Scan> = {}): Scan {
  return {
    id: randomUUID(),
    url: "https://example.com/",
    createdAt: new Date().toISOString(),
    status: "complete",
    stage: "Complete",
    issues: [],
    warnings: [],
    screenshot: "/api/scan/test/screenshot",
    screenshotWidth: 1280,
    screenshotHeight: 800,
    ...overrides,
  };
}

function fakeBackend(overrides: Partial<HistoryBackend> = {}) {
  const reports = new Map<string, Record<string, unknown>>();
  const events: string[] = [];
  let expiry: Date | undefined;
  let ttlConfig: { keys: { expiresAt: 1 }; options: { expireAfterSeconds: 0 } } | undefined;
  const backend: HistoryBackend = {
    async connect() { events.push("connect"); },
    async createTtlIndex(keys, options) {
      events.push("ttl-index");
      ttlConfig = { keys, options };
    },
    async upsertReport(report, ownerId, expiresAt) {
      events.push("write");
      expiry = expiresAt;
      reports.set(`${ownerId}:${report.id}`, { ...structuredClone(report), ownerId } as unknown as Record<string, unknown>);
    },
    async listReports(ownerId) {
      events.push("list");
      return [...reports.values()].filter(row => row.ownerId === ownerId) as unknown as Awaited<ReturnType<HistoryBackend["listReports"]>>;
    },
    async findReport(id, ownerId) {
      events.push("read");
      return (reports.get(`${ownerId}:${id}`) as unknown as Awaited<ReturnType<HistoryBackend["findReport"]>>) ?? null;
    },
    async deleteReport(id, ownerId) {
      events.push("delete");
      return reports.delete(`${ownerId}:${id}`);
    },
    ...overrides,
  };
  return { backend, events, reports, getExpiry: () => expiry, getTtlConfig: () => ttlConfig };
}

test("shareable report exports preserve findings and omit temporary or internal state", () => {
  const report = scan({
    title: "Example page",
    passes: 14,
    incomplete: 2,
    durationMs: 1250,
    screenshot: "/api/scan/private-id/screenshot",
    screenshotWidth: 1280,
    screenshotHeight: 800,
    warnings: ["Internal warning"],
    error: "Internal error",
    issues: [{
      id: "button-name",
      impact: "critical",
      help: "Buttons must have discernible text",
      description: "A button needs an accessible name.",
      helpUrl: "https://example.com/rules/button-name",
      wcag: ["412"],
      principle: "Robust",
      nodes: [{
        html: "<button></button>",
        target: ["#action"],
        summary: "Missing accessible name",
        box: { x: 10, y: 20, width: 30, height: 40 },
      }],
    }],
  });
  const internalReport = Object.assign(report, {
    snapshot: "<html>temporary simulation snapshot</html>",
    targetFingerprints: new Map([["internal", {}]]),
    fixes: new Map([["internal", {}]]),
  });

  const exported = createSavedReportExport(internalReport);
  assert.match(exported.scope, /one public page.*initial state/i);
  assert.match(exported.disclaimer, /not a conformance certification/i);
  assert.deepEqual(exported.scan.issues[0], {
    id: "button-name",
    impact: "critical",
    help: "Buttons must have discernible text",
    description: "A button needs an accessible name.",
    helpUrl: "https://example.com/rules/button-name",
    wcag: ["412"],
    principle: "Robust",
    nodes: [{
      html: "<button></button>",
      target: ["#action"],
      summary: "Missing accessible name",
    }],
  });
  assert.equal(exported.scan.url, report.url);
  assert.equal(exported.scan.passes, 14);
  assert.equal("screenshot" in exported, false);
  assert.equal("warnings" in exported.scan, false);
  assert.equal("error" in exported.scan, false);
  assert.equal("id" in exported.scan, false);
  assert.equal("stage" in exported.scan, false);
  assert.equal("box" in exported.scan.issues[0]!.nodes[0]!, false);
  assert.equal("snapshot" in exported, false);
  assert.equal("targetFingerprints" in exported, false);
  assert.equal("fixes" in exported, false);
});

test("history stays hidden until both MongoDB connection and TTL index setup succeed", async () => {
  const failedConnection = createHistoryStore(() => fakeBackend({
    async connect() { throw new Error("connection unavailable"); },
  }).backend, () => {});
  await failedConnection.initializeHistory("mongodb://test");
  assert.equal(failedConnection.hasHistory(), false);

  const failedIndex = createHistoryStore(() => fakeBackend({
    async createTtlIndex() { throw new Error("index unavailable"); },
  }).backend, () => {});
  await failedIndex.initializeHistory("mongodb://test");
  assert.equal(failedIndex.hasHistory(), false);

  let releaseIndex!: () => void;
  const waitingIndex = fakeBackend({
    async createTtlIndex() {
      waitingIndex.events.push("ttl-index");
      await new Promise<void>(resolve => { releaseIndex = resolve; });
    },
  });
  const readyStore = createHistoryStore(() => waitingIndex.backend, () => {});
  const initialization = readyStore.initializeHistory("mongodb://test");
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(waitingIndex.events, ["connect", "ttl-index"]);
  assert.equal(readyStore.hasHistory(), false);
  releaseIndex();
  await initialization;
  assert.equal(readyStore.hasHistory(), true);
  assert.deepEqual(waitingIndex.events, ["connect", "ttl-index"]);
});

test("reports survive store recreation, expire after seven days, and omit temporary assets", async () => {
  const fake = fakeBackend();
  const firstProcess = createHistoryStore(() => fake.backend, () => {});
  assert.equal(firstProcess.hasHistory(), false);
  await firstProcess.initializeHistory("mongodb://test");
  const report = scan() as Scan & { snapshot?: string };
  report.snapshot = "<html>temporary simulation snapshot</html>";
  const beforeWrite = Date.now();
  await firstProcess.persistScan(report, "owner-a");

  assert.ok(fake.getExpiry());
  assert.ok(fake.getExpiry()!.getTime() >= beforeWrite + HISTORY_RETENTION_MS);
  assert.ok(fake.getExpiry()!.getTime() <= Date.now() + HISTORY_RETENTION_MS);
  const stored = fake.reports.get(`owner-a:${report.id}`)!;
  assert.equal("screenshot" in stored, false);
  assert.equal("screenshotWidth" in stored, false);
  assert.equal("screenshotHeight" in stored, false);
  assert.equal("snapshot" in stored, false);

  // A new history-store instance has no in-memory scan, like a server restart.
  const restartedProcess = createHistoryStore(() => fake.backend, () => {});
  await restartedProcess.initializeHistory("mongodb://test");
  const loaded = await restartedProcess.loadReport(report.id, "owner-a");
  assert.ok(loaded);
  assert.equal(loaded!.id, report.id);
  assert.equal(loaded!.screenshot, undefined);
  assert.match(loaded!.warnings.join(" "), /screenshot and simulation snapshot have expired/i);
  assert.deepEqual(await restartedProcess.loadHistory("owner-a"), [{
    id: report.id,
    url: report.url,
    createdAt: report.createdAt,
    total: 0,
  }]);
  assert.ok(fake.events.includes("ttl-index"));
  assert.deepEqual(fake.getTtlConfig(), {
    keys: { expiresAt: 1 },
    options: { expireAfterSeconds: 0 },
  });
});

test("saved report history and reads are isolated by owner", async () => {
  const fake = fakeBackend();
  const store = createHistoryStore(() => fake.backend, () => {});
  await store.initializeHistory("mongodb://test");

  const aliceReport = scan();
  const bobReport = scan();
  await store.persistScan(aliceReport, "alice");
  await store.persistScan(bobReport, "bob");

  assert.deepEqual((await store.loadHistory("alice")).map(item => item.id), [aliceReport.id]);
  assert.deepEqual((await store.loadHistory("bob")).map(item => item.id), [bobReport.id]);
  assert.equal(await store.loadReport(aliceReport.id, "bob"), undefined);
  assert.equal((await store.loadReport(aliceReport.id, "alice"))?.id, aliceReport.id);
  assert.equal(await store.loadReport(aliceReport.id, undefined), undefined);

  const activeScan = scan();
  const activeRecord = putScan(activeScan, "alice");
  assert.equal(getOwnedRecord(activeScan.id, "bob"), undefined);
  assert.equal(getOwnedRecord(activeScan.id), undefined);
  assert.equal(getOwnedRecord(activeScan.id, "alice"), activeRecord);
  assert.equal(await store.loadReport(activeScan.id, "bob", activeRecord), undefined);
  assert.equal((await store.loadReport(activeScan.id, "alice", activeRecord))?.id, activeScan.id);

  const anonymousReport = scan();
  await store.persistScan(anonymousReport);
  assert.match(anonymousReport.warnings.join(" "), /sign in to save.*temporary/i);
  assert.deepEqual([...fake.reports.keys()].sort(), [`alice:${aliceReport.id}`, `bob:${bobReport.id}`].sort());
});

test("saved reports can only be deleted by their owner and leave no active copy", async () => {
  const fake = fakeBackend();
  const store = createHistoryStore(() => fake.backend, () => {});
  await store.initializeHistory("mongodb://test");

  const aliceReport = scan();
  const bobReport = scan();
  await store.persistScan(aliceReport, "alice");
  await store.persistScan(bobReport, "bob");
  putScan(aliceReport, "alice");
  putScan(bobReport, "bob");

  assert.equal(await store.deleteReport(aliceReport.id, "bob"), false);
  assert.ok(getRecord(aliceReport.id));
  assert.equal((await store.loadReport(aliceReport.id, "alice"))?.id, aliceReport.id);

  assert.equal(await store.deleteReport(aliceReport.id, "alice"), true);
  assert.equal(getRecord(aliceReport.id), undefined);
  assert.equal(await store.loadReport(aliceReport.id, "alice"), undefined);
  assert.deepEqual((await store.loadHistory("alice")), []);
  assert.deepEqual((await store.loadHistory("bob")).map(({ id }) => id), [bobReport.id]);
  assert.deepEqual([...fake.reports.keys()], [`bob:${bobReport.id}`]);
});

test("database connection, write, and read failures do not block temporary scans", async () => {
  const failedConnectionStore = createHistoryStore(() => fakeBackend({
    async connect() { throw new Error("connection unavailable"); },
  }).backend, () => {});
  await failedConnectionStore.initializeHistory("mongodb://test");
  const temporary = scan();
  assert.doesNotThrow(() => putScan(temporary));
  assert.equal(getRecord(temporary.id)?.scan, temporary);
  assert.equal(failedConnectionStore.hasHistory(), false);

  const readFailure = new Error("read unavailable");
  const fake = fakeBackend({
    async upsertReport() { throw new Error("write unavailable"); },
    async listReports() { throw readFailure; },
    async findReport() { throw readFailure; },
  });
  const store = createHistoryStore(() => fake.backend, () => {});
  await store.initializeHistory("mongodb://test");

  const unsaved = scan();
  assert.doesNotThrow(() => putScan(unsaved));
  await store.persistScan(unsaved, "owner-a");
  assert.match(unsaved.warnings.join(" "), /could not be saved.*temporary/i);
  await assert.rejects(store.loadHistory("owner-a"), /read unavailable/);
  await assert.rejects(store.loadReport(randomUUID(), "owner-a"), /read unavailable/);

  const afterDatabaseErrors = scan();
  assert.doesNotThrow(() => putScan(afterDatabaseErrors));
  assert.equal(getRecord(afterDatabaseErrors.id)?.scan, afterDatabaseErrors);
});
