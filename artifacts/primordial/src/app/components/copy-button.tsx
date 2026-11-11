"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, X } from "lucide-react";

export default function CopyButton({ text, label, testId, variant = "ghost" }: { text: string | (() => string); label: string; testId: string; variant?: "ghost" | "solid" }) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error("no clipboard");
      await navigator.clipboard.writeText(typeof text === "function" ? text() : text);
      setState("ok");
    } catch {
      setState("fail");
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2200);
  }

  const base = variant === "solid"
    ? "bg-brand text-white hover:bg-brand-dark border-brand"
    : "bg-card text-ink-2 hover:text-ink hover:border-ink-3/40 border-line";
  return (
    <button type="button" onClick={copy} data-testid={testId}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${base}`}>
      {state === "ok" ? <Check size={14} aria-hidden /> : state === "fail" ? <X size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      <span>{state === "ok" ? "Copied" : state === "fail" ? "Copy failed — clipboard or report data unavailable" : label}</span>
      <span className="sr-only" role="status">{state === "ok" ? `${label}: copied to clipboard` : state === "fail" ? `${label}: copy failed` : ""}</span>
    </button>
  );
}
