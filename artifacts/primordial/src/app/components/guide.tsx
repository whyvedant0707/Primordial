const SECTIONS: { h: string; body: string[] }[] = [
  { h: "What a scan does", body: [
    "The server validates the URL, rejects private and internal addresses, loads the single page in a headless Chromium browser at a fixed viewport, injects Axe-core and runs the WCAG 2.0 and 2.1 Level A and AA rules.",
    "Results include the failing rule, its impact, the affected HTML, CSS selectors and, where the browser reports them, element coordinates on the captured screenshot.",
  ] },
  { h: "What it cannot tell you", body: [
    "Automated tools detect only a portion of WCAG failures. A page with zero detected violations is not necessarily accessible or conformant.",
    "Judgments such as whether alt text is meaningful, whether focus order is logical or whether content is understandable require a person. Use the Human review tab for those.",
    "Only one page is scanned, in its initial state. Content behind interactions, logins or other routes is not tested.",
  ] },
  { h: "The estimated indicator", body: [
    "The indicator starts at 100 and subtracts a weight per failing rule (critical 10, serious 6, moderate 3, minor 1). It is an internal triage aid, not an official WCAG score or a conformance claim.",
  ] },
  { h: "Fixes and verification", body: [
    "Fixes are generated only when you click Generate fix, for the one element you selected. A configured OpenAI-compatible provider or Gemini returns the suggestion; otherwise a deterministic rule-based suggestion is returned where one exists. Incomplete provider settings and failed requests return an error, not a silent provider fallback.",
    "Apply and verify patches an isolated in-memory copy of the element and re-runs Axe-core. It never touches the live website or your source code. A Verified in simulation status means only that the rule stopped failing in that copy.",
  ] },
  { h: "Highlight colors", body: [
    "Red marks critical, orange serious, yellow moderate and blue minor. When the scanner did not report coordinates for an element, no box is drawn rather than guessing a position.",
  ] },
];

export default function Guide() {
  return (
    <section aria-labelledby="guide-h" className="card p-6 md:p-8">
      <h2 id="guide-h" className="text-lg font-semibold">Scope and limitations</h2>
      <p className="mt-1 text-sm text-ink-2">Target standard: WCAG 2.1 Level AA. Read this before acting on results.</p>
      <p className="mt-2 text-sm"><a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noreferrer" className="text-brand underline">W3C/WAI WCAG 2.1 Quick Reference<span className="sr-only"> (opens in new tab)</span></a></p>
      <div className="mt-6 grid gap-x-10 gap-y-6 md:grid-cols-2">
        <div>
          <h3 id="provider-setup" tabIndex={-1} ref={(node) => {
            if (node && window.location.hash === "#provider-setup") node.focus();
          }} className="text-sm font-semibold">Provider setup instructions</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            Ask the app owner to update the API server&apos;s settings, not this page. Never paste credentials into the scanner, a URL, or a support message.
          </p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-2">
            <li>OpenAI-compatible: set both <code>OPENAI_BASE_URL</code> and <code>OPENAI_MODEL</code>. The base URL must use HTTP(S), include the provider&apos;s API prefix if needed (such as /v1), and contain no credentials, query, or fragment.</li>
            <li><code>OPENAI_API_KEY</code> is optional for providers that do not require authentication. If required, store it only as a server secret. An invalid key format must be corrected there.</li>
            <li>Any OpenAI-compatible setting, even an empty one, selects that provider ahead of Gemini. To intentionally use Gemini instead, remove all three OpenAI-compatible settings and configure <code>GEMINI_API_KEY</code> as a server secret.</li>
            <li>For Gemini, check <code>GEMINI_MODEL</code>: use a model ID containing only letters, numbers, dots, underscores, or hyphens, or leave it unset to use <code>gemini-2.5-flash</code>.</li>
          </ul>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            After updating settings, restart the API server and use Refresh provider status above without reloading this page. Configuration checks do not confirm that credentials or model access work; generate a fix to test the selected provider.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink-2">
            A failed configuration or provider request will not silently fall back to another provider or to deterministic suggestions. Deterministic suggestions are used only when no AI provider is configured.
          </p>
          <a href="https://docs.replit.com/core-concepts/project-editor/app-setup/secrets" target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm font-medium text-brand underline underline-offset-2">
            Safe server-secret setup in Replit<span className="sr-only"> (opens in new tab)</span>
          </a>
        </div>
        {SECTIONS.map((s) => (
          <div key={s.h}>
            <h3 className="text-sm font-semibold">{s.h}</h3>
            {s.body.map((p) => <p key={p} className="mt-2 text-sm leading-relaxed text-ink-2">{p}</p>)}
          </div>
        ))}
      </div>
    </section>
  );
}
