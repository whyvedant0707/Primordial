---
name: Environment presence inspection
description: Avoid false missing-variable reports when inspecting platform settings.
---

Inspect environment settings within their returned scope; do not infer absence
by looking for a variable directly on the outer `envVars` object. In this
runtime, `viewEnvVars` groups non-secret values under `envVars.shared` (or the
other scope), whereas `secrets` maps names directly to presence booleans.

**Why:** An incorrect assumption about the callback response shape produced
false missing-variable results even after the owner saved both settings.

**How to apply:** Keep output restricted to presence booleans. Distinguish saved
settings from settings inherited by the running service; confirm the latter
with safe application diagnostics after restarting the relevant workflow.
