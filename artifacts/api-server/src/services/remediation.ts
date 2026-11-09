import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Fix, IssueInput } from "@workspace/api-zod";
import { getRecord } from "./store";
import { PublicError } from "./network";
import { parseSuggestionText, requestSuggestion, resolveProvider } from "./llm";
import { validPatch } from "./patch-safety";

export function selectedIssue(input: IssueInput) {
  const record = getRecord(input.scanId);
  const issue = record?.scan.issues.find(i => i.id === input.issueId);
  const node = issue?.nodes[input.nodeIndex];
  if (!record || record.scan.status !== "complete" || !issue || !node)
    throw new PublicError("This issue has expired or is unavailable. Run a new scan.", 404);
  return { record, issue, node };
}
const aiSchema = z.object({
  suggested: z.string().min(1).max(20000),
  explanation: z.string().min(1).max(3000),
  correction: z.string().min(1).max(3000),
});
function attribute(html: string, name: string, value: string) {
  const clean = html.replace(new RegExp(`\\s${name}\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s>]+)`, "gi"), "");
  return clean.replace(/^<([a-z][a-z0-9-]*)\b/i, `<$1 ${name}="${value}"`);
}
export async function generateFix(input: IssueInput): Promise<Fix> {
  const { record, issue, node } = selectedIssue(input);
  if (record.fixes.size >= 40) throw new PublicError("Fix limit reached for this scan. Start a new scan.", 429);
  let source: Fix["source"] = "deterministic";
  let suggested = "";
  let explanation = issue.description;
  let correction = "";
  let warning = "No AI provider is configured. This is a deterministic template, not an AI-generated fix. Replace any descriptive placeholder with context-appropriate text and complete human review.";
  const provider = resolveProvider();
  if (provider.provider !== "deterministic") {
    const response = await requestSuggestion(provider, {
      rule: issue.id, description: issue.description, wcag: issue.wcag,
      html: node.html.slice(0, 12000), failure: node.summary.slice(0, 3000),
    });
    try {
      const parsed = aiSchema.parse(parseSuggestionText(response.text));
      ({ suggested, explanation, correction } = parsed);
    } catch {
      const label = provider.provider === "gemini" ? "Gemini" : "OpenAI-compatible provider";
      throw new PublicError(`${label} returned an invalid structured response. No fix was accepted and no automatic retry was made.`, 503);
    }
    source = response.source;
    warning = "AI suggestions can be incorrect. Review and adapt this rendered HTML to your source component. Simulation does not verify the live site, semantic accuracy, keyboard usability or full WCAG compliance.";
  } else {
    switch (issue.id) {
      case "image-alt":
        suggested = attribute(node.html, "alt", "Describe the image's purpose");
        correction = "Adds an alternative-text template. A human must replace this placeholder with a description appropriate to the image's purpose, or use empty alt text only when it is decorative.";
        break;
      case "button-name": case "link-name": case "label": case "select-name": case "input-button-name":
        suggested = attribute(node.html, "aria-label", issue.id === "label" || issue.id === "select-name" ? "Describe this field" : "Describe this action");
        correction = "Adds an accessible-name template. Replace it with the actual action or field name; a visible associated label is preferred for form fields.";
        break;
      case "html-has-lang":
        suggested = attribute(node.html, "lang", "en");
        correction = "Sets a language declaration. Change en to the actual language of the document; a human must confirm it.";
        break;
      case "frame-title":
        suggested = attribute(node.html, "title", "Describe this embedded content");
        correction = "Adds a title template. Replace it with the actual purpose of the embedded content.";
        break;
      default:
        throw new PublicError("No AI provider is configured, and this rule has no safe deterministic template. Use the rule reference for manual guidance, or configure an AI provider.", 503);
    }
  }
  if (!validPatch(suggested))
    throw new PublicError("The suggested HTML is unsafe or is not one replacement element. No fix was accepted. Review the rule guidance or generate a new suggestion.", 503);
  const fix: Fix = { id: randomUUID(), source, original: node.html, suggested, explanation, correction, wcag: issue.wcag, warning };
  record.fixes.set(fix.id, { input, fix });
  return fix;
}
