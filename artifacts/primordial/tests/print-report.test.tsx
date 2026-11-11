import { describe, expect, it } from "vitest";
import type { SavedReportExport } from "@workspace/api-client-react";
import { createPrintReadyReport } from "../src/app/components/print-report";

const report: SavedReportExport = {
  formatVersion: 1,
  scope: "One public page in its initial state.",
  disclaimer: "These automated findings are not a conformance certification.",
  scan: {
    title: "Example <page>",
    url: "https://example.test/?x=1&y=2",
    createdAt: "2026-11-09T12:00:00.000Z",
    passes: 14,
    incomplete: 1,
    durationMs: 2500,
    issues: [{
      id: "button-name",
      impact: "critical",
      help: "Buttons must have names",
      description: "The <button> has no accessible name.",
      helpUrl: "https://example.test/rule?x=1&y=2",
      wcag: ["4.1.2"],
      principle: "Robust",
      nodes: [
        { html: "<button onclick='alert(1)'></button>", target: ["#first"], summary: "First button is unnamed." },
        { html: "<button id='second'></button>", target: ["#second"], summary: "Second button is unnamed." },
      ],
    }],
  },
};

describe("print-ready saved report", () => {
  it("includes scope, disclaimer, every finding detail, and printable styling", () => {
    const html = createPrintReadyReport(report);

    expect(html).toContain("One public page in its initial state.");
    expect(html).toContain("not a conformance certification");
    expect(html).toContain("Rules passed");
    expect(html).toContain("Rules needing manual check");
    expect(html).toContain("button-name");
    expect(html).toContain("WCAG criteria");
    expect(html).toContain("4.1.2");
    expect(html).toContain("First button is unnamed.");
    expect(html).toContain("Second button is unnamed.");
    expect(html.match(/<section class="node">/g)).toHaveLength(2);
    expect(html).toContain("@media print");
  });

  it("escapes report content and does not add scripts, screenshots, or internal state", () => {
    const html = createPrintReadyReport(report);

    expect(html).toContain("Example &lt;page&gt;");
    expect(html).toContain("x=1&amp;y=2");
    expect(html).toContain("&lt;button onclick=&#39;alert(1)&#39;&gt;&lt;/button&gt;");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<button onclick=");
    expect(html).not.toContain("screenshot");
    expect(html).not.toContain("snapshot");
    expect(html).not.toContain("humanObservations");
    expect(html).not.toContain("box");
  });

  it("explains that a scan with no findings is not an accessibility certification", () => {
    const html = createPrintReadyReport({
      ...report,
      scan: { ...report.scan, issues: [] },
    });

    expect(html).toContain("No automated violations were detected");
    expect(html).toContain("This is not a determination that the page is accessible.");
    expect(html).toContain("not a conformance certification");
  });
});
