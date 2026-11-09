"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Circle, Loader2, RotateCcw, ScanSearch, Trash2 } from "lucide-react";
import { createScan, deleteHistory, getConfig, getHistory, getScan, remediate, verifyFix } from "@workspace/api-client-react";
import type { Capabilities, Scan, ScanSummary } from "@workspace/api-client-react";
import Results, { type FixState, type VerifyState } from "./results";
import Checklist from "./checklist";
import Guide from "./guide";
import { errorMessage, fixKey } from "./lib";
import AuthControls from "./auth-controls";
import { useAppAuth } from "./auth-provider";

type View = "scan" | "review" | "history" | "guide";
const STORE = "a11y-copilot:scan";
const POLL_MS = 1500;
const STAGES = [
  { label: "Validating URL", match: /valid/i },
  { label: "Launching browser", match: /launch|browser/i },
  { label: "Loading website", match: /load|navigat/i },
  { label: "Running accessibility checks", match: /axe|check|analy|rule/i },
  { label: "Preparing results", match: /prepar|screenshot|result|final/i },
];

function setUrlScan(id: string | null) {
  const u = new URL(window.location.href);
  if (id) u.searchParams.set("scan", id); else u.searchParams.delete("scan");
  window.history.replaceState(null, "", u);
  try { if (id) localStorage.setItem(STORE, id); else localStorage.removeItem(STORE); } catch { /* ignore */ }
}

export default function Copilot() {
  const [view, setView] = useState<View>("scan");
  const [config, setConfig] = useState<Capabilities | null>(null);
  const [configError, setConfigError] = useState(false);
  const [url, setUrl] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);
  const [fixes, setFixes] = useState<Record<string, FixState>>({});
  const [verifs, setVerifs] = useState<Record<string, VerifyState>>({});
  const auth = useAppAuth();

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeId = useRef<string | null>(null);
  const mounted = useRef(true);
  const previousOwnerId = useRef<string | null | undefined>(undefined);

  const stopPolling = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  const poll = useCallback((id: string) => {
    stopPolling();
    timer.current = setTimeout(async () => {
      try {
        const s = await getScan(id);
        if (!mounted.current || activeId.current !== id) return;
        setScan(s);
        if (s.status === "running") poll(id);
        else if (s.status === "failed") setError(s.error || "The scan failed without a reported reason.");
      } catch (e) {
        if (!mounted.current || activeId.current !== id) return;
        setError(errorMessage(e, "Lost contact with the scan."));
      }
    }, POLL_MS);
  }, []);

  const resetPerScan = () => { setFixes({}); setVerifs({}); setError(null); };

  const load = useCallback(async (id: string) => {
    activeId.current = id;
    resetPerScan();
    setRestoring(true);
    setView("scan");
    try {
      const s = await getScan(id);
      if (!mounted.current || activeId.current !== id) return;
      setScan(s); setUrl(s.url); setUrlScan(id);
      if (s.status === "running") poll(id);
      else if (s.status === "failed") setError(s.error || "The scan failed without a reported reason.");
    } catch (e) {
      if (!mounted.current || activeId.current !== id) return;
      setScan(null); activeId.current = null; setUrlScan(null);
      setError(errorMessage(e, "That scan could not be loaded. It may have expired from server memory."));
    } finally { if (mounted.current) setRestoring(false); }
  }, [poll]);

  useEffect(() => {
    mounted.current = true;
    getConfig().then((c) => mounted.current && setConfig(c)).catch(() => mounted.current && setConfigError(true));
    let id: string | null = new URL(window.location.href).searchParams.get("scan");
    if (!id) { try { id = localStorage.getItem(STORE); } catch { id = null; } }
    if (id) void load(id);
    return () => { mounted.current = false; stopPolling(); };
  }, [load]);

  useEffect(() => {
    if (!auth.available || !auth.loaded) return;
    const ownerId = auth.signedIn ? auth.userId : null;
    if (previousOwnerId.current === undefined) {
      previousOwnerId.current = ownerId;
      return;
    }
    if (previousOwnerId.current !== ownerId) {
      previousOwnerId.current = ownerId;
      stopPolling();
      activeId.current = null;
      setScan(null);
      setFixes({});
      setVerifs({});
      setError(null);
      setRestoring(false);
      setView("scan");
      setUrlScan(null);
    }
  }, [auth.available, auth.loaded, auth.signedIn, auth.userId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = url.trim();
    if (!value) { setInputError("Enter a URL to scan."); return; }
    let parsed: URL;
    try { parsed = new URL(/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`); } catch { setInputError("That does not look like a valid URL."); return; }
    if (!/^https?:$/.test(parsed.protocol)) { setInputError("Only http and https URLs can be scanned."); return; }
    setInputError(null);
    stopPolling();
    activeId.current = null;
    setScan(null); resetPerScan(); setSubmitting(true); setView("scan");
    try {
      const s = await createScan({ url: parsed.toString() });
      if (!mounted.current) return;
      activeId.current = s.id; setScan(s); setUrlScan(s.id);
      if (s.status === "running") poll(s.id);
      else if (s.status === "failed") setError(s.error || "The scan failed without a reported reason.");
    } catch (err) {
      if (mounted.current) setError(errorMessage(err, "The scan could not be started."));
    } finally { if (mounted.current) setSubmitting(false); }
  }

  function clear() { stopPolling(); activeId.current = null; setScan(null); resetPerScan(); setUrlScan(null); setUrl(""); }

  async function generate(issueId: string, nodeIndex: number) {
    if (!scan) return;
    const sid = scan.id, k = fixKey(issueId, nodeIndex);
    setFixes((p) => ({ ...p, [k]: { ...p[k], loading: true, error: undefined } }));
    setVerifs((p) => { const n = { ...p }; delete n[k]; return n; });
    try {
      const fix = await remediate({ scanId: sid, issueId, nodeIndex });
      if (activeId.current === sid) setFixes((p) => ({ ...p, [k]: { loading: false, fix } }));
    } catch (e) {
      if (activeId.current === sid) setFixes((p) => ({ ...p, [k]: { ...p[k], loading: false, error: errorMessage(e, "The fix could not be generated.") } }));
    }
  }

  async function verify(issueId: string, nodeIndex: number, fixId: string) {
    if (!scan) return;
    const sid = scan.id, k = fixKey(issueId, nodeIndex);
    setVerifs((p) => ({ ...p, [k]: { loading: true } }));
    try {
      const result = await verifyFix({ scanId: sid, issueId, nodeIndex, fixId });
      if (activeId.current === sid) setVerifs((p) => ({ ...p, [k]: { loading: false, result } }));
    } catch (e) {
      if (activeId.current === sid) setVerifs((p) => ({ ...p, [k]: { loading: false, error: errorMessage(e, "request failed") } }));
    }
  }

  const running = submitting || scan?.status === "running";
  const tabs: { id: View; label: string }[] = [
    { id: "scan", label: scan?.status === "complete" ? "Results" : "Scan" },
    { id: "review", label: "Human review" },
    ...(config?.history && auth.loaded && auth.signedIn ? [{ id: "history" as View, label: "History" }] : []),
    { id: "guide", label: "Scope & limits" },
  ];

  return (
    <div className="min-h-[100dvh]">
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 md:px-6">
          <button type="button" onClick={() => setView("scan")} className="flex items-center gap-2.5" data-testid="link-home">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand text-white"><ScanSearch size={17} aria-hidden /></span>
            <span className="text-left"><span className="block text-sm font-semibold leading-tight">Accessibility Copilot</span><span className="block text-[11px] text-ink-3">WCAG 2.1 AA · single-page audit</span></span>
          </button>
          <nav aria-label="Sections">
            <ul className="flex gap-1">
              {tabs.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => setView(t.id)} aria-current={view === t.id ? "page" : undefined} data-testid={`tab-${t.id}`}
                    className={`rounded-md px-3 py-1.5 text-sm ${view === t.id ? "bg-brand-soft font-medium text-brand" : "text-ink-2 hover:text-ink"}`}>{t.label}</button>
                </li>
              ))}
            </ul>
          </nav>
          <AuthControls />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">
        {view === "scan" && (
          <div className="space-y-6">
            <section aria-labelledby="hero-h" className={scan ? "" : "py-6 md:py-10"}>
              {!scan && (
                <>
                  <p className="text-xs font-medium uppercase tracking-wider text-brand">Axe-core · Playwright · WCAG 2.1 AA</p>
                  <h1 id="hero-h" className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">Find accessibility issues. Understand them. Fix them.</h1>
                  <p className="mt-3 max-w-2xl text-base text-ink-2">Scan one public page, see exactly which elements fail on a real screenshot, get a code correction for the element you choose, and verify it in an isolated simulation.</p>
                </>
              )}
              {scan && <h1 id="hero-h" className="sr-only">Accessibility Copilot scan</h1>}
              <form onSubmit={submit} noValidate className={`card flex flex-col gap-2 p-2 sm:flex-row ${scan ? "" : "mt-6 max-w-3xl"}`}>
                <label htmlFor="url" className="sr-only">Website URL</label>
                <input id="url" type="url" inputMode="url" autoComplete="url" placeholder="https://your-site.com/page" value={url}
                  onChange={(e) => { setUrl(e.target.value); setInputError(null); }} disabled={running}
                  aria-invalid={!!inputError} aria-describedby={inputError ? "url-err" : undefined} data-testid="input-url"
                  className="min-w-0 flex-1 rounded-lg bg-transparent px-3 py-2.5 font-mono text-sm placeholder:text-ink-3 focus:outline-none" />
                <button type="submit" disabled={running} data-testid="button-scan"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">
                  {running ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <ScanSearch size={16} aria-hidden />}{running ? "Scanning..." : "Scan Website"}
                </button>
                {scan && !running && <button type="button" onClick={clear} className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-line px-3 py-2.5 text-sm text-ink-2 hover:text-ink" data-testid="button-new-scan"><RotateCcw size={14} aria-hidden />Clear</button>}
              </form>
              {inputError && <p id="url-err" role="alert" className="mt-2 text-sm text-red-700">{inputError}</p>}
              {!scan && !running && (
                <p className="mt-3 text-sm text-ink-3">
                  Try it on <button type="button" className="font-mono text-brand underline-offset-2 hover:underline" onClick={() => setUrl("https://example.com")} data-testid="button-example">https://example.com</button> — fills the field; nothing is scanned until you press Scan.
                </p>
              )}
              {configError && <p className="mt-3 text-sm text-orange-800">The API server is not responding to configuration requests. Scans may fail until it is available.</p>}
              {config && !config.history && (
                <p role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="status-saved-history-unavailable">
                  Saved report history is unavailable. You can still run scans, but results are temporary and may expire after 30 minutes or when the server restarts.
                </p>
              )}
            </section>

            {error && (
              <div role="alert" className="card border-red-200 bg-red-50 p-4" data-testid="text-scan-error">
                <p className="text-sm font-semibold text-red-900">{scan?.status === "failed" ? "Scan failed" : "Something went wrong"}</p>
                <p className="mt-1 text-sm text-red-800">{error}</p>
                <div className="mt-3 flex gap-2">
                  {url && <button type="button" onClick={(e) => submit(e as unknown as React.FormEvent)} className="rounded-md bg-red-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-800" data-testid="button-retry">Retry scan</button>}
                  {scan?.status === "running" && <button type="button" onClick={() => { setError(null); poll(scan.id); }} className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-800" data-testid="button-resume">Resume checking</button>}
                </div>
              </div>
            )}

            {(running || restoring) && !error && <Progress stage={scan?.stage} url={scan?.url ?? url} restoring={restoring && !scan} />}

            {scan?.status === "complete" && <Results scan={scan} provider={config ? config.provider ?? (config.gemini ? "gemini" : "deterministic") : null} providerError={config?.providerError} onOpenProviderSetup={() => setView("guide")} fixes={fixes} verifs={verifs} onGenerate={generate} onVerify={verify} />}

            {!scan && !running && !restoring && <HowItWorks config={config} signedIn={auth.loaded && auth.signedIn} authAvailable={auth.available} />}
          </div>
        )}
        {view === "review" && <Checklist scanId={scan?.status === "complete" ? scan.id : null} url={scan?.url} />}
        {view === "history" && config?.history && auth.loaded && auth.signedIn && <History onOpen={load} onDeleted={(id) => { if (activeId.current === id) clear(); }} retention={config.retention} />}
        {view === "guide" && <Guide />}
      </main>
      <footer className="mx-auto max-w-7xl px-4 pb-8 text-xs text-ink-3 md:px-6">
        Automated testing covers only part of WCAG 2.1 AA. Results are guidance for engineers, not a conformance certification.
      </footer>
    </div>
  );
}

function Progress({ stage, url, restoring }: { stage?: string; url: string; restoring: boolean }) {
  const idx = stage ? STAGES.findIndex((s) => s.match.test(stage)) : -1;
  return (
    <section aria-live="polite" aria-busy="true" className="card max-w-3xl p-5" data-testid="panel-progress">
      <p className="text-sm font-semibold">{restoring ? "Restoring your last scan..." : "Scanning"} <span className="font-mono font-normal text-ink-2">{url}</span></p>
      <p className="mt-1 text-sm text-ink-2" data-testid="text-stage">Server stage: <span className="font-medium text-ink">{stage || "Submitting request"}</span></p>
      <ol className="mt-4 space-y-2">
        {STAGES.map((s, i) => {
          const done = idx > i, now = idx === i;
          return (
            <li key={s.label} className={`flex items-center gap-2.5 text-sm ${done ? "text-ink" : now ? "font-medium text-brand" : "text-ink-3"}`}>
              {done ? <Check size={15} className="text-emerald-600" aria-hidden /> : now ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Circle size={15} aria-hidden />}
              {s.label}<span className="sr-only">{done ? " (done)" : now ? " (in progress)" : " (pending)"}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function HowItWorks({ config, signedIn, authAvailable }: { config: Capabilities | null; signedIn: boolean; authAvailable: boolean }) {
  const steps = [
    ["Scan", "A sandboxed Chromium loads your page at a fixed viewport. Private and internal addresses are rejected before any request is made."],
    ["Locate", "Axe-core runs WCAG 2.0/2.1 A and AA rules. Failing elements are outlined on the captured screenshot when coordinates exist."],
    ["Fix", "For any single element, request a correction. Only that element's HTML and rule context are sent, and only when you ask."],
    ["Verify", "The fix is applied to an isolated in-memory copy and Axe-core runs again. Your live site is never modified."],
  ];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <section aria-labelledby="how-h" className="card p-6 lg:col-span-2">
        <h2 id="how-h" className="text-sm font-semibold">How a scan works</h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-2">
          {steps.map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-brand-soft font-mono text-xs font-medium text-brand">{i + 1}</span>
              <div><p className="text-sm font-medium">{t}</p><p className="mt-1 text-sm leading-relaxed text-ink-2">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>
      <aside className="card p-6" aria-labelledby="scope-h">
        <h2 id="scope-h" className="text-sm font-semibold">Before you trust a result</h2>
        <ul className="mt-3 space-y-2.5 text-sm text-ink-2">
          <li>Automated rules catch only a subset of WCAG failures.</li>
          <li>One page, initial state only. No crawling, no logged-in content.</li>
          <li>The health indicator is an internal estimate, not a WCAG score.</li>
          <li>A human review checklist covers what tools cannot judge.</li>
        </ul>
        <dl className="mt-5 space-y-1.5 border-t border-line pt-4 text-xs" data-testid="panel-capabilities">
          <div className="flex justify-between"><dt className="text-ink-3">AI fixes</dt><dd className="font-medium">{config ? (config.provider === "configuration-error" ? "Configuration error" : config.provider === "openai-compatible" ? "OpenAI-compatible configured" : config.gemini ? "Gemini configured" : "Rule-based only") : "Checking..."}</dd></div>
          <div className="flex justify-between"><dt className="text-ink-3">Saved report history</dt><dd className="font-medium">{config ? (!config.history ? "Unavailable — scans temporary" : !authAvailable ? "Temporary only" : signedIn ? "Enabled" : "Sign in to save") : "Checking..."}</dd></div>
          {config?.retention && <div className="flex justify-between gap-4"><dt className="text-ink-3">Retention</dt><dd className="text-right font-medium">{config.retention}</dd></div>}
        </dl>
      </aside>
    </div>
  );
}

function History({ onOpen, onDeleted, retention }: { onOpen: (id: string) => void; onDeleted: (id: string) => void; retention: string }) {
  const [items, setItems] = useState<ScanSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const fetchIt = useCallback(() => {
    setErr(null); setDeleteErr(null); setItems(null);
    getHistory().then(setItems).catch((e) => setErr(errorMessage(e, "History could not be loaded.")));
  }, []);
  useEffect(() => { fetchIt(); }, [fetchIt]);

  async function remove(report: ScanSummary) {
    if (!window.confirm(`Delete the saved scan report for ${report.url}? This cannot be undone.`)) return;
    setDeleteErr(null);
    setDeletingId(report.id);
    try {
      await deleteHistory(report.id);
      setItems((current) => current?.filter((item) => item.id !== report.id) ?? current);
      onDeleted(report.id);
    } catch (e) {
      setDeleteErr(errorMessage(e, "The saved report could not be deleted."));
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section aria-labelledby="hist-h" className="card">
      <div className="border-b border-line p-5">
        <h2 id="hist-h" className="text-lg font-semibold">Recent scans</h2>
        <p className="mt-1 text-sm text-ink-2">Retention: {retention}</p>
      </div>
      {err && <div role="alert" className="p-5 text-sm text-red-800">{err} <button type="button" onClick={fetchIt} className="ml-2 underline" data-testid="button-retry-history">Retry</button></div>}
      {deleteErr && <p role="alert" className="border-b border-line px-5 py-3 text-sm text-red-800" data-testid="text-delete-history-error">{deleteErr}</p>}
      {!err && !items && <ul className="divide-y divide-line" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="p-4"><div className="h-4 w-2/3 rounded bg-line" /><div className="mt-2 h-3 w-1/4 rounded bg-line" /></li>)}</ul>}
      {items && items.length === 0 && <p className="p-8 text-center text-sm text-ink-2">No scans recorded yet. Completed scans will appear here.</p>}
      {items && items.length > 0 && (
        <ul className="divide-y divide-line">
          {items.map((h) => (
            <li key={h.id} className="flex items-center gap-2 p-2">
              <button type="button" onClick={() => onOpen(h.id)} className="flex min-w-0 flex-1 items-center justify-between gap-4 rounded-lg p-2 text-left hover:bg-canvas" data-testid={`row-history-${h.id}`}>
                <span className="min-w-0"><span className="block truncate font-mono text-sm">{h.url}</span><span className="text-xs text-ink-3">{new Date(h.createdAt).toLocaleString()}</span></span>
                <span className="shrink-0 font-mono text-sm">{h.total} <span className="text-xs text-ink-3">violations</span></span>
              </button>
              <button
                type="button"
                onClick={() => void remove(h)}
                disabled={deletingId === h.id}
                aria-label={`Delete report for ${h.url}`}
                title="Delete saved report"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg text-ink-3 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                data-testid={`button-delete-history-${h.id}`}
              >
                {deletingId === h.id ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Trash2 size={16} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
