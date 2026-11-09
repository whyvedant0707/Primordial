"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Download, ExternalLink, FlaskConical, Loader2, Sparkles, Wrench } from "lucide-react";
import { exportScanReport } from "@workspace/api-client-react";
import type { Capabilities, Fix, Issue, IssueImpact, Scan, Verification } from "@workspace/api-client-react";
import CopyButton from "./copy-button";
import { readReview } from "./review-data";
import WcagGuidance from "./wcag-guidance";
import { errorMessage, IMPACT_ORDER, IMPACT_STYLE, PRINCIPLES, countBy, fixKey, healthEstimate, issueText, screenshotSrc, summaryText } from "./lib";

export type FixState = { loading: boolean; fix?: Fix; error?: string };
export type VerifyState = { loading: boolean; result?: Verification; error?: string };

type Props = {
  scan: Scan;
  provider: Capabilities["provider"] | null;
  providerError?: string;
  onOpenProviderSetup: () => void;
  fixes: Record<string, FixState>;
  verifs: Record<string, VerifyState>;
  onGenerate: (issueId: string, nodeIndex: number) => void;
  onVerify: (issueId: string, nodeIndex: number, fixId: string) => void;
};

function Impact({ impact }: { impact: IssueImpact }) {
  const s = IMPACT_STYLE[impact];
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${s.chip}`}><span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden />{s.label}</span>;
}

export default function Results({ scan, provider, providerError, onOpenProviderSetup, fixes, verifs, onGenerate, onVerify }: Props) {
  const [impacts, setImpacts] = useState<Set<IssueImpact>>(new Set());
  const [principle, setPrinciple] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(scan.issues[0]?.id ?? null);
  const [nodeIndex, setNodeIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => { setSelected(scan.issues[0]?.id ?? null); setNodeIndex(0); setImpacts(new Set()); setPrinciple("all"); }, [scan.id, scan.issues]);

  const counts = countBy(scan.issues);
  const totalNodes = scan.issues.reduce((s, i) => s + i.nodes.length, 0);
  const health = healthEstimate(scan.issues);
  const filtered = useMemo(() => scan.issues
    .filter((i) => impacts.size === 0 || impacts.has(i.impact))
    .filter((i) => principle === "all" || i.principle === principle)
    .sort((a, b) => IMPACT_ORDER.indexOf(a.impact) - IMPACT_ORDER.indexOf(b.impact)), [scan.issues, impacts, principle]);
  const issue = scan.issues.find((i) => i.id === selected) ?? null;

  function toggleImpact(i: IssueImpact) {
    setImpacts((prev) => { const n = new Set(prev); if (n.has(i)) n.delete(i); else n.add(i); return n; });
  }
  function choose(i: Issue) { setSelected(i.id); setNodeIndex(0); }

  async function downloadReport() {
    setExporting(true);
    setExportError(null);
    try {
      const report = await exportScanReport(scan.id);
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const host = new URL(scan.url).hostname.replace(/[^a-z0-9.-]/gi, "-");
      link.href = objectUrl;
      link.download = `accessibility-report-${host}-${scan.createdAt.slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (e) {
      setExportError(errorMessage(e, "The report could not be exported."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Summary */}
      <section aria-label="Scan summary" className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-ink-3">Scan complete</p>
            <h2 className="mt-1 truncate text-lg font-semibold" data-testid="text-scan-title">{scan.title || scan.url}</h2>
            <a href={scan.url} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-1 break-all font-mono text-xs text-brand hover:underline" data-testid="link-scanned-url">
              {scan.url}<ExternalLink size={12} aria-hidden /><span className="sr-only">(opens in new tab)</span>
            </a>
            <p className="mt-1 text-xs text-ink-3">
              {new Date(scan.createdAt).toLocaleString()}
              {typeof scan.durationMs === "number" ? ` · ${(scan.durationMs / 1000).toFixed(1)}s` : ""}
              {typeof scan.passes === "number" ? ` · ${scan.passes} rules passed` : ""}
              {typeof scan.incomplete === "number" ? ` · ${scan.incomplete} need manual check` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <CopyButton text={() => summaryText(scan, readReview(scan.id))} label="Copy summary" testId="button-copy-summary" />
            <button type="button" onClick={() => void downloadReport()} disabled={exporting} data-testid="button-export-report"
              className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-60">
              {exporting ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Download size={14} aria-hidden />}
              {exporting ? "Preparing export..." : "Download report"}
            </button>
          </div>
        </div>
        {exportError && <p role="alert" className="mt-3 text-sm text-red-800" data-testid="text-export-error">{exportError}</p>}
        <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-line bg-line md:grid-cols-4">
          <div className="bg-card p-4"><dt className="text-xs text-ink-3">Failing rules</dt><dd className="mt-1 font-mono text-2xl font-medium" data-testid="text-total">{scan.issues.length}</dd><dd className="text-xs text-ink-3">{totalNodes} elements</dd></div>
          <div className="bg-card p-4"><dt className="text-xs text-ink-3">Critical / serious</dt><dd className="mt-1 font-mono text-2xl font-medium text-red-700" data-testid="text-high">{counts.critical + counts.serious}</dd><dd className="text-xs text-ink-3">{counts.critical} critical · {counts.serious} serious</dd></div>
          <div className="bg-card p-4"><dt className="text-xs text-ink-3">Moderate / minor</dt><dd className="mt-1 font-mono text-2xl font-medium" data-testid="text-low">{counts.moderate + counts.minor}</dd><dd className="text-xs text-ink-3">{counts.moderate} moderate · {counts.minor} minor</dd></div>
          <div className="bg-card p-4">
            <dt className="text-xs text-ink-3">Internal estimated indicator</dt>
            <dd className="mt-1 font-mono text-2xl font-medium" data-testid="text-health">{health}<span className="text-sm text-ink-3">/100</span></dd>
            <dd className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden><div className="h-full bg-brand" style={{ width: `${health}%` }} /></dd>
            <dd className="mt-1 text-[11px] leading-tight text-ink-3">Not an official WCAG score.</dd>
          </div>
        </dl>
        <p className="mt-3 flex items-start gap-2 text-xs text-ink-2"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-orange-600" aria-hidden />Automated checks find only part of WCAG 2.1 AA failures. Complete the Human review tab before drawing conclusions.</p>
        {scan.warnings.length > 0 && (
          <ul className="mt-3 space-y-1 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900" data-testid="list-warnings">
            {scan.warnings.map((w) => <li key={w}>{w}</li>)}
          </ul>
        )}
      </section>

      {scan.issues.length === 0 ? (
        <section className="card p-8 text-center">
          <h3 className="font-semibold">No automated violations detected</h3>
          <p className="mx-auto mt-2 max-w-lg text-sm text-ink-2">Axe-core found no failing WCAG A/AA rules on this page in its initial state. This does not mean the page is accessible. Use the Human review checklist to cover what automation cannot judge.</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Issue list */}
          <section aria-labelledby="issues-h" className="min-w-0 lg:col-span-5">
            <div className="card p-4">
              <h3 id="issues-h" className="text-sm font-semibold">Violations</h3>
              <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by severity">
                {IMPACT_ORDER.filter((i) => counts[i] > 0).map((i) => (
                  <button key={i} type="button" aria-pressed={impacts.has(i)} onClick={() => toggleImpact(i)} data-testid={`button-filter-${i}`}
                    className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${impacts.has(i) ? "border-brand bg-brand-soft text-ink" : "border-line text-ink-2 hover:border-ink-3/40"}`}>
                    <span className={`h-2 w-2 rounded-full ${IMPACT_STYLE[i].dot}`} aria-hidden />{IMPACT_STYLE[i].label}<span className="font-mono text-ink-3">{counts[i]}</span>
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-xs text-ink-2">
                WCAG principle
                <select value={principle} onChange={(e) => setPrinciple(e.target.value)} data-testid="select-principle"
                  className="rounded-md border border-line bg-card px-2 py-1 text-xs text-ink">
                  <option value="all">All principles</option>
                  {PRINCIPLES.map((p) => <option key={p} value={p}>{p} ({scan.issues.filter((i) => i.principle === p).length})</option>)}
                </select>
              </label>
            </div>
            <ul className="mt-3 space-y-2">
              {filtered.length === 0 && <li className="card p-5 text-sm text-ink-2">No violations match these filters. <button type="button" className="text-brand underline" onClick={() => { setImpacts(new Set()); setPrinciple("all"); }} data-testid="button-clear-filters">Clear filters</button></li>}
              {filtered.map((i) => {
                const active = i.id === selected;
                return (
                  <li key={i.id}>
                    <button type="button" onClick={() => choose(i)} aria-current={active ? "true" : undefined} data-testid={`card-issue-${i.id}`}
                      className={`card w-full p-3.5 text-left ${active ? "!border-brand ring-1 ring-brand" : "hover:border-ink-3/40"}`}>
                      <div className="flex items-center justify-between gap-2"><Impact impact={i.impact} /><span className="font-mono text-[11px] text-ink-3">{i.nodes.length} el.</span></div>
                      <p className="mt-2 text-sm font-medium leading-snug">{i.help}</p>
                      <p className="mt-1 font-mono text-[11px] text-ink-3">{i.id} · {i.principle}{i.wcag.length ? ` · ${i.wcag.join(", ")}` : ""}</p>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Locator + detail */}
          <div className="min-w-0 space-y-5 lg:col-span-7">
            <Locator scan={scan} issue={issue} nodeIndex={nodeIndex} onPick={setNodeIndex} />
            {issue && <Detail key={issue.id} issue={issue} scanId={scan.id} nodeIndex={nodeIndex} setNodeIndex={setNodeIndex} provider={provider} providerError={providerError} onOpenProviderSetup={onOpenProviderSetup}
              fixes={fixes} verifs={verifs} onGenerate={onGenerate} onVerify={onVerify} />}
          </div>
        </div>
      )}
    </div>
  );
}

function Locator({ scan, issue, nodeIndex, onPick }: { scan: Scan; issue: Issue | null; nodeIndex: number; onPick: (n: number) => void }) {
  const src = screenshotSrc(scan.screenshot);
  const W = scan.screenshotWidth, H = scan.screenshotHeight;
  const mappable = !!(W && H);
  const boxes = issue && mappable ? issue.nodes.map((n, idx) => ({ n, idx })).filter(({ n }) => n.box && n.box.width > 0 && n.box.height > 0) : [];
  const currentHasBox = !!issue?.nodes[nodeIndex]?.box;

  return (
    <section aria-labelledby="loc-h" className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h3 id="loc-h" className="text-sm font-semibold">Visual locator</h3>
        <span className="text-xs text-ink-3" data-testid="text-locator-status">
          {!src ? "No screenshot captured" : !mappable ? "Screenshot dimensions unavailable — boxes not drawn" : issue ? `${boxes.length} of ${issue.nodes.length} elements located` : ""}
        </span>
      </div>
      {src ? (
        <div className="max-h-[520px] overflow-auto bg-[#eceef5]">
          <div className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={`Screenshot of ${scan.url} as captured during the scan`} className="block w-full" data-testid="img-screenshot" />
            {boxes.map(({ n, idx }) => {
              const b = n.box!;
              const active = idx === nodeIndex;
              return (
                <button key={idx} type="button" onClick={() => onPick(idx)} aria-label={`Select element ${idx + 1}: ${n.target.join(" ")}`} data-testid={`box-node-${idx}`}
                  className={`absolute rounded-sm border-2 ${IMPACT_STYLE[issue!.impact].box} ${active ? "z-10 outline-2 outline-offset-2 outline-ink" : "opacity-70"}`}
                  style={{ left: `${(b.x / W!) * 100}%`, top: `${(b.y / H!) * 100}%`, width: `${(b.width / W!) * 100}%`, height: `${(b.height / H!) * 100}%` }} />
              );
            })}
          </div>
        </div>
      ) : (
        <p className="p-6 text-sm text-ink-2">The scanner did not return a screenshot for this page. Use the selectors and HTML below to locate elements.</p>
      )}
      {src && issue && mappable && !currentHasBox && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-2">No coordinates were reported for the selected element (it may be hidden, off-screen or zero-size). No location is shown rather than guessing.</p>
      )}
    </section>
  );
}

function Detail({ issue, scanId, nodeIndex, setNodeIndex, provider, providerError, onOpenProviderSetup, fixes, verifs, onGenerate, onVerify }:
  { issue: Issue; scanId: string; nodeIndex: number; setNodeIndex: (n: number) => void } & Omit<Props, "scan">) {
  const node = issue.nodes[nodeIndex] ?? issue.nodes[0];
  const key = fixKey(issue.id, nodeIndex);
  const fs = fixes[key];
  const vs = verifs[key];

  return (
    <section aria-labelledby="detail-h" className="card" data-testid={`panel-issue-${issue.id}`} data-scan={scanId}>
      <div className="border-b border-line p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Impact impact={issue.impact} />
          <div className="flex gap-2">
            <CopyButton text={issueText(issue)} label="Copy issue" testId="button-copy-issue" />
            <a href={issue.helpUrl} target="_blank" rel="noreferrer" data-testid="link-help"
              className="inline-flex items-center gap-1 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink">
              Rule docs<ExternalLink size={12} aria-hidden /><span className="sr-only">(opens in new tab)</span>
            </a>
          </div>
        </div>
        <h3 id="detail-h" className="mt-3 text-base font-semibold">{issue.help}</h3>
        <p className="mt-1 text-sm text-ink-2">{issue.description}</p>
        <p className="mt-2 font-mono text-xs text-ink-3">rule {issue.id} · {issue.principle} · <WcagGuidance tags={issue.wcag} /></p>
      </div>

      <div className="p-5">
        {issue.nodes.length > 1 && (
          <label className="mb-3 flex items-center gap-2 text-xs text-ink-2">
            Affected element
            <select value={nodeIndex} onChange={(e) => setNodeIndex(Number(e.target.value))} data-testid="select-node"
              className="min-w-0 max-w-full flex-1 rounded-md border border-line bg-card px-2 py-1 font-mono text-xs text-ink">
              {issue.nodes.map((n, i) => <option key={i} value={i}>{i + 1}/{issue.nodes.length} — {n.target.join(" ").slice(0, 80)}{n.box ? "" : " (no location)"}</option>)}
            </select>
          </label>
        )}
        <p className="text-xs font-medium text-ink-3">Selector</p>
        <p className="code mt-1 text-ink" data-testid="text-selector">{node.target.join(" ")}</p>
        <p className="mt-3 text-xs font-medium text-ink-3">HTML</p>
        <pre className="code mt-1 max-h-40 overflow-auto rounded-lg border border-line bg-canvas p-3" data-testid="text-node-html">{node.html}</pre>
        {node.summary && <><p className="mt-3 text-xs font-medium text-ink-3">Axe-core finding</p><p className="mt-1 whitespace-pre-line text-sm text-ink-2">{node.summary}</p></>}

        <div className="mt-5 border-t border-line pt-5">
          {!fs?.fix && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => onGenerate(issue.id, nodeIndex)} disabled={fs?.loading} data-testid="button-generate-fix"
                className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
                {fs?.loading ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Sparkles size={16} aria-hidden />}
                {fs?.loading ? "Generating fix..." : "Generate AI Fix"}
              </button>
              <div className="text-xs text-ink-3">
                {provider === "configuration-error" ? (
                  <div data-testid="text-provider-configuration-error">
                    <p>{providerError || "AI provider configuration needs attention. Ask the app owner to check OPENAI_BASE_URL and OPENAI_MODEL together, or GEMINI_MODEL for Gemini."}</p>
                    <p className="mt-1">A failed configuration will not silently fall back to another provider or to deterministic suggestions.</p>
                    <a href="#provider-setup" onClick={onOpenProviderSetup} className="mt-1 inline-block font-medium text-brand underline underline-offset-2">
                      Provider setup instructions
                    </a>
                  </div>
                )
                  : provider === "deterministic" ? "No AI provider is configured on the server. A deterministic rule-based suggestion will be used where available."
                  : "Sends only this element's HTML and rule details to the configured provider through the server."}
              </div>
            </div>
          )}
          {fs?.error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="text-fix-error">{fs.error}</p>}
          {fs?.fix && <FixPanel fix={fs.fix} vs={vs} onVerify={() => onVerify(issue.id, nodeIndex, fs.fix!.id)} onRegenerate={() => onGenerate(issue.id, nodeIndex)} regenerating={fs.loading} />}
        </div>
      </div>
    </section>
  );
}

const VSTYLE: Record<string, string> = {
  "Verified in simulation": "border-emerald-300 bg-emerald-50 text-emerald-900",
  "Issue still detected": "border-orange-300 bg-orange-50 text-orange-900",
  "Regression detected": "border-red-300 bg-red-50 text-red-900",
  "Verification unavailable": "border-slate-300 bg-slate-50 text-slate-800",
};

function FixPanel({ fix, vs, onVerify, onRegenerate, regenerating }: { fix: Fix; vs?: VerifyState; onVerify: () => void; onRegenerate: () => void; regenerating: boolean }) {
  return (
    <div data-testid="panel-fix">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 text-sm font-semibold"><Wrench size={15} className="text-brand" aria-hidden />Suggested correction</h4>
        <span className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-2" data-testid="text-fix-source">{fix.source === "gemini" ? "Generated by Gemini" : fix.source === "openai-compatible" ? "Generated by OpenAI-compatible provider" : "Deterministic rule-based suggestion"}</span>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><p className="text-xs font-medium text-ink-3">Original</p><pre className="code mt-1 max-h-56 overflow-auto rounded-lg border border-red-200 bg-red-50/40 p-3" data-testid="text-fix-original">{fix.original}</pre></div>
        <div><p className="text-xs font-medium text-ink-3">Suggested</p><pre className="code mt-1 max-h-56 overflow-auto rounded-lg border border-emerald-200 bg-emerald-50/40 p-3" data-testid="text-fix-suggested">{fix.suggested}</pre></div>
      </div>
      <dl className="mt-4 space-y-3 text-sm">
        <div><dt className="text-xs font-medium text-ink-3">Why this fails</dt><dd className="mt-0.5 text-ink-2">{fix.explanation}</dd></div>
        <div><dt className="text-xs font-medium text-ink-3">What the correction does</dt><dd className="mt-0.5 text-ink-2">{fix.correction}</dd></div>
        <div><dt className="text-xs font-medium text-ink-3">WCAG</dt><dd className="mt-0.5 font-mono text-xs"><WcagGuidance tags={fix.wcag} /></dd></div>
      </dl>
      {fix.warning && <p className="mt-3 flex items-start gap-2 rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-xs text-yellow-900"><AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />{fix.warning}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <CopyButton text={fix.suggested} label="Copy fix" testId="button-copy-fix" variant="solid" />
        <button type="button" onClick={onVerify} disabled={vs?.loading || regenerating} data-testid="button-verify"
          className="inline-flex items-center gap-1.5 rounded-md border border-brand px-2.5 py-1.5 text-xs font-medium text-brand hover:bg-brand-soft disabled:opacity-60">
          {vs?.loading ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <FlaskConical size={14} aria-hidden />}
          {vs?.loading ? "Re-running Axe-core..." : "Apply & Verify"}
        </button>
        <button type="button" onClick={onRegenerate} disabled={regenerating || vs?.loading} data-testid="button-regenerate"
          className="inline-flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs font-medium text-ink-2 hover:text-ink disabled:opacity-60">
          {regenerating ? "Generating..." : "Regenerate"}
        </button>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">Verification patches an isolated in-memory copy and re-runs Axe-core. The live site and your source code are not changed.</p>
      <div aria-live="polite">
        {vs?.error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" data-testid="text-verify-error">Verification request failed: {vs.error}. No verification result exists.</p>}
        {vs?.result && (
          <div className={`mt-3 rounded-lg border px-3 py-2.5 text-sm ${VSTYLE[vs.result.status] ?? VSTYLE["Verification unavailable"]}`} data-testid="status-verification">
            <p className="font-semibold">{vs.result.status}</p>
            <p className="mt-1">{vs.result.explanation}</p>
            <p className="mt-1 font-mono text-xs">Snapshot violation instances before: {vs.result.before} · after: {vs.result.after}</p>
            {vs.result.regressions.length > 0 && <p className="mt-1 font-mono text-xs">New failures: {vs.result.regressions.join(", ")}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
