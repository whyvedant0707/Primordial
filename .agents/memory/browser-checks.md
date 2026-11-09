---
name: Browser verification fallback
description: Runtime availability can differ from the testing instructions.
---

Use the documented testing callback when available, but do not assume its
configuration kinds are supported by every runtime.

**Why:** The testing instructions were present but this runtime rejected
`config.$kind = "testing"` as unknown. Direct Playwright browser checks worked.

**How to apply:** If that exact capability is unavailable, run the same
interaction checks directly through the installed Playwright package and
the shared proxy. Keep the test real; a screenshot alone cannot verify
copying, filtering, persistence or simulated verification interactions.

External demo sites can bot-block particular Chromium builds even when the
scanner is working. Do not disable certificate checks or weaken the egress
guard just to make a remote test pass.

**Why:** W3C's intentionally inaccessible demo returned a bot challenge to
the Nix Chromium build while allowing the newer workspace browser; the Nix
browser successfully scanned a different public page and ran isolated Axe.

**How to apply:** Diagnose the actual navigation response separately from
the scanner. Use another permitted public test page when needed, preserve
honest blocked-site errors, and avoid promising all websites can be scanned.

Serialized browser functions must be self-contained under both the production
bundler and the TypeScript test runner. Avoid nested named/assigned helper
functions in callbacks sent to Playwright.

**Why:** The TypeScript runner injects a `__name` helper into nested assigned
functions. Playwright serializes the callback without that module-level helper,
causing a browser-side reference error even though typechecking passes.

**How to apply:** Prefer inline callbacks without helper bindings in serialized
functions, and exercise new browser-evaluated code through the actual test
runner as well as the normal backend workflow.

Prefer capturing the clipboard write boundary to unbounded native clipboard
reads in the testing notebook.

**Why:** A native clipboard read hung and reset the notebook, losing the
authenticated browser context despite a successful app-side copy action.

**How to apply:** Capture the argument to a resolved `writeText` replacement
when checking exported bytes, test rejection explicitly, and label that
instrumentation honestly instead of claiming a native clipboard read.
