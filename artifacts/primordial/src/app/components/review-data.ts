export type Mark = "reviewed" | "attention" | "na";
export type ReviewMarks = Record<string, Mark>;
export const ITEMS = [
  { id: "alt-meaning", q: "Does each image's alternative text accurately describe its purpose?", hint: "Automation only checks that alt exists, not that it is meaningful. Decorative images should have empty alt.", wcag: "1.1.1" },
  { id: "keyboard", q: "Is the page fully usable with keyboard navigation alone?", hint: "Tab through every control. Menus, dialogs and custom widgets must be reachable and operable without a mouse.", wcag: "2.1.1" },
  { id: "focus-order", q: "Is the focus order logical and is focus always visible?", hint: "Focus should follow reading order and never disappear or become trapped.", wcag: "2.4.3, 2.4.7" },
  { id: "headings", q: "Are headings structured meaningfully?", hint: "Headings should describe the content that follows and form a sensible outline.", wcag: "1.3.1, 2.4.6" },
  { id: "color", q: "Are important visual elements understandable without relying only on color?", hint: "Errors, links and status should also use text, icons or patterns.", wcag: "1.4.1" },
  { id: "link-purpose", q: "Is the purpose of each link clear from its text or context?", hint: "Avoid repeated 'Read more' links without context.", wcag: "2.4.4" },
  { id: "forms", q: "Do form errors explain what went wrong and how to fix it?", hint: "Submit forms with invalid data and check the messages with a screen reader.", wcag: "3.3.1, 3.3.3" },
  { id: "reflow", q: "Does text resize at 200% and content reflow at 320 CSS pixels without loss?", hint: "Check text at 200% zoom. Separately check reflow at 320 CSS pixels; avoid clipped content and two-dimensional scrolling, except permitted content such as data tables.", wcag: "1.4.4, 1.4.10" },
  { id: "media", q: "Does prerecorded media have the required captions, transcript or audio description?", hint: "Check accurate captions for synchronized video, a transcript for audio-only media, and audio description of important visual content in video. These alternatives are not interchangeable.", wcag: "1.2.1, 1.2.2, 1.2.5" },
];
export const MARK_LABELS: Record<Mark, string> = { reviewed: "Reviewed", attention: "Needs attention", na: "Not applicable" };
export const reviewKey = (scanId: string) => `a11y-copilot:checklist:${scanId}`;

export function parseReview(raw: string | null): ReviewMarks {
  const value: unknown = JSON.parse(raw ?? "{}");
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([id, mark]) =>
    ITEMS.some(item => item.id === id) && typeof mark === "string" && Object.hasOwn(MARK_LABELS, mark),
  )) as ReviewMarks;
}

export function readReview(scanId: string): ReviewMarks {
  // A blocked/unreadable store must not silently export an empty review.
  return parseReview(localStorage.getItem(reviewKey(scanId)));
}
