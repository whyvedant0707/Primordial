import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { MongoClient } from "mongodb";
import type { Scan } from "@workspace/api-zod";
import {
  createHistoryStore,
  createMongoHistoryBackend,
  HISTORY_RETENTION_MS,
} from "./store";

const testEnabled = process.env.MONGODB_LIVE_TEST === "1";

function requireDedicatedTestUri(): string {
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
