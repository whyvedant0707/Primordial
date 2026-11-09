import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  CreateScanBody, CreateScanResponse, GetScanResponse, GetConfigResponse,
  RemediateBody, RemediateResponse, VerifyFixBody, VerifyFixResponse, GetHistoryResponse,
  ExportScanReportParams, ExportScanReportResponse, type Scan,
} from "@workspace/api-zod";
import { parsePublicUrl, PublicError } from "../services/network";
import { reserveBrowser } from "../services/browser";
import { executeScan } from "../services/scanner";
import { getRecord, getOwnedRecord, putScan, hasHistory, loadHistory, loadReport, deleteHistoryReport, createSavedReportExport } from "../services/store";
import { generateFix } from "../services/remediation";
import { resolveProvider } from "../services/llm";
import { simulateFix } from "../services/verification";

const router = Router();
function authenticatedOwnerId(req: Request): string | undefined {
  try { return getAuth(req).userId ?? undefined; }
  catch { return undefined; }
}

// Bounded per-client request windows plus global browser/AI caps. Does not
// trust caller-supplied forwarding headers as an identity source.
const windows = new Map<string, { count: number; expires: number }>();
let aiBusy = 0;
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // Browsers must submit mutations from this same origin. Non-browser clients
  // can omit Origin; URL targets remain guarded independently.
  if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
    const origin = req.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== req.get("host")) throw new Error();
      } catch { res.status(403).json({ error: "Cross-origin actions are not allowed." }); return; }
    }
  }
  if (req.method !== "POST") { next(); return; }
  const now = Date.now();
  for (const [key, item] of windows) if (item.expires < now) windows.delete(key);
  const key = req.ip ?? "unknown";
  const item = windows.get(key) ?? { count: 0, expires: now + 60000 };
  item.count++;
  windows.set(key, item);
  if (item.count > 20 || windows.size > 1000) { res.status(429).json({ error: "Request limit reached. Wait a minute before trying again." }); return; }
  next();
});
router.get("/config", (_req, res) => {
  let provider: "gemini" | "openai-compatible" | "deterministic" | "configuration-error";
  let providerError: string | undefined;
  try { provider = resolveProvider().provider; }
  catch (error) {
    if (!(error instanceof PublicError)) throw error;
    provider = "configuration-error";
    providerError = error.message;
  }
  res.json(GetConfigResponse.parse({ gemini: Boolean(process.env.GEMINI_API_KEY), provider, providerError, history: hasHistory(), retention: "Without saved history, reports and screenshots are temporary: up to 12 scans for 30 minutes or until server restart. When saved history is available, reports are retained for 7 days; screenshots and simulation snapshots are not saved. Human-review choices are stored only in this browser." }));
});
router.post("/scan", async (req, res): Promise<void> => {
  const { url } = CreateScanBody.parse(req.body);
  const parsed = parsePublicUrl(url);
  const release = reserveBrowser();
  if (!release) throw new PublicError("The scanner is busy. Please wait for the current scans and try again.", 429);
  const scan: Scan = { id: randomUUID(), url: parsed.href, createdAt: new Date().toISOString(), status: "running", stage: "Validating URL", issues: [], warnings: [] };
  try {
    const record = putScan(scan, authenticatedOwnerId(req));
    res.status(202).json(CreateScanResponse.parse(scan));
    void executeScan(record, release);
  } catch (e) { release(); throw e; }
});
router.get("/scan/:id", async (req, res): Promise<void> => {
  const id = z.string().uuid().parse(req.params.id);
  const report = await loadReport(id, authenticatedOwnerId(req));
  if (!report) throw new PublicError("Scan not found or expired. Run a new scan.", 404);
  res.json(GetScanResponse.parse(report));
});
router.get("/scan/:id/export", async (req, res): Promise<void> => {
  const { id } = ExportScanReportParams.parse(req.params);
  const report = await loadReport(id, authenticatedOwnerId(req));
  if (!report) throw new PublicError("Scan not found or expired. Run a new scan.", 404);
  if (report.status !== "complete") throw new PublicError("Only completed scans can be exported.", 409);
  const exported = ExportScanReportResponse.parse(createSavedReportExport(report));
  res.attachment(`accessibility-report-${id}.json`);
  res.json(exported);
});
router.get("/scan/:id/screenshot", (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const record = getRecord(id);
  const ownerId = authenticatedOwnerId(req);
  if (record?.ownerId && record.ownerId !== ownerId) throw new PublicError("Screenshot expired. Run a new scan.", 404);
  const image = record?.screenshot;
  if (!image) throw new PublicError("Screenshot expired. Run a new scan.", 404);
  res.type("image/jpeg").send(image);
});
router.get("/history", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still run new scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to view saved scan history.", 401);
  try { res.json(GetHistoryResponse.parse(await loadHistory(ownerId))); }
  catch { throw new PublicError("MongoDB history is unavailable. You can still run new scans.", 503); }
});
router.delete("/history/:id", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still run new scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to delete saved scan reports.", 401);
  const id = z.string().uuid().parse(req.params.id);
  let deleted: boolean;
  try { deleted = await deleteHistoryReport(id, ownerId); }
  catch { throw new PublicError("MongoDB history is unavailable. You can still manage scans.", 503); }
  if (!deleted) throw new PublicError("Scan not found or expired. Run a new scan.", 404);
  res.sendStatus(204);
});
router.post("/remediate", async (req, res): Promise<void> => {
  const input = RemediateBody.parse(req.body);
  if (!getOwnedRecord(input.scanId, authenticatedOwnerId(req)))
    throw new PublicError("Scan not found or expired. Run a new scan.", 404);
  if (aiBusy >= 2) throw new PublicError("The remediation service is busy. Try again shortly.", 429);
  aiBusy++;
  try { res.json(RemediateResponse.parse(await generateFix(input))); }
  finally { aiBusy--; }
});
router.post("/verify", async (req, res): Promise<void> => {
  const input = VerifyFixBody.parse(req.body);
  if (!getOwnedRecord(input.scanId, authenticatedOwnerId(req)))
    throw new PublicError("Scan not found or expired. Run a new scan.", 404);
  const release = reserveBrowser();
  if (!release) throw new PublicError("Browser capacity is busy. Try verification again shortly.", 429);
  try { res.json(VerifyFixResponse.parse(await simulateFix(input))); }
  finally { release(); }
});
export default router;
