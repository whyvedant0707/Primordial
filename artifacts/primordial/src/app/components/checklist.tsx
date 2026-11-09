"use client";

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import { ITEMS, readReview, reviewKey, type Mark } from "./review-data";
import WcagGuidance from "./wcag-guidance";

const OPTIONS: { v: Mark; label: string; on: string }[] = [
  { v: "reviewed", label: "Reviewed", on: "bg-emerald-50 border-emerald-300 text-emerald-800" },
  { v: "attention", label: "Needs attention", on: "bg-orange-50 border-orange-300 text-orange-800" },
  { v: "na", label: "Not applicable", on: "bg-slate-100 border-slate-300 text-slate-700" },
];

export default function Checklist({ scanId, url }: { scanId: string | null; url?: string }) {
  const key = scanId ? reviewKey(scanId) : null;
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    if (!key) { setMarks({}); return; }
    try {
      setMarks(readReview(scanId!)); setStorageError(false);
    } catch { setMarks({}); setStorageError(true); }
  }, [key]);

  function set(id: string, v: Mark) {
    setMarks((prev) => {
      const next = { ...prev };
      if (next[id] === v) delete next[id]; else next[id] = v;
      if (key) {
        try { localStorage.setItem(key, JSON.stringify(next)); setStorageError(false); }
        catch { setStorageError(true); }
      }
      return next;
    });
  }

  const done = Object.keys(marks).length;
  const attention = Object.values(marks).filter((m) => m === "attention").length;

  return (
    <section aria-labelledby="checklist-h" className="space-y-4">
      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2 id="checklist-h" className="text-lg font-semibold">Human review checklist</h2>
            <p className="mt-1 max-w-2xl text-sm text-ink-2">
              These requirements need human judgment. Axe-core cannot decide whether alt text is accurate or whether focus order makes sense.
              {url ? <> Reviewing <span className="break-all font-mono text-ink">{url}</span>.</> : null}
            </p>
          </div>
          <div className="text-right text-sm" data-testid="text-checklist-progress">
            <div className="font-mono text-ink">{done}/{ITEMS.length} answered</div>
            <div className="text-ink-3">{attention} need attention</div>
          </div>
        </div>
        <p className="mt-4 flex items-start gap-2 rounded-lg bg-brand-soft px-3 py-2 text-xs text-ink-2">
          <Info size={14} className="mt-0.5 shrink-0 text-brand" aria-hidden />
          {scanId
            ? "Answers are saved only in this browser (localStorage), keyed to this scan. They are not sent to the server and will not appear on other devices."
            : "Run a scan first. Answers are then saved only in this browser, keyed to that scan."}
        </p>
        {storageError && <p role="alert" className="mt-2 text-sm text-orange-800">Browser storage is unavailable or unreadable. Answers may not survive refresh or appear in the copied summary.</p>}
      </div>
      <ol className="space-y-2">
        {ITEMS.map((item, idx) => (
          <li key={item.id} className="card p-4" data-testid={`row-checklist-${item.id}`}>
            <fieldset disabled={!scanId}>
              <legend className="sr-only">{item.q}</legend>
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium"><span className="mr-2 font-mono text-ink-3">{String(idx + 1).padStart(2, "0")}</span>{item.q}</p>
                  <p className="mt-1 text-xs text-ink-3">{item.hint} <WcagGuidance tags={item.wcag.split(", ")} /></p>
                </div>
                <div className="flex shrink-0 flex-wrap gap-1.5" role="group" aria-label={`Status for: ${item.q}`}>
                  {OPTIONS.map((o) => {
                    const active = marks[item.id] === o.v;
                    return (
                      <button key={o.v} type="button" aria-pressed={active} onClick={() => set(item.id, o.v)}
                        data-testid={`button-mark-${item.id}-${o.v}`}
                        className={`rounded-md border px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${active ? o.on : "border-line bg-card text-ink-2 hover:border-ink-3/40"}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
    </section>
  );
}
