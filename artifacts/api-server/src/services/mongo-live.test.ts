import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";
import type { Scan } from "@workspace/api-zod";
import {
  createHistoryStore,
  createMongoHistoryBackend,
  HISTORY_RETENTION_MS,
} from "./store";

const testEnabled = process.env.MONGODB_LIVE_TEST === "1";
const TTL_DELETION_TIMEOUT_MS = 180_000;
const TTL_POLL_INTERVAL_MS = 1_000;

function requireDedicatedTestUri(): string {
  assert.ok(
    !process.env.MONGODB_URI,
    "Refusing to run with application MONGODB_URI present. Run in an isolated test environment without application secrets.",
  );
  const uri = process.env.MONGODB_TEST_URI;
  assert.ok(uri, "Set MONGODB_TEST_URI to an authorized, dedicated MongoDB test database");

  let databaseName: string;
  try {
    const parsed = new URL(uri);
    assert.ok(
      parsed.protocol === "mongodb:" || parsed.protocol === "mongodb+srv:",
      "MONGODB_TEST_URI must use the MongoDB protocol",
    );
    databaseName = decodeURIComponent(parsed.pathname.slice(1).split("/")[0] ?? "");
  } catch {
    assert.fail("MONGODB_TEST_URI must be a valid MongoDB URI; its value is never printed");
  }

  assert.match(
    databaseName,
    /(?:^|[_-])test$/i,
    "MONGODB_TEST_URI must name a dedicated database ending in test (for example, app_test)",
  );
  return uri;
}

test("MongoDB TTL monitor physically deletes a short-lived fixture", {
  skip: !testEnabled,
  // Allow time for connection, index creation and cleanup outside the polling window.
  timeout: TTL_DELETION_TIMEOUT_MS + 30_000,
}, async () => {
  const uri = requireDedicatedTestUri();
  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 4_000,
    timeoutMS: 5_000,
    readPreference: "primary",
  });
  // Never shorten the report-retention index or touch the report collection.
  const collection = client.db().collection("saved_report_ttl_integration_test");
  const fixture = { id: randomUUID(), ownerId: `ttl-test-${randomUUID()}` };
  let insertionAttempted = false;

  try {
    await client.connect();
    await collection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    // Also clean up if MongoDB inserts the document but its acknowledgement times out.
    insertionAttempted = true;
    await collection.insertOne({
      ...fixture,
      expiresAt: new Date(Date.now() + 2_000),
    });
    // A raw lookup proves the document existed; history reads filter expiry themselves.
    assert.ok(await collection.findOne(fixture), "The TTL fixture must first exist in MongoDB");

    // MongoDB normally checks TTL indexes once a minute. Allow several passes,
    // but fail explicitly if the monitor is disabled or deletion never happens.
    const deadline = performance.now() + TTL_DELETION_TIMEOUT_MS;
    while (performance.now() < deadline) {
      if (await collection.findOne(fixture) === null) return;
      await delay(Math.min(TTL_POLL_INTERVAL_MS, Math.max(0, deadline - performance.now())));
    }
    assert.fail("MongoDB's TTL monitor did not physically delete the fixture within 180 seconds");
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.fail("The authorized MongoDB TTL check could not complete. Connection details have not been logged.");
  } finally {
    try {
      if (insertionAttempted) await collection.deleteOne(fixture);
    } catch {
      throw new Error("The MongoDB TTL fixture could not be cleaned up. Connection details have not been logged.");
    } finally {
      await client.close();
    }
  }
});

test("MongoDB keeps saved reports private between account owners", {
  skip: !testEnabled,
  timeout: 30_000,
}, async () => {
  const uri = requireDedicatedTestUri();
  const collectionName = "saved_report_integration_test";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4_000 });
  const backend = createMongoHistoryBackend(uri, collectionName);
  const fixtures = Array.from({ length: 2 }, () => ({
    ownerId: `isolation-test-${randomUUID()}`,
    id: randomUUID(),
  }));

  try {
    const store = createHistoryStore(() => backend, () => {});
    await store.initializeHistory(uri);
    assert.equal(store.hasHistory(), true, "Isolation checks require a working dedicated MongoDB database");
    await client.connect();
    const collection = client.db().collection(collectionName);

    for (const { id, ownerId } of fixtures) {
      const report: Scan = {
        id,
        url: `https://example.com/isolation-test/${id}`,
        createdAt: new Date().toISOString(),
        status: "complete",
        stage: "Complete",
        issues: [],
        warnings: [],
      };
      await store.persistScan(report, ownerId);
      assert.deepEqual(report.warnings, [], "Each owner's fixture must be saved successfully");
    }

    for (const [index, fixture] of fixtures.entries()) {
      const otherOwnerId = fixtures[1 - index]!.ownerId;
      const originalDocument = await collection.findOne(fixture);
      assert.ok(originalDocument, "The owner's report must exist before the other account accesses it");
      const originalReport = await store.loadReport(fixture.id, fixture.ownerId);
      assert.equal(originalReport?.id, fixture.id, "The owner must be able to load their own saved report");
      const originalHistory = await store.loadHistory(fixture.ownerId);
      assert.deepEqual(originalHistory.map(({ id }) => id), [fixture.id]);

      assert.equal(
        await store.loadReport(fixture.id, otherOwnerId),
        undefined,
        "Another account must not be able to load this saved report",
      );
      assert.equal(
        await store.deleteReport(fixture.id, otherOwnerId),
        false,
        "Another account must not be able to delete this saved report",
      );
      assert.deepEqual(
        await collection.findOne(fixture),
        originalDocument,
        "An unauthorized deletion attempt must leave the entire MongoDB document unchanged",
      );
      assert.deepEqual(
        await store.loadReport(fixture.id, fixture.ownerId),
        originalReport,
        "The original owner must still be able to load the unchanged saved report",
      );
      assert.deepEqual(
        await store.loadHistory(fixture.ownerId),
        originalHistory,
        "An unauthorized deletion attempt must leave the owner's history unchanged",
      );
      assert.deepEqual(
        (await store.loadHistory(otherOwnerId)).map(({ id }) => id),
        [fixtures[1 - index]!.id],
        "Each account's history must contain only its own report, never the other account's",
      );
    }
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.fail("The authorized MongoDB isolation check could not complete. Connection details have not been logged.");
  } finally {
    try {
      await client.connect();
      await client.db().collection(collectionName).deleteMany({ $or: fixtures });
    } catch {
      throw new Error("Temporary MongoDB isolation records could not be cleaned up. Connection details have not been logged.");
    } finally {
      await Promise.all([backend.close?.(), client.close()]);
    }
  }
});

test("MongoDB keeps an individually deleted report absent after backend recreation", {
  skip: !testEnabled,
  timeout: 30_000,
}, async () => {
  const uri = requireDedicatedTestUri();
  const collectionName = "saved_report_integration_test";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4_000 });
  const firstBackend = createMongoHistoryBackend(uri, collectionName);
  let restartedBackend: ReturnType<typeof createMongoHistoryBackend> | undefined;
  const ownerId = `deletion-test-${randomUUID()}`;
  const reports: Scan[] = Array.from({ length: 2 }, () => ({
    id: randomUUID(),
    url: `https://example.com/deletion-test/${randomUUID()}`,
    createdAt: new Date().toISOString(),
    status: "complete",
    stage: "Complete",
    issues: [],
    warnings: [],
  }));
  const [deletedReport, retainedReport] = reports as [Scan, Scan];

  try {
    const store = createHistoryStore(() => firstBackend, () => {});
    assert.equal(await store.initializeHistory(uri), true, "Deletion checks require a working dedicated MongoDB database");
    await client.connect();
    const collection = client.db().collection(collectionName);

    for (const report of reports) {
      await store.persistScan(report, ownerId);
      assert.deepEqual(report.warnings, [], "Both deletion fixtures must be saved successfully");
      assert.equal((await store.loadReport(report.id, ownerId))?.id, report.id, "Both fixtures must be readable before deletion");
    }
    const originalRetainedReport = await store.loadReport(retainedReport.id, ownerId);
    const originalHistory = await store.loadHistory(ownerId);
    assert.deepEqual(originalHistory.map(({ id }) => id).sort(), reports.map(({ id }) => id).sort());
    const retainedDocument = await collection.findOne({ id: retainedReport.id, ownerId });
    assert.ok(retainedDocument, "The retained fixture must exist before deletion");

    assert.equal(await store.deleteReport(deletedReport.id, ownerId), true, "Deleting an existing saved report must succeed");
    await firstBackend.close?.();

    restartedBackend = createMongoHistoryBackend(uri, collectionName);
    const persistedStore = createHistoryStore(() => restartedBackend!, () => {});
    assert.equal(await persistedStore.initializeHistory(uri), true, "The recreated backend must connect successfully");
    assert.equal(await persistedStore.loadReport(deletedReport.id, ownerId), undefined, "A deleted report must not return after backend recreation");
    const retainedHistory = originalHistory.filter(({ id }) => id === retainedReport.id);
    assert.deepEqual(await persistedStore.loadHistory(ownerId), retainedHistory, "History must contain only the untouched report after backend recreation");
    assert.equal(await collection.findOne({ id: deletedReport.id, ownerId }), null, "Deletion must remove the MongoDB document, not merely hide it");

    assert.equal(await persistedStore.deleteReport(deletedReport.id, ownerId), false, "Repeating deletion must return the store's missing-report outcome");
    assert.equal(await persistedStore.loadReport(deletedReport.id, ownerId), undefined);
    assert.deepEqual(await persistedStore.loadReport(retainedReport.id, ownerId), originalRetainedReport, "The other saved report must remain intact");
    assert.deepEqual(await persistedStore.loadHistory(ownerId), retainedHistory, "Repeating deletion must leave history unchanged");
    assert.deepEqual(await collection.findOne({ id: retainedReport.id, ownerId }), retainedDocument, "Individual deletion must leave the other MongoDB document unchanged");
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.fail("The authorized MongoDB deletion check could not complete. Connection details have not been logged.");
  } finally {
    try {
      await client.connect();
      await client.db().collection(collectionName).deleteMany({
        ownerId,
        id: { $in: reports.map(({ id }) => id) },
      });
    } catch {
      throw new Error("Temporary MongoDB deletion records could not be cleaned up. Connection details have not been logged.");
    } finally {
      await Promise.all([firstBackend.close?.(), restartedBackend?.close?.(), client.close()]);
    }
  }
});

test("authorized MongoDB preserves reports, seven-day expiry, TTL, and temporary-asset exclusion", {
  skip: !testEnabled,
  timeout: 30000,
}, async () => {
  const uri = requireDedicatedTestUri();
  const collectionName = "saved_report_integration_test";
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  const firstBackend = createMongoHistoryBackend(uri, collectionName);
  const restartedBackend = createMongoHistoryBackend(uri, collectionName);
  const ownerId = `integration-test-${randomUUID()}`;
  const reportId = randomUUID();
  const expiredReportId = randomUUID();
  const createdReports = [reportId, expiredReportId];

  try {
    const store = createHistoryStore(() => firstBackend, () => {});
    await store.initializeHistory(uri);
    assert.equal(store.hasHistory(), true, "The dedicated test database must permit connection and TTL-index creation");

    const report: Scan & { snapshot?: string } = {
      id: reportId,
      url: "https://example.com/integration-test-fixture",
      createdAt: new Date().toISOString(),
      status: "complete",
      stage: "Complete",
      issues: [],
      warnings: [],
      screenshot: "/api/scan/integration-test/screenshot",
      screenshotWidth: 1280,
      screenshotHeight: 800,
      snapshot: "<html>temporary simulation snapshot</html>",
    };
    const writeStartedAt = Date.now();
    await store.persistScan(report, ownerId);
    await firstBackend.close?.();

    const persistedStore = createHistoryStore(() => restartedBackend, () => {});
    await persistedStore.initializeHistory(uri);
    const restored = await persistedStore.loadReport(reportId, ownerId);
    assert.equal(restored?.id, reportId, "A saved report must survive store recreation");
    assert.equal(restored?.screenshot, undefined);
    assert.equal((await persistedStore.loadHistory(ownerId)).length, 1);

    const expiredAt = new Date(Date.now() - 60_000);
    const {
      screenshot: _screenshot,
      screenshotWidth: _width,
      screenshotHeight: _height,
      snapshot: _snapshot,
      ...persistableReport
    } = report;
    await restartedBackend.upsertReport({ ...persistableReport, id: expiredReportId }, ownerId, expiredAt);
    assert.equal(await persistedStore.loadReport(expiredReportId, ownerId), undefined);
    assert.deepEqual(
      (await persistedStore.loadHistory(ownerId)).map(({ id }) => id),
      [reportId],
      "Expired reports must not appear in history even before MongoDB's TTL monitor removes them",
    );

    await client.connect();
    const collection = client.db().collection(collectionName);
    const indexes = await collection.listIndexes().toArray();
    assert.ok(indexes.some(index => index.key.expiresAt === 1 && index.expireAfterSeconds === 0));

    const stored = await collection.findOne({ id: reportId, ownerId });
    assert.ok(stored, "The report must be present in MongoDB");
    assert.ok(stored.expiresAt instanceof Date);
    const earliestValidExpiry = writeStartedAt + HISTORY_RETENTION_MS - 1000;
    const latestValidExpiry = Date.now() + HISTORY_RETENTION_MS + 1000;
    assert.ok(
      stored.expiresAt.getTime() >= earliestValidExpiry &&
        stored.expiresAt.getTime() <= latestValidExpiry,
      "The MongoDB document must expire seven days after it is saved",
    );
    for (const temporaryField of ["screenshot", "screenshotWidth", "screenshotHeight", "snapshot"]) {
      assert.equal(
        temporaryField in stored,
        false,
        `Saved reports must not contain temporary ${temporaryField} data`,
      );
    }
  } catch (error) {
    if (error instanceof assert.AssertionError) throw error;
    assert.fail("The authorized MongoDB check could not complete. Connection details have not been logged.");
  } finally {
    try {
      await client.connect();
      await client.db().collection(collectionName).deleteMany({
        id: { $in: createdReports },
        ownerId,
      });
    } catch {
      throw new Error("Temporary MongoDB test records could not be cleaned up. Connection details have not been logged.");
    } finally {
      await Promise.all([firstBackend.close?.(), restartedBackend.close?.(), client.close()]);
    }
  }
});
