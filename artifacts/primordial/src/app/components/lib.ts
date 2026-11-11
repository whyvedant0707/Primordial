import type { Issue, IssueImpact, Scan } from "@workspace/api-client-react";
import { ITEMS, MARK_LABELS, type ReviewMarks } from "./review-data";
import { criteria } from "./wcag";

export const IMPACT_ORDER: IssueImpact[] = ["critical", "serious", "moderate", "minor", "unknown"];

export const IMPACT_STYLE: Record<IssueImpact, { label: string; chip: string; box: string; dot: string }> = {
  critical: { label: "Critical", chip: "bg-red-50 text-red-800 border-red-200", box: "border-red-600 bg-red-600/10", dot: "bg-red-600" },
  serious: { label: "Serious", chip: "bg-orange-50 text-orange-800 border-orange-200", box: "border-orange-500 bg-orange-500/10", dot: "bg-orange-500" },
  moderate: { label: "Moderate", chip: "bg-yellow-50 text-yellow-800 border-yellow-300", box: "border-yellow-400 bg-yellow-400/15", dot: "bg-yellow-400" },
  minor: { label: "Minor", chip: "bg-blue-50 text-blue-800 border-blue-200", box: "border-blue-600 bg-blue-600/10", dot: "bg-blue-600" },
  unknown: { label: "Unrated", chip: "bg-slate-50 text-slate-700 border-slate-200", box: "border-slate-500 bg-slate-500/10", dot: "bg-slate-500" },
};

export const PRINCIPLES = ["Perceivable", "Operable", "Understandable", "Robust", "Other"] as const;

export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object") {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string") {
      return (data as { error: string }).error;
    }
    const status = (err as { status?: unknown }).status;
    if (typeof status === "number" && status >= 500) return `${fallback} (server returned ${status}).`;
    if (err instanceof TypeError) return `${fallback} The API could not be reached.`;
    if (err instanceof Error && err.message) return err.message;
  }
  return fallback;
}

export function screenshotSrc(s?: string): string | null {
  if (!s) return null;
  if (s.startsWith("data:") || s.startsWith("http") || s.startsWith("/")) return s;
  return `data:image/png;base64,${s}`;
}

/** Weighted internal estimate. Not a WCAG score. */
export const WEIGHTS: Record<IssueImpact, number> = { critical: 10, serious: 6, moderate: 3, minor: 1, unknown: 2 };

export function healthEstimate(issues: Issue[]): number {
  const penalty = issues.reduce((sum, i) => sum + WEIGHTS[i.impact], 0);
  return Math.max(0, 100 - penalty);
}

export function countBy(issues: Issue[]) {
  const c: Record<IssueImpact, number> = { critical: 0, serious: 0, moderate: 0, minor: 0, unknown: 0 };
  issues.forEach((i) => (c[i.impact] += 1));
  return c;
}

export function issueText(issue: Issue): string {
  return [
    `${issue.help} [${issue.impact}] (${issue.id})`,
    issue.description,
    criteria(issue.wcag).length ? `WCAG: ${criteria(issue.wcag).join(", ")}` : "WCAG: no mapped success criterion",
    `Affected elements: ${issue.nodes.length}`,
    ...issue.nodes.slice(0, 5).map((n, i) => `  ${i + 1}. ${n.target.join(" ")} — ${n.html}`),
    `Reference: ${issue.helpUrl}`,
  ].join("\n");
}

export function summaryText(scan: Scan, marks: ReviewMarks = {}): string {
  const c = countBy(scan.issues);
  const nodes = scan.issues.reduce((s, i) => s + i.nodes.length, 0);
  return [
    `Accessibility Copilot scan — ${scan.url}`,
    `Scanned: ${new Date(scan.createdAt).toLocaleString()}`,
    `Rules failing: ${scan.issues.length} (${nodes} elements)`,
    `Critical ${c.critical} · Serious ${c.serious} · Moderate ${c.moderate} · Minor ${c.minor}`,
    `Internal estimated indicator: ${healthEstimate(scan.issues)}/100 (not an official WCAG score)`,
    "",
    ...scan.issues.map((i) => `- [${i.impact}] ${i.help} (${criteria(i.wcag).join(", ") || "no WCAG mapping"}) x${i.nodes.length}`),
    "",
    `Human review for scan ${scan.id}: ${ITEMS.filter(i => marks[i.id]).length}/${ITEMS.length} answered; ${ITEMS.filter(i => marks[i.id] === "attention").length} need attention`,
    ...ITEMS.map(item => `- [${marks[item.id] ? MARK_LABELS[marks[item.id]!] : "Unanswered"}] ${item.q} (WCAG ${item.wcag})`),
    "Human-review answers come from this browser only; they are not independently verified or saved to MongoDB.",
    "",
    "Automated checks cover only part of WCAG 2.1 AA. Manual review is required.",
  ].join("\n");
}

export const fixKey = (issueId: string, nodeIndex: number) => `${issueId}::${nodeIndex}`;
