import { chromium } from "playwright";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";

// A deterministic API fixture checks responsive CSS only. Real scan, auth,
// storage and provider integration are checked separately, not mocked here.
const base = process.env.TEST_APP_URL || "http://localhost:80";
const id = randomUUID();
const out = new URL("../../../generated-artifacts/copilot-tests/", import.meta.url);
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.route(`**/api/scan/${id}`, route => route.fulfill({ json: {
    id, url: "https://www.w3.org/WAI/demos/bad/before/home.html", createdAt: new Date().toISOString(),
    status: "complete", stage: "Complete", issues: [], warnings: [],
  } }));
  await page.goto(`${base}/?scan=${id}`);
  await page.getByTestId("text-total").waitFor({ timeout: 15000 });
  await page.getByTestId("tab-review").click();
  await page.getByTestId("text-checklist-progress").waitFor();
  const dimensions = await page.evaluate(() => ({
    viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
  }));
  assert.equal(dimensions.document, dimensions.viewport, JSON.stringify(dimensions));
  assert.equal(dimensions.body, dimensions.viewport, JSON.stringify(dimensions));
  assert.equal(await page.locator('[data-testid^="row-checklist-"]').count(), 9);
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: new URL("checklist-mobile.jpg", out).pathname, fullPage: true });
  console.log(JSON.stringify({ responsiveChecklist: "passed", dimensions, fixtureScope: "layout only" }));
} finally { await browser.close(); }
