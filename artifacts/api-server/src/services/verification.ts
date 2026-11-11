import axe from "axe-core";
import sanitize from "sanitize-html";
import type { Verification, VerificationInput } from "@workspace/api-zod";
import { PublicError } from "./network";
import { selectedIssue } from "./remediation";
import { launchBrowser } from "./browser";
import { AXE_OPTIONS } from "./scanner";
import type { Browser } from "playwright";
import { mapSnapshotTarget } from "./snapshot-target";
import { unsafePatch, validPatch } from "./patch-safety";
export { unsafePatch } from "./patch-safety";

const allowedTags = [...sanitize.defaults.allowedTags, "html", "head", "body", "title", "style", "font", "center", "img", "button", "input", "textarea", "select", "option", "optgroup", "form", "label", "fieldset", "legend", "details", "summary", "video", "audio", "source", "track", "svg", "path", "circle", "rect", "g"];
const sanitization = {
  allowedTags,
  allowedAttributes: { "*": ["id", "class", "style", "role", "lang", "dir", "tabindex", "aria-*", "data-*", "title", "alt", "width", "height", "type", "name", "value", "placeholder", "for", "disabled", "checked", "selected", "multiple", "required", "hidden", "viewbox", "d", "fill", "stroke", "controls", "muted", "open", "href", "src"], font: ["color", "size", "face"], table: ["bgcolor", "cellpadding", "cellspacing", "border"], tr: ["bgcolor"], td: ["bgcolor", "colspan", "rowspan"], th: ["bgcolor", "colspan", "rowspan"], body: ["bgcolor", "text"] },
  allowedSchemes: ["https", "http", "data"],
  // hidden="" is meaningful HTML. Dropping it can turn a destructive AI patch
  // into a different, apparently successful simulation.
  nonBooleanAttributes: sanitize.defaults.nonBooleanAttributes.filter(name => name !== "hidden"),
  allowVulnerableTags: true, // Captured CSS retained; all network is denied.
  disallowedTagsMode: "discard" as const,
  nonTextTags: ["script", "textarea", "option", "noscript", "iframe", "object"],
};
export const inertHtml = (html: string) => sanitize(html, sanitization);

export async function simulateFix(input: VerificationInput): Promise<Verification> {
  const { record, issue, node } = selectedIssue(input);
  const stored = record.fixes.get(input.fixId);
  if (!stored || stored.input.issueId !== input.issueId || stored.input.nodeIndex !== input.nodeIndex)
    throw new PublicError("Fix not found for this selected element. Generate a new fix.", 404);
  let beforeCount: number | null = null;
  let afterCount: number | null = null;
  let selectedBefore: number | null = null;
  let selectedAfter: number | null = null;
  const unavailable = (explanation: string): Verification => ({
    status: "Verification unavailable", explanation,
    before: beforeCount, after: afterCount, selectedBefore, selectedAfter, regressions: [],
  });
  if (!record.snapshot) return unavailable("The temporary page snapshot is unavailable. Run a new scan.");
  if (node.target.length !== 1) return unavailable("Nested-frame and shadow-DOM patches cannot be safely mapped in this simulation.");
  if (unsafePatch(stored.fix.suggested) || !validPatch(stored.fix.suggested)) return unavailable("The suggested patch contains active, unsupported, or multiple-root content. It was not executed. Review the code manually.");
  // Document-wide language replacement and iframe patches would replace the
  // simulation shell or reintroduce network contexts; keep their status honest.
  if (/^<(html|body|head|iframe)\b/i.test(stored.fix.suggested.trim()))
    return unavailable("Document-root or frame replacement is not supported in isolated simulation. Apply manually and rescan the public page.");
  let browser: Browser | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    browser = await launchBrowser();
    timer = setTimeout(() => { void browser?.close(); }, 20000);
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: "block", acceptDownloads: false });
    await context.route("**/*", route => route.abort());
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage();
    const marker = `copilot-${input.fixId}`;
    const mapped = await mapSnapshotTarget(page, record.snapshot, node.target[0]!, node.html, marker,
      record.targetFingerprints?.get(`${issue.id}:${input.nodeIndex}`));
    if ("error" in mapped) return unavailable(mapped.error);
    await page.setContent(inertHtml(mapped.html), { waitUntil: "domcontentloaded", timeout: 5000 });
    const selector = `[data-copilot-target="${marker}"]`;
    const target = page.locator(selector);
    if (await target.count() !== 1) return unavailable("The mapped affected element was removed or duplicated during sanitization. No patch was applied.");
    await page.evaluate(axe.source);
    const audit = () => page.evaluate(async ({ options, marker, rule }) => {
      const result = await (window as any).axe.run(document, { ...options, elementRef: true });
      const el = document.querySelector(`[data-copilot-target="${marker}"]`);
      const signatures: string[] = [];
      let selected = 0;
      let uncertain = false;
      for (const v of result.violations) {
        for (const n of v.nodes) {
          signatures.push(`${v.id}:${JSON.stringify(n.target)}`);
          if (v.id === rule && el && n.element && (el === n.element || el.contains(n.element))) selected++;
        }
      }
      for (const v of result.incomplete) {
        if (v.id === rule) uncertain = true;
      }
      return { signatures, selected, uncertain };
    }, { options: AXE_OPTIONS, marker, rule: issue.id });
    const before = await audit();
    beforeCount = before.signatures.length;
    selectedBefore = before.selected;
    if (!before.selected) return unavailable("The original violation could not be reproduced on this element in the isolated snapshot. External styles and dynamic behavior are not reproduced; no verification claim can be made.");
    const patch = inertHtml(stored.fix.suggested);
    const applied = await page.evaluate(({ selector, patch, marker }) => {
      const el = document.querySelector(selector);
      if (!el) return false;
      const template = document.createElement("template");
      template.innerHTML = patch;
      if (template.content.children.length !== 1) return false;
      if (Array.from(template.content.childNodes).some(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim())) return false;
      const replacement = template.content.firstElementChild!;
      // Removing a failing control is not remediation. Preserve its element
      // type, functional role, input type, and existing descendant controls.
      if (replacement.tagName !== el.tagName ||
        (el.textContent ?? "").trim() && (replacement.textContent ?? "").trim() !== (el.textContent ?? "").trim() ||
        replacement.hasAttribute("hidden") && !el.hasAttribute("hidden") ||
        replacement.getAttribute("aria-hidden") === "true" && el.getAttribute("aria-hidden") !== "true" ||
        replacement.hasAttribute("disabled") && !el.hasAttribute("disabled") ||
        el.tagName === "INPUT" && (replacement.getAttribute("type") ?? "text") !== (el.getAttribute("type") ?? "text") ||
        el.tagName === "A" && el.hasAttribute("href") && !replacement.hasAttribute("href"))
        return false;
      const functionalRoles = ["button", "link", "textbox", "searchbox", "checkbox", "radio", "combobox", "slider", "switch", "spinbutton", "listbox", "menuitem", "tab"];
      if (functionalRoles.includes(el.getAttribute("role") ?? "") && el.getAttribute("role") !== replacement.getAttribute("role")) return false;
      const remainingControls = Array.from(replacement.querySelectorAll("button,input,select,textarea,a[href],[role]"));
      for (const control of el.querySelectorAll("button,input,select,textarea,a[href],[role]")) {
        const index = remainingControls.findIndex(candidate =>
          candidate.tagName === control.tagName &&
          candidate.getAttribute("role") === control.getAttribute("role") &&
          candidate.getAttribute("type") === control.getAttribute("type"));
        if (index < 0) return false;
        remainingControls.splice(index, 1);
      }
      replacement.querySelectorAll("[data-copilot-target]").forEach(n => n.removeAttribute("data-copilot-target"));
      replacement.setAttribute("data-copilot-target", marker);
      el.replaceWith(replacement);
      const style = getComputedStyle(replacement);
      return style.display !== "none" && !["hidden", "collapse"].includes(style.visibility) && Number(style.opacity) > 0 && replacement.getClientRects().length > 0;
    }, { selector, patch, marker });
    if (!applied) return unavailable("The replacement must preserve the affected element type, visible text and interactive controls without hiding or disabling them. No verification claim was made.");
    const after = await audit();
    afterCount = after.signatures.length;
    selectedAfter = after.selected;
    const old = new Set(before.signatures);
    const regressions = after.signatures.filter(s => !old.has(s)).map(s => s.split(":")[0]!);
    const common = { before: beforeCount, after: afterCount, selectedBefore, selectedAfter, regressions: [...new Set(regressions)] };
    if (regressions.length) return { ...common, status: "Regression detected", explanation: "The isolated re-test detected new violating rule/element combinations. Review the suggestion; the original site has not been modified." };
    if (after.selected) return { ...common, status: "Issue still detected", explanation: "Axe-core still detects the selected violation on the replacement element in this isolated simulation." };
    if (after.uncertain) return { ...common, status: "Verification unavailable", explanation: "Axe could not conclusively evaluate this rule after the patch. A human review or live re-test is required." };
    return { ...common, status: "Verified in simulation", explanation: "Axe-core reproduced the selected violation before the patch and did not detect it afterward, with no new detected rule/element combinations in the sanitized snapshot. This is not production verification or proof of semantic accuracy, keyboard usability or WCAG compliance." };
  } catch {
    return unavailable("The isolated browser could not complete both re-tests within its limit. No verification claim was made.");
  } finally { clearTimeout(timer); await browser?.close().catch(() => {}); }
}
