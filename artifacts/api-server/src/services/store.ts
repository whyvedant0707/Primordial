import { MongoClient } from "mongodb";
import type { Scan, Fix, IssueInput, SavedReportExport } from "@workspace/api-zod";
import { logger } from "../lib/logger";
import type { ElementFingerprint } from "./snapshot-target";

export interface ScanRecord {
  scan: Scan;
  ownerId?: string;
  screenshot?: Buffer;
  snapshot?: string;
  targetFingerprints?: Map<string, ElementFingerprint>;
  expires: number;
  fixes: Map<string, { input: IssueInput; fix: Fix }>;
}
const scans = new Map<string, ScanRecord>();
export const RETENTION_MS = 30 * 60 * 1000;
export function putScan(scan: Scan, ownerId?: string): ScanRecord {
  prune();
  while (scans.size >= 12) {
    const oldest = [...scans].find(([, r]) => r.scan.status !== "running");
    if (!oldest) throw new Error("Scan capacity reached");
    scans.delete(oldest[0]);
  }
  const record = { scan, ownerId, expires: Date.now() + RETENTION_MS, fixes: new Map() };
  scans.set(scan.id, record);
  return record;
}
export function getRecord(id: string) { prune(); return scans.get(id); }
export function getOwnedRecord(id: string, ownerId?: string) {
  const record = getRecord(id);
  return record?.ownerId && record.ownerId !== ownerId ? undefined : record;
}
function prune() {
  for (const [id, r] of scans) if (r.expires < Date.now() && r.scan.status !== "running") scans.delete(id);
}
setInterval(prune, 60000).unref();

export const HISTORY_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
type PersistedScan = Omit<Scan, "screenshot" | "screenshotWidth" | "screenshotHeight" | "snapshot">;
type HistorySummaryRow = Pick<Scan, "id" | "url" | "createdAt" | "issues">;

export function createSavedReportExport(scan: Scan): SavedReportExport {
  return {
    formatVersion: 1,
    scope: "One public page in its initial state. Automated axe-core checks cover WCAG 2.0 and 2.1 Level A and AA rules.",
    disclaimer: "These automated findings cover only part of WCAG and are not a conformance certification or a determination that the page complies. Human review is required.",
    scan: {
      ...(scan.title ? { title: scan.title } : {}),
      url: scan.url,
      createdAt: scan.createdAt,
      ...(typeof scan.passes === "number" ? { passes: scan.passes } : {}),
      ...(typeof scan.incomplete === "number" ? { incomplete: scan.incomplete } : {}),
      ...(typeof scan.durationMs === "number" ? { durationMs: scan.durationMs } : {}),
      issues: scan.issues.map(issue => ({
        id: issue.id,
        impact: issue.impact,
        help: issue.help,
        description: issue.description,
        helpUrl: issue.helpUrl,
        wcag: issue.wcag,
        principle: issue.principle,
        nodes: issue.nodes.map(node => ({
          html: node.html,
          target: node.target,
          summary: node.summary,
        })),
      })),
    },
  };
}

/** The small boundary used by the history service and isolated storage tests. */
export interface HistoryBackend {
  connect(): Promise<void>;
  createTtlIndex(keys: { expiresAt: 1 }, options: { expireAfterSeconds: 0 }): Promise<void>;
  close?(): Promise<void>;
  upsertReport(report: PersistedScan, ownerId: string, expiresAt: Date): Promise<void>;
  listReports(ownerId: string): Promise<HistorySummaryRow[]>;
  findReport(id: string, ownerId: string): Promise<PersistedScan | null>;
  deleteReport(id: string, ownerId: string): Promise<boolean>;
}

export function createMongoHistoryBackend(uri: string, collectionName = "scans"): HistoryBackend {
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 4000 });
  const collection = () => client.db().collection(collectionName);
  return {
    async connect() { await client.connect(); },
    async close() { await client.close(); },
    async createTtlIndex(keys, options) {
      await collection().createIndex(keys, options);
    },
    async upsertReport(report, ownerId, expiresAt) {
      await collection().updateOne(
        { id: report.id, ownerId },
        { $set: { ...report, ownerId, expiresAt } },
        { upsert: true },
      );
    },
    async listReports(ownerId) {
      return await collection().find({ ownerId, expiresAt: { $gt: new Date() } }, {
        projection: { _id: 0, id: 1, url: 1, createdAt: 1, issues: 1 },
      }).sort({ createdAt: -1 }).limit(20).toArray() as unknown as HistorySummaryRow[];
    },
    async findReport(id, ownerId) {
      return await collection().findOne(
        { id, ownerId, expiresAt: { $gt: new Date() } },
        { projection: { _id: 0, ownerId: 0, expiresAt: 0, screenshot: 0, screenshotWidth: 0, screenshotHeight: 0 } },
      ) as PersistedScan | null;
    },
    async deleteReport(id, ownerId) {
      const result = await collection().deleteOne({ id, ownerId, expiresAt: { $gt: new Date() } });
      return result.deletedCount > 0;
    },
  };
}

export function createHistoryStore(
  backendFactory: (uri: string) => HistoryBackend,
  onInitializationFailure: () => void = () => logger.warn("MongoDB unavailable; scans remain temporary. Check MONGODB_URI."),
) {
  let backend: HistoryBackend | undefined;
  let ready = false;

  return {
    hasHistory() { return ready; },
    async initializeHistory(uri = process.env.MONGODB_URI) {
      ready = false;
      backend = undefined;
      if (!uri) return;
      let candidate: HistoryBackend | undefined;
      try {
        candidate = backendFactory(uri);
        await candidate.connect();
        await candidate.createTtlIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
        backend = candidate;
        ready = true;
      } catch {
        try { await candidate?.close?.(); } catch { /* initialization remains unavailable */ }
        onInitializationFailure();
      }
    },
    async persistScan(scan: Scan, ownerId?: string) {
      if (!ready || !backend) return;
      if (!ownerId) {
        scan.warnings.push("Sign in to save this report. This scan is temporary.");
        return;
      }
      const {
        screenshot: _screenshot,
        screenshotWidth: _width,
        screenshotHeight: _height,
        snapshot: _snapshot,
        ...report
      } = scan as Scan & { snapshot?: unknown };
      try {
        await backend.upsertReport(report, ownerId, new Date(Date.now() + HISTORY_RETENTION_MS));
      } catch {
        scan.warnings.push("Scan history could not be saved. This report is temporary.");
      }
    },
    async loadHistory(ownerId: string) {
      if (!ready || !backend) return [];
      const rows = await backend.listReports(ownerId);
      return rows.map(row => ({
        id: String(row.id),
        url: String(row.url),
        createdAt: String(row.createdAt),
        total: row.issues.length,
      }));
    },
    async deleteReport(id: string, ownerId: string) {
      if (!ready || !backend) throw new Error("Saved report history is unavailable.");
      const deleted = await backend.deleteReport(id, ownerId);
      if (deleted) deleteOwnedRecord(id, ownerId);
      return deleted;
    },
    async loadReport(id: string, ownerId: string | undefined, local?: ScanRecord): Promise<Scan | undefined> {
      if (local) {
        if (local.ownerId && local.ownerId !== ownerId) return undefined;
        return local.scan;
      }
      if (!ready || !backend || !ownerId) return undefined;
      const row = await backend.findReport(id, ownerId);
      if (!row) return undefined;
      return {
        ...row,
        warnings: [...row.warnings, "Historical report only. The temporary screenshot and simulation snapshot have expired. Rescan to generate or verify fixes."],
      };
    },
  };
}

const history = createHistoryStore(createMongoHistoryBackend);
export const hasHistory = history.hasHistory;
export const initializeHistory = history.initializeHistory;
export const persistScan = history.persistScan;
export const loadHistory = history.loadHistory;
export const deleteHistoryReport = history.deleteReport;
export async function loadReport(id: string, ownerId?: string): Promise<Scan | undefined> {
  return history.loadReport(id, ownerId, getRecord(id));
}

export function deleteOwnedRecord(id: string, ownerId: string): boolean {
  const record = getRecord(id);
  if (!record || record.ownerId !== ownerId) return false;
  return scans.delete(id);
}
