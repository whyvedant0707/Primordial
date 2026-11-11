import sanitize from "sanitize-html";

export const unsafePatch = (html: string) =>
  /<\s*(script|iframe|object|embed|base|meta|link|style)\b|\bon[a-z]+\s*=|(?:javascript|vbscript)\s*:|srcdoc\s*=/i.test(html);

/** Validate before offering code for copying; do not silently rewrite AI code. */
export function validPatch(html: string): boolean {
  if (unsafePatch(html)) return false;
  let depth = 0, roots = 0, safe = true;
  sanitize(html, {
    allowedTags: false, allowedAttributes: false, allowVulnerableTags: true,
    onOpenTag(name, attributes) {
      if (depth++ === 0) roots++;
      if (/^(script|iframe|object|embed|base|meta|link|style)$/.test(name)) safe = false;
      for (const [key, value] of Object.entries(attributes)) {
        if (/^on/i.test(key) || key === "srcdoc" ||
          /(?:javascript|vbscript):/i.test(value.replace(/[\s\u0000-\u001f]/g, ""))) safe = false;
      }
    },
    onCloseTag() { depth--; },
    textFilter(text) { if (depth === 0 && text.trim()) safe = false; return text; },
  });
  return safe && roots === 1 && depth === 0;
}
