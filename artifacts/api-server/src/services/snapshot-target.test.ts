import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { IssueInput, Scan } from "@workspace/api-zod";
import { launchBrowser } from "./browser";
import { fingerprintElement, mapSnapshotTarget } from "./snapshot-target";
import { inertHtml, simulateFix } from "./verification";
import { putScan } from "./store";

test("original-to-clone mapping survives stripped selector attributes without changing the source DOM", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.route("**/*", r => r.abort());
    const html = '<main><aside><b>Free Penguins</b></aside><section><b align="left">Free Penguins</b></section></main>';
    await page.setContent(html);
    const fingerprint = await page.locator("section b").evaluate(fingerprintElement);
    const mapped = await mapSnapshotTarget(page, html, 'b[align="left"]', "<b>Free Penguins</b>", "fixture", fingerprint);
    assert.ok("html" in mapped);
    assert.equal(await page.locator("[data-copilot-target]").count(), 0, "source DOM must not be mutated");
    await page.setContent(inertHtml(mapped.html));
    assert.equal(await page.locator('b[align="left"]').count(), 0, "sanitizer removes original selector attribute");
    assert.equal(await page.locator('[data-copilot-target="fixture"]').textContent(), "Free Penguins");

    // If the selector has already stopped matching, use captured context rather
    // than selecting the first occurrence of repeated text.
    const moved = '<main><aside><b>Free Penguins</b></aside><section><b>Free Penguins</b></section></main>';
    const fallback = await mapSnapshotTarget(page, moved, 'b[align="left"]', "<b>Free Penguins</b>", "context", fingerprint);
    assert.ok("html" in fallback);
    await page.setContent(inertHtml(fallback.html));
    assert.equal(await page.locator('section > [data-copilot-target="context"]').count(), 1);
  } finally { await browser.close(); }
});

test("fingerprint fallback accepts one candidate and rejects ambiguous, missing and empty-text candidates", async () => {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.route("**/*", r => r.abort());
    for (const [html, expected] of [
      ["<main><b>Free Penguins</b></main>", "unique"],
      ["<main><b>Free Penguins</b><b>Free Penguins</b></main>", "ambiguous"],
      ["<main><b>Other content</b></main>", "missing"],
      ["<main><button></button></main>", "missing"],
    ]) {
      const result = await mapSnapshotTarget(page, html!, "#stale", expected === "missing" && html!.includes("button") ? "<button></button>" : "<b>Free Penguins</b>", "fixture");
      if (expected === "unique") assert.ok("html" in result);
      else {
        assert.ok("error" in result);
        assert.match(result.error, new RegExp(expected!));
      }
    }
  } finally { await browser.close(); }
});

const legacySelector = 'tr[height="25px"]:nth-child(2) > td[bgcolor="#A9B8BF"][width="150px"] > font[color="#41545D"][size="2"] > b';
function contrastFixture() {
  const scan: Scan = {
    id: randomUUID(), url: "https://example.com", createdAt: new Date().toISOString(),
    status: "complete", stage: "Complete", warnings: [], issues: [{
      id: "color-contrast", impact: "serious", help: "Text contrast", description: "Insufficient contrast",
      helpUrl: "https://dequeuniversity.com/rules/axe/color-contrast", wcag: ["wcag143"], principle: "Perceivable",
      nodes: [{ html: "<b>Free Penguins</b>", target: [legacySelector], summary: "Insufficient contrast" }],
    }],
  };
  const record = putScan(scan);
  record.snapshot = '<!doctype html><html lang="en"><head><title>Contrast fixture</title></head><body><main><table><tr><td>Header</td></tr><tr height="25px"><td bgcolor="#A9B8BF" width="150px"><font color="#41545D" size="2"><b>Free Penguins</b></font></td></tr></table></main></body></html>';
  const input: IssueInput = { scanId: scan.id, issueId: "color-contrast", nodeIndex: 0 };
  const fixId = randomUUID();
  const fix = {
    id: fixId, source: "openai-compatible" as const, original: "<b>Free Penguins</b>",
    suggested: '<b style="color:#2d3e46">Free Penguins</b>', explanation: "Contrast", correction: "Darker text",
    wcag: ["wcag143"], warning: "Fixture only",
  };
  record.fixes.set(fixId, { input, fix });
  return { record, fix, input: { ...input, fixId } };
}

test("legacy Free Penguins contrast is present before patching, resolved afterward, and has no regressions", async () => {
  const { record, fix, input } = contrastFixture();
  const original = record.snapshot;
  const result = await simulateFix(input);
  assert.equal(result.status, "Verified in simulation", JSON.stringify(result));
  assert.ok(result.before > 0, "must reproduce actual baseline violation");
  assert.ok(result.after < result.before);
  assert.deepEqual(result.regressions, []);
  assert.equal(record.snapshot, original, "stored original must not be patched");
  fix.suggested = fix.original;
  const unchanged = await simulateFix(input);
  assert.equal(unchanged.status, "Issue still detected", JSON.stringify(unchanged));
});

test("contrast verification refuses missing, ambiguous, sanitized-away, and zero-baseline targets", async () => {
  for (const scenario of ["missing", "ambiguous", "removed", "baseline"]) {
    const { record, input } = contrastFixture();
    const node = record.scan.issues[0]!.nodes[0]!;
    node.target = ["#stale"];
    if (scenario === "missing") record.snapshot = "<main><b>Other</b></main>";
    if (scenario === "ambiguous") record.snapshot = "<main><b>Free Penguins</b><b>Free Penguins</b></main>";
    if (scenario === "removed") {
      record.snapshot = '<main><iframe id="frame">Free Penguins</iframe></main>';
      node.html = '<iframe id="frame">Free Penguins</iframe>';
      node.target = ["#frame"];
    }
    if (scenario === "baseline") record.snapshot = '<html lang="en"><head><title>No contrast failure</title></head><body><main><b style="color:#000;background:#fff">Free Penguins</b></main></body></html>';
    const result = await simulateFix(input);
    assert.equal(result.status, "Verification unavailable", JSON.stringify({ scenario, result }));
    assert.match(result.explanation, /missing|ambiguous|removed|could not be reproduced/);
  }
});
