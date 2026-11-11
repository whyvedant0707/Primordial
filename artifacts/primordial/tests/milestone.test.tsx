import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Checklist from "../src/app/components/checklist";
import CopyButton from "../src/app/components/copy-button";
import { ITEMS, MARK_LABELS, parseReview, readReview, reviewKey } from "../src/app/components/review-data";
import { summaryText } from "../src/app/components/lib";
import { criteria, guidanceUrl } from "../src/app/components/wcag";
import type { Scan } from "@workspace/api-client-react";

beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const scan: Scan = { id: "review-a", url: "https://example.com", status: "complete", createdAt: "2026-11-09T12:00:00Z", stage: "Complete", issues: [], warnings: [] };

it("all nine questions support every status, correct counts, refresh persistence and scan isolation", () => {
  let ui = render(<Checklist scanId="review-a" />);
  expect(screen.getAllByRole("group", { name: /Status for/ })).toHaveLength(9);
  for (const mark of ["reviewed", "attention", "na"] as const) {
    for (const item of ITEMS) fireEvent.click(screen.getByTestId(`button-mark-${item.id}-${mark}`));
    expect(screen.getByTestId("text-checklist-progress").textContent).toContain("9/9 answered");
    expect(screen.getByTestId("text-checklist-progress").textContent).toContain(`${mark === "attention" ? 9 : 0} need attention`);
    expect(Object.values(readReview("review-a"))).toEqual(Array(9).fill(mark));
  }
  ui.unmount();
  ui = render(<Checklist scanId="review-a" />);
  for (const item of ITEMS) expect(screen.getByTestId(`button-mark-${item.id}-na`).getAttribute("aria-pressed")).toBe("true");
  ui.rerender(<Checklist scanId="review-b" />);
  expect(screen.getByTestId("text-checklist-progress").textContent).toContain("0/9 answered");
  fireEvent.click(screen.getByTestId("button-mark-keyboard-attention"));
  expect(readReview("review-b")).toEqual({ keyboard: "attention" });
  ui.rerender(<Checklist scanId="review-a" />);
  expect(screen.getByTestId("text-checklist-progress").textContent).toContain("9/9 answered");
  fireEvent.click(screen.getByTestId("button-mark-keyboard-na"));
  expect(screen.getByTestId("text-checklist-progress").textContent).toContain("8/9 answered");
});

it("keeps all checklist answers in scan-keyed localStorage and reports blocked storage", () => {
  expect(parseReview('{"keyboard":"attention","unknown":"reviewed","color":"bad"}')).toEqual({ keyboard: "attention" });
  expect(parseReview("[]")).toEqual({});
  localStorage.setItem(reviewKey("review-a"), "{broken");
  render(<Checklist scanId="review-a" />);
  expect(screen.getByRole("alert").textContent).toMatch(/unreadable/);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
  fireEvent.click(screen.getByTestId("button-mark-keyboard-reviewed"));
  expect(screen.getByRole("alert").textContent).toMatch(/may not survive refresh/);
});

it("copies the latest complete report including all nine human-review statuses for only this scan", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  render(<CopyButton text={() => summaryText(scan, readReview(scan.id))} label="Copy summary" testId="copy" />);
  // Write after rendering, proving export reads current answers at click time.
  localStorage.setItem(reviewKey(scan.id), JSON.stringify({ keyboard: "attention", color: "reviewed", media: "na" }));
  localStorage.setItem(reviewKey("other"), JSON.stringify({ keyboard: "reviewed" }));
  fireEvent.click(screen.getByTestId("copy"));
  await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
  const copied: string = writeText.mock.calls[0][0];
  expect(copied).toContain("3/9 answered; 1 need attention");
  for (const label of Object.values(MARK_LABELS)) expect(copied).toContain(`[${label}]`);
  expect(copied.match(/\[Unanswered\]/g)).toHaveLength(6);
  expect(copied).toContain("not independently verified");
  expect(screen.getByTestId("copy").textContent).toContain("Copied");
});

it("copies source exactly and clearly reports denied clipboard or unreadable export data", async () => {
  const code = '<button aria-label="Search">\n  <span aria-hidden="true">Search icon</span>\n</button>';
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  const ui = render(<CopyButton text={code} label="Copy fix" testId="copy" />);
  fireEvent.click(screen.getByTestId("copy"));
  await waitFor(() => expect(writeText).toHaveBeenCalledWith(code));
  writeText.mockRejectedValue(new Error("denied"));
  fireEvent.click(screen.getByTestId("copy"));
  await waitFor(() => expect(screen.getByTestId("copy").textContent).toMatch(/Copy failed/));
  ui.rerender(<CopyButton text={() => { throw new Error("storage unavailable"); }} label="Copy summary" testId="copy" />);
  fireEvent.click(screen.getByTestId("copy"));
  await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/copy failed/));
});

it("maps actual WCAG criteria and never treats level tags or unknown slugs as guidance", () => {
  expect(criteria(["wcag2a", "wcag21aa", "wcag143", "wcag1410", "wcag412", "1.1.1"])).toEqual(["1.4.3", "1.4.10", "4.1.2", "1.1.1"]);
  for (const item of ITEMS) for (const criterion of item.wcag.split(", "))
    expect(guidanceUrl(criterion)).toMatch(/^https:\/\/www\.w3\.org\/WAI\/WCAG21\/Understanding\/[a-z-]+\.html$/);
  expect(guidanceUrl("9.9.9")).toBeNull();
});
