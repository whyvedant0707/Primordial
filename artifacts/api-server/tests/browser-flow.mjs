import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import axe from "axe-core";

// Runs against the managed workflows through the shared proxy.
// Requires public network access for W3C's deliberately inaccessible test page.
const base = process.env.TEST_APP_URL || "http://localhost:80";
const out = new URL("../../../generated-artifacts/copilot-tests/", import.meta.url);
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, permissions: ["clipboard-read", "clipboard-write"] });
const page = await context.newPage();
const errors = [];
const requests = [];
page.on("pageerror", e => errors.push(e.message));
page.on("response", r => {
  if (r.url().includes("/api/")) requests.push({ url: r.url(), status: r.status() });
});
const report = {};
const testId = id => page.getByTestId(id);
try {
  await page.goto(base, { waitUntil: "networkidle" });
  const capabilities = await (await context.request.get(`${base}/api/config`)).json();
  await testId("input-url").fill("http://127.0.0.1");
  await testId("button-scan").click();
  await testId("text-scan-error").waitFor();
  assert.match(await testId("text-scan-error").innerText(), /public|private|blocked/i);
  report.privateUrlRejected = true;
  await testId("input-url").fill("https://www.w3.org/WAI/demos/bad/before/home.html");
  await testId("button-scan").click();
  await testId("text-total").waitFor({ timeout: 60000 });
  report.scanId = new URL(page.url()).searchParams.get("scan");
  report.failingRules = await testId("text-total").innerText();
  assert.ok(Number(report.failingRules) > 0);
  await testId("img-screenshot").waitFor();
  assert.ok(await testId("img-screenshot").evaluate(img => img.complete && img.naturalWidth === 1280));
  await testId("button-filter-critical").click();
  await testId("card-issue-image-alt").click();
  assert.ok(await page.locator('[data-testid^="box-node-"]').count() > 0);
  const originalHtml = await testId("text-node-html").innerText();
  await testId("select-node").selectOption("1");
  assert.notEqual(await testId("text-node-html").innerText(), originalHtml);
  await testId("select-principle").selectOption("Perceivable");
  assert.ok(await testId("card-issue-image-alt").count());
  report.filtersAndNodeSelection = true;
  await testId("button-generate-fix").click();
  await testId("panel-fix").waitFor({ timeout: 25000 });
  assert.match(await testId("text-fix-source").innerText(),
    capabilities.provider === "openai-compatible" ? /OpenAI-compatible/ :
      capabilities.provider === "gemini" ? /Gemini/ : /Deterministic/);
  assert.match(await testId("panel-fix").innerText(),
    capabilities.provider === "deterministic" ? /not an AI-generated fix/ : /AI suggestions can be incorrect/);
  await testId("button-copy-fix").click();
  assert.match(await testId("button-copy-fix").innerText(), /Copied/);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  assert.equal(copied, await testId("text-fix-suggested").innerText());
  await testId("button-copy-summary").click();
  assert.match(await testId("button-copy-summary").innerText(), /Copied/);
  await testId("button-copy-issue").click();
  assert.match(await testId("button-copy-issue").innerText(), /Copied/);
  report.copyActions = true;
  await testId("button-verify").click();
  await testId("status-verification").waitFor({ timeout: 30000 });
  report.verification = await testId("status-verification").innerText();
  assert.match(report.verification, /Verified in simulation|Issue still detected|Regression detected|Verification unavailable/);
  await page.screenshot({ path: new URL("results-desktop.jpg", out).pathname, fullPage: true });
  await testId("tab-review").click();
  await testId("button-mark-alt-meaning-reviewed").click();
  await testId("button-mark-keyboard-attention").click();
  await testId("button-mark-focus-order-na").click();
  await page.reload({ waitUntil: "networkidle" });
  await testId("text-total").waitFor({ timeout: 15000 });
  await testId("tab-review").click();
  for (const id of ["button-mark-alt-meaning-reviewed", "button-mark-keyboard-attention", "button-mark-focus-order-na"])
    assert.equal(await testId(id).getAttribute("aria-pressed"), "true");
  report.reviewPersistsAcrossReload = true;
  await testId("tab-scan").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: new URL("results-mobile.jpg", out).pathname, fullPage: true });
  report.mobileWidth = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(report.mobileWidth.document <= report.mobileWidth.viewport, JSON.stringify(report.mobileWidth));
  await testId("tab-guide").click();
  assert.match(await page.locator("main").innerText(), /WCAG|automation|simulation/i);
  report.guideWorks = true;
  await page.addScriptTag({ content: axe.source });
  const accessibility = await page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.map(n => n.target) })));
  report.guideAccessibility = accessibility;
  assert.deepEqual(errors, [], errors.join("\n"));
  report.requests = requests;
  report.browserErrors = errors;
  await writeFile(new URL("browser-report.json", out), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
}
