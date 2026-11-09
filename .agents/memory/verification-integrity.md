---
name: Conservative simulation verification
description: Why valid HTML corrections may still be refused by isolated verification.
---

Do not certify a fix merely because the selected Axe violation disappears.
Preserve the affected element's visible content and functional identity, and
reject replacements that remove, hide, or disable it.

**Why:** Removing an unnamed button or contrast-failing text can make Axe stop
reporting the rule without improving accessibility. Some otherwise reasonable
structural rewrites must therefore remain explicitly unverified.

**How to apply:** Keep baseline reproduction, target identity, and regression
checks independent. Validated copyable HTML is not automatically verified HTML.
When a structural rewrite cannot be evaluated conservatively, return an honest
unavailable result and require manual application plus a live rescan.
