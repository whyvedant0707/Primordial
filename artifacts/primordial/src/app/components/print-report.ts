import type { SavedReportExport } from "@workspace/api-client-react";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

function textBlock(label: string, value: string): string {
  return `<section class="detail"><h4>${escapeHtml(label)}</h4><p>${escapeHtml(value)}</p></section>`;
}

export function createPrintReadyReport(report: SavedReportExport): string {
  const { scan } = report;
  const title = scan.title || scan.url;
  const createdAt = new Date(scan.createdAt).toLocaleString();
  const issueSections = scan.issues.map((issue, issueIndex) => {
    const nodes = issue.nodes.map((node, nodeIndex) => `
      <section class="node">
        <h4>Affected element ${nodeIndex + 1} of ${issue.nodes.length}</h4>
        ${textBlock("Selector", node.target.join(" "))}
        ${node.summary ? textBlock("Finding details", node.summary) : ""}
        <h5>HTML captured for this finding</h5>
        <pre>${escapeHtml(node.html)}</pre>
      </section>`).join("");
    return `
      <article class="finding">
        <div class="finding-heading">
          <span class="severity severity-${escapeHtml(issue.impact)}">${escapeHtml(issue.impact)}</span>
          <span>Finding ${issueIndex + 1} of ${scan.issues.length}</span>
        </div>
        <h3>${escapeHtml(issue.help)}</h3>
        <p>${escapeHtml(issue.description)}</p>
        <dl class="metadata">
          <div><dt>Rule</dt><dd>${escapeHtml(issue.id)}</dd></div>
          <div><dt>Principle</dt><dd>${escapeHtml(issue.principle)}</dd></div>
          <div><dt>WCAG criteria</dt><dd>${escapeHtml(issue.wcag.length ? issue.wcag.join(", ") : "Not specified")}</dd></div>
          <div><dt>Rule reference</dt><dd>${escapeHtml(issue.helpUrl)}</dd></div>
        </dl>
        ${nodes}
      </article>`;
  }).join("");

  const scanDetails = [
    typeof scan.passes === "number" ? `<div><dt>Rules passed</dt><dd>${scan.passes}</dd></div>` : "",
    typeof scan.incomplete === "number" ? `<div><dt>Rules needing manual check</dt><dd>${scan.incomplete}</dd></div>` : "",
    typeof scan.durationMs === "number" ? `<div><dt>Scan duration</dt><dd>${(scan.durationMs / 1000).toFixed(1)} seconds</dd></div>` : "",
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Accessibility report — ${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, Helvetica, sans-serif; color: #172033; background: #fff; }
    body { max-width: 900px; margin: 0 auto; padding: 40px 32px; line-height: 1.55; }
    h1, h2, h3, h4, h5, p { margin-top: 0; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin-bottom: 10px; }
    h3 { font-size: 18px; margin: 12px 0 6px; }
    h4 { font-size: 12px; margin-bottom: 4px; text-transform: uppercase; letter-spacing: .04em; color: #46536a; }
    h5 { font-size: 12px; margin: 14px 0 6px; }
    a, .url { overflow-wrap: anywhere; }
    .eyebrow { margin-bottom: 8px; color: #475569; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    .url, .muted { color: #475569; }
    .summary, .scope, .disclaimer, .finding { border: 1px solid #cbd5e1; border-radius: 8px; padding: 18px; margin-top: 18px; }
    .summary, .scope { background: #f8fafc; }
    .disclaimer { border-color: #b45309; background: #fff7ed; }
    .metadata { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 16px 0; }
    .metadata div, .scan-metadata div { min-width: 0; }
    dt { color: #475569; font-size: 12px; font-weight: 700; }
    dd { margin: 2px 0 0; overflow-wrap: anywhere; }
    .scan-metadata { display: flex; flex-wrap: wrap; gap: 20px; margin-top: 18px; }
    .finding { break-inside: avoid-page; }
    .finding-heading { display: flex; justify-content: space-between; gap: 16px; color: #475569; font-size: 12px; }
    .severity { font-weight: 700; text-transform: capitalize; }
    .severity-critical, .severity-serious { color: #9f1239; }
    .severity-moderate { color: #92400e; }
    .severity-minor { color: #1d4ed8; }
    .node { border-top: 1px solid #e2e8f0; margin-top: 16px; padding-top: 14px; break-inside: avoid; }
    .detail { margin: 10px 0; }
    pre { white-space: pre-wrap; overflow-wrap: anywhere; background: #f1f5f9; border: 1px solid #cbd5e1; border-radius: 5px; padding: 10px; font: 11px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; }
    .empty { margin-top: 18px; padding: 18px; border: 1px solid #cbd5e1; border-radius: 8px; }
    @media print {
      body { max-width: none; padding: 0; font-size: 10pt; }
      h1 { font-size: 22pt; }
      .scope, .summary, .disclaimer, .finding { border-radius: 0; }
      .finding { margin-top: 12pt; padding: 12pt; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <header>
    <p class="eyebrow">Accessibility Copilot · Automated scan report</p>
    <h1>${escapeHtml(title)}</h1>
    <p class="url">${escapeHtml(scan.url)}</p>
    <dl class="scan-metadata">
      <div><dt>Scanned</dt><dd>${escapeHtml(createdAt)}</dd></div>
      <div><dt>Failing rules</dt><dd>${scan.issues.length}</dd></div>
      ${scanDetails}
    </dl>
  </header>
  <section class="scope" aria-labelledby="scope-heading">
    <h2 id="scope-heading">Scan scope</h2>
    <p>${escapeHtml(report.scope)}</p>
  </section>
  <section class="disclaimer" aria-labelledby="disclaimer-heading">
    <h2 id="disclaimer-heading">Important limitation</h2>
    <p>${escapeHtml(report.disclaimer)}</p>
  </section>
  <section aria-labelledby="findings-heading">
    <h2 id="findings-heading" style="margin-top:24px">Findings (${scan.issues.length})</h2>
    ${issueSections || '<p class="empty">No automated violations were detected in this scan. This is not a determination that the page is accessible.</p>'}
  </section>
</body>
</html>`;
}
