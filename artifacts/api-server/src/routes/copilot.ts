import { Router, type Request } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getAuth } from "@clerk/express";
import {
  CreateScanBody, CreateScanResponse, GetScanResponse, GetConfigResponse,
  CheckProviderResponse,
  RemediateBody, RemediateResponse, VerifyFixBody, VerifyFixResponse, GetHistoryResponse,
  ExportScanReportParams, ExportScanReportResponse, GetHistoryCountResponse, GetHistoryRetentionResponse,
  UpdateHistoryRetentionBody, UpdateHistoryRetentionResponse,
  ClearHistoryResponse, type Scan,
} from "@workspace/api-zod";
import { parsePublicUrl, PublicError } from "../services/network";
import { reserveBrowser } from "../services/browser";
import { executeScan } from "../services/scanner";
import { getRecord, getOwnedRecord, putScan, hasHistory, loadHistory, countHistory, loadReport, deleteHistoryReport, clearHistoryReports, createSavedReportExport, getHistoryRetentionDays, setHistoryRetentionDays, HISTORY_RETENTION_OPTIONS, DEFAULT_HISTORY_RETENTION_DAYS } from "../services/store";
import { generateFix } from "../services/remediation";
import { checkProviderAccess, resolveProvider } from "../services/llm";
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
  res.json(GetConfigResponse.parse({ gemini: Boolean(process.env.GEMINI_API_KEY), provider, providerError, history: hasHistory(), retention: "New saved reports use your selected 1-, 3-, or 7-day retention period (7 days by default). Changing this setting affects new reports only; existing reports keep their original expiration. Screenshots and simulation snapshots are not saved. Without saved history, scans are temporary for up to 30 minutes or until server restart. Human-review choices are stored only in this browser." }));
});
router.post("/config/check", async (_req, res): Promise<void> => {
  let provider: ReturnType<typeof resolveProvider>;
  try {
    provider = resolveProvider();
  } catch (error) {
    if (!(error instanceof PublicError)) throw error;
    res.json(CheckProviderResponse.parse({
      status: "unavailable",
      provider: "configuration-error",
      message: error.message,
    }));
    return;
  }
  if (provider.provider === "deterministic") {
    res.json(CheckProviderResponse.parse({
      status: "unavailable",
      provider: "deterministic",
      message: "No AI provider is configured. Rule-based suggestions remain available.",
    }));
    return;
  }
  if (aiBusy >= 2) {
    res.json(CheckProviderResponse.parse({
      status: "unavailable",
      provider: provider.provider,
      message: "Another AI request is running. Try checking provider status again shortly.",
    }));
    return;
  }
  aiBusy++;
  try {
    await checkProviderAccess(provider);
    res.json(CheckProviderResponse.parse({
      status: "available",
      provider: provider.provider,
      message: `Live ${provider.provider === "gemini" ? "Gemini" : "OpenAI-compatible"} provider access verified.`,
    }));
  } catch (error) {
    if (!(error instanceof PublicError)) throw error;
    res.json(CheckProviderResponse.parse({
      status: "unavailable",
      provider: provider.provider,
      message: error.message,
    }));
  } finally {
    aiBusy--;
  }
});
router.post("/scan", async (req, res): Promise<void> => {
  const { url } = CreateScanBody.parse(req.body);
  const parsed = parsePublicUrl(url);
  const ownerId = authenticatedOwnerId(req);
  const historyAvailableAtStart = hasHistory();
  let historyRetentionDays = DEFAULT_HISTORY_RETENTION_DAYS;
  if (ownerId && historyAvailableAtStart) {
    try { historyRetentionDays = await getHistoryRetentionDays(ownerId); }
    catch { throw new PublicError("Saved report settings are unavailable. Try starting the scan again.", 503); }
  }
  const release = reserveBrowser();
  if (!release) throw new PublicError("The scanner is busy. Please wait for the current scans and try again.", 429);
  const scan: Scan = { id: randomUUID(), url: parsed.href, createdAt: new Date().toISOString(), status: "running", stage: "Validating URL", issues: [], warnings: [] };
  try {
    const record = putScan(scan, ownerId, historyAvailableAtStart, historyRetentionDays);
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
router.get("/history/count", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still run new scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to view saved scan history.", 401);
  try { res.json(GetHistoryCountResponse.parse({ count: await countHistory(ownerId) })); }
  catch { throw new PublicError("MongoDB history is unavailable. You can still manage scans.", 503); }
});
router.get("/history/retention", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still manage scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to manage saved report retention.", 401);
  let days: number;
  try { days = await getHistoryRetentionDays(ownerId); }
  catch { throw new PublicError("Saved report retention is unavailable. Try again shortly.", 503); }
  res.json(GetHistoryRetentionResponse.parse({ days, options: HISTORY_RETENTION_OPTIONS }));
});
router.put("/history/retention", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still manage scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to manage saved report retention.", 401);
  const { days } = UpdateHistoryRetentionBody.parse(req.body);
  let savedDays: number;
  try { savedDays = await setHistoryRetentionDays(ownerId, days); }
  catch { throw new PublicError("Saved report retention could not be updated. Try again shortly.", 503); }
  res.json(UpdateHistoryRetentionResponse.parse({ days: savedDays, options: HISTORY_RETENTION_OPTIONS }));
});
router.delete("/history", async (req, res): Promise<void> => {
  if (!hasHistory()) throw new PublicError("MongoDB history is unavailable. You can still run new scans.", 503);
  const ownerId = authenticatedOwnerId(req);
  if (!ownerId) throw new PublicError("Sign in to clear saved scan reports.", 401);
  try {
    const deleted = await clearHistoryReports(ownerId);
    res.json(ClearHistoryResponse.parse({ deleted }));
  } catch {
    throw new PublicError("MongoDB history is unavailable. You can still manage scans.", 503);
  }
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
