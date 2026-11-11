// Only known WCAG 2.1 Understanding documents are linked; never invent a slug
// from a provider's free-form explanation or an Axe conformance-level tag.
export const WCAG_SLUGS: Record<string, string> = {
  "1.1.1": "non-text-content", "1.2.1": "audio-only-and-video-only-prerecorded",
  "1.2.2": "captions-prerecorded", "1.2.5": "audio-description-prerecorded",
  "1.3.1": "info-and-relationships", "1.4.1": "use-of-color",
  "1.4.3": "contrast-minimum", "1.4.4": "resize-text", "1.4.10": "reflow",
  "2.1.1": "keyboard", "2.4.3": "focus-order", "2.4.4": "link-purpose-in-context",
  "2.4.6": "headings-and-labels", "2.4.7": "focus-visible",
  "3.3.1": "error-identification", "3.3.2": "labels-or-instructions", "3.3.3": "error-suggestion",
  "4.1.1": "parsing", "4.1.2": "name-role-value",
};
export function criteria(tags: string[]): string[] {
  return [...new Set(tags.flatMap(tag => {
    const compact = /^wcag([1-4])(\d)(\d+)$/.exec(tag);
    const criterion = compact ? `${compact[1]}.${compact[2]}.${compact[3]}` : tag;
    return /^[1-4]\.\d\.\d+$/.test(criterion) ? [criterion] : [];
  }))];
}
export const guidanceUrl = (criterion: string) => WCAG_SLUGS[criterion]
  ? `https://www.w3.org/WAI/WCAG21/Understanding/${WCAG_SLUGS[criterion]}.html`
  : null;
