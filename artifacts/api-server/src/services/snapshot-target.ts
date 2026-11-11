import type { Page } from "playwright";

export interface ElementFingerprint {
  tag: string;
  text: string;
  context?: string;
}

// Standalone so Playwright can serialize it into the scanning browser.
export function fingerprintElement(el: Element): ElementFingerprint {
  const descriptions = [el.parentElement, el.parentElement?.parentElement ?? null, el.previousElementSibling, el.nextElementSibling].map(node => node
    ? `${node.tagName.toLowerCase()}:${(node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 500)}`
    : "");
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
    context: JSON.stringify({
      parents: descriptions.slice(0, 2),
      previous: descriptions[2],
      next: descriptions[3],
    }),
  };
}

/** Resolve against the original inert DOM, then carry identity through sanitization. */
export async function mapSnapshotTarget(
  page: Page, html: string, selector: string, nodeHtml: string, marker: string,
  expected?: ElementFingerprint,
): Promise<{ html: string } | { error: string }> {
  const prepared = await page.evaluate(({ html, nodeHtml }) => {
    // DOMParser does not execute scripts; network is also blocked by the context.
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("[data-copilot-target]").forEach(el => el.removeAttribute("data-copilot-target"));
    const sample = new DOMParser().parseFromString(nodeHtml, "text/html").body.firstElementChild;
    return {
      html: doc.documentElement.outerHTML,
      sample: sample ? {
        tag: sample.tagName.toLowerCase(),
        text: (sample.textContent ?? "").replace(/\s+/g, " ").trim(),
      } : null,
    };
  }, { html, nodeHtml });
  const wanted: ElementFingerprint | null = expected ?? prepared.sample;
  if (!wanted) return { error: "The affected element has no usable fingerprint. Run a new scan." };
  // Evaluate the same fingerprint function in the inert, detached original DOM.
  await page.evaluate(`window.__copilotFingerprint = (${fingerprintElement.toString()})`);
  return page.evaluate(({ html, selector, wanted, marker, hasContext }) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const fingerprint = (window as any).__copilotFingerprint as (el: Element) => ElementFingerprint;
    let exact: Element[] = [];
    try { exact = Array.from(doc.querySelectorAll(selector)); } catch { /* fallback below */ }
    // A unique original selector is accepted only if its content agrees with the
    // captured element. Never trust a selector now pointing at a different node.
    let candidates = exact.filter(el => {
      const actual = fingerprint(el);
      return actual.tag === wanted.tag && actual.text === wanted.text &&
        (!hasContext || actual.context === wanted.context);
    });
    if (candidates.length !== 1) {
      candidates = Array.from(doc.getElementsByTagName(wanted.tag)).filter(el => {
        const actual = fingerprint(el);
        return actual.tag === wanted.tag && actual.text === wanted.text &&
          (!hasContext || actual.context === wanted.context);
      });
      // Without captured context, empty text is not a reliable fallback identity.
      if (!wanted.text && !hasContext) candidates = [];
    }
    if (!candidates.length)
      return { error: "The affected element is missing from the snapshot; no matching element fingerprint was found. Run a new scan." };
    if (candidates.length !== 1)
      return { error: `The affected element is ambiguous: ${candidates.length} snapshot elements match its fingerprint. No patch was applied.` };
    candidates[0]!.setAttribute("data-copilot-target", marker);
    return { html: "<!doctype html>" + doc.documentElement.outerHTML };
  }, { html: prepared.html, selector, wanted, marker, hasContext: Boolean(expected?.context) });
}
