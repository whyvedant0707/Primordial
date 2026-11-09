import axe from "axe-core";
import type { Issue, Scan } from "@workspace/api-zod";
import type { Browser } from "playwright";
import { launchBrowser } from "./browser";
import { createSafeProxy, parsePublicUrl, resolvePublic, PublicError } from "./network";
import { type ScanRecord, persistScan } from "./store";
import { logger } from "../lib/logger";
import { fingerprintElement } from "./snapshot-target";

export const AXE_OPTIONS = { runOnly: { type: "tag" as const, values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] }, timeout: 12000 };
function principle(tags: string[]): Issue["principle"] {
  const tag = tags.find(t => /^wcag[1-4]\d\d$/.test(t));
  return ({ "1": "Perceivable", "2": "Operable", "3": "Understandable", "4": "Robust" } as const)[tag?.[4] as "1"] ?? "Other";
}

export async function executeScan(record: ScanRecord, release: () => void) {
  const scan = record.scan;
  const started = Date.now();
  let browser: Browser | undefined;
  let proxy: Awaited<ReturnType<typeof createSafeProxy>> | undefined;
  let expired = false;
  const timer = setTimeout(() => { expired = true; void browser?.close(); proxy?.close(); }, 45000);
  try {
    const url = parsePublicUrl(scan.url);
    await resolvePublic(url.hostname);
    scan.stage = "Launching browser";
    proxy = await createSafeProxy();
    browser = await launchBrowser(proxy.url);
    if (expired) throw new Error("Scan time limit reached");
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
      serviceWorkers: "block", acceptDownloads: false,
    });
    await context.route("**/*", async route => {
      try {
        if (!["GET", "HEAD"].includes(route.request().method())) { await route.abort(); return; }
        const u = new URL(route.request().url());
        if (u.protocol === "data:" || u.protocol === "blob:") {
          if (route.request().isNavigationRequest()) await route.abort(); else await route.continue();
          return;
        }
        parsePublicUrl(u.href);
        // Connection-time DNS validation and address pinning are enforced by the proxy.
        await route.continue();
      } catch { await route.abort(); }
    });
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage();
    page.setDefaultTimeout(6000);
    scan.stage = "Loading website";
    const response = await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 20000 });
    if (!response || response.status() >= 400) throw new PublicError("The website returned an error or blocked automated access. Try another public page.");
    await page.waitForTimeout(900);
    // Freeze animation so coordinates and screenshot use the same static layout.
    await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}html{scroll-behavior:auto!important}" });
    scan.title = (await page.title()).slice(0, 300);
    parsePublicUrl(page.url());
    scan.stage = "Running accessibility checks";
    await page.addScriptTag({ content: axe.source });
    const results = await page.evaluate(async options => {
      // axe is injected in this isolated browser, not in the user's UI.
      return await (window as any).axe.run(document, options);
    }, AXE_OPTIONS) as axe.AxeResults;
    scan.passes = results.passes.length;
    scan.incomplete = results.incomplete.length;
    if (results.incomplete.length) scan.warnings.push(`${results.incomplete.length} checks require manual assessment; they are not counted as confirmed violations.`);
    if (results.violations.reduce((n, v) => n + v.nodes.length, 0) > 500)
      throw new PublicError("This page has too many affected elements for the MVP. Scan a smaller public page.");
    scan.issues = [];
    record.targetFingerprints = new Map();
    for (const violation of results.violations) {
      const nodes: Issue["nodes"] = [];
      for (const node of violation.nodes) {
        const target = node.target.map(t => typeof t === "string" ? t : JSON.stringify(t));
        let box: Issue["nodes"][number]["box"];
        // Nested frames/shadow selectors cannot be mapped reliably by CSS locator.
        if (target.length === 1 && typeof node.target[0] === "string") {
          try {
            const found = page.locator(target[0]!);
            if (await found.count() === 1) {
              const fingerprint = await found.evaluate(fingerprintElement);
              // Large document-root targets must not multiply retained snapshot
              // memory across hundreds of issue nodes.
              if (JSON.stringify(fingerprint).length <= 20000)
                record.targetFingerprints.set(`${violation.id}:${nodes.length}`, fingerprint);
              const b = await found.boundingBox({ timeout: 500 });
              if (b && b.width > 0 && b.height > 0 && b.y < 800 && b.x < 1280 && b.x + b.width > 0 && b.y + b.height > 0)
                box = { x: Math.max(0, b.x), y: Math.max(0, b.y), width: Math.min(1280, b.x + b.width) - Math.max(0, b.x), height: Math.min(800, b.y + b.height) - Math.max(0, b.y) };
            }
          } catch { /* Unmapped nodes are explicitly returned without coordinates. */ }
        }
        nodes.push({ html: node.html.slice(0, 16000), target, summary: (node.failureSummary ?? "").slice(0, 5000), ...(box ? { box } : {}) });
      }
      scan.issues.push({
        id: violation.id, impact: violation.impact ?? "unknown", help: violation.help,
        description: violation.description, helpUrl: violation.helpUrl,
        wcag: violation.tags.filter(t => /^wcag[1-4]\d\d+$/.test(t)), principle: principle(violation.tags), nodes,
      });
    }
    scan.stage = "Preparing results";
    record.screenshot = await page.screenshot({ type: "jpeg", quality: 72, fullPage: false, timeout: 6000 });
    scan.screenshot = `/api/scan/${scan.id}/screenshot`;
    scan.screenshotWidth = 1280;
    scan.screenshotHeight = 800;
    // Capture the rendered DOM, then verification sanitizes it before loading.
    const content = await page.content();
    if (Buffer.byteLength(content) <= 2_000_000) record.snapshot = content;
    else scan.warnings.push("This page is too large for isolated fix simulation. Scan results are still available.");
    scan.warnings.push("Only the initial page state is scanned. Off-screen, nested-frame and shadow-DOM elements may not have screenshot coordinates. Automated checks do not establish WCAG compliance.");
    scan.status = "complete";
    scan.stage = "Complete";
    scan.durationMs = Date.now() - started;
    await persistScan(scan, record.ownerId);
  } catch (e) {
    scan.status = "failed";
    scan.stage = "Failed";
    scan.error = e instanceof PublicError ? e.message :
      expired || e instanceof Error && /timeout|closed/i.test(e.message) ?
        "The scan timed out. The website may be slow or block automated browsers. Try another public page." :
        "The browser could not scan this website. It may block automated access, require sign-in, or be unavailable.";
    logger.warn({ scanId: scan.id, errorType: e instanceof Error ? e.name : "Unknown" }, "Scan failed");
    scan.issues = [];
  } finally {
    clearTimeout(timer);
    await browser?.close().catch(() => {});
    proxy?.close();
    release();
  }
}
