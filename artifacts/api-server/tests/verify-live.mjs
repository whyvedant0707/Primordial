import { chromium } from "playwright";
import assert from "node:assert/strict";

// Explicit opt-in smoke command: one real scan and one configured-provider call.
const base = process.env.TEST_APP_URL || "http://localhost:80";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/repl/tools/bin/chromium", headless: true });
try {
  const page = await browser.newPage();
  await page.goto(base);
  await page.getByTestId("input-url").fill("https://www.w3.org/WAI/demos/bad/before/home.html");
  await page.getByTestId("button-scan").click();
  await page.getByTestId("text-total").waitFor({ timeout: 60000 });
  await page.getByTestId("card-issue-image-alt").click();
  await page.getByTestId("button-generate-fix").click();
  await page.getByTestId("panel-fix").waitFor({ timeout: 25000 });
  const response = page.waitForResponse(r => r.url().endsWith("/api/verify") && r.request().method() === "POST");
  await page.getByTestId("button-verify").click();
  const result = await (await response).json();
  await page.getByTestId("status-verification").waitFor({ timeout: 25000 });
  assert.ok((await page.getByTestId("status-verification").innerText()).includes(result.status));
  if (result.status === "Verified in simulation") {
    assert.ok(result.before > 0);
    assert.ok(result.after < result.before);
    assert.deepEqual(result.regressions, []);
  } else {
    assert.ok(["Issue still detected", "Regression detected", "Verification unavailable"].includes(result.status));
  }
  console.log(JSON.stringify({ liveProviderAndVerificationUi: "passed", verification: result }));
} finally { await browser.close(); }
