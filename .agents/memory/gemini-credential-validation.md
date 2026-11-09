---
name: Gemini credential validation
description: A configured Gemini secret may still be rejected by the provider.
---

Treat secret presence as configuration status, not proof that the Gemini API
credential works. Provider access also depends on key validity and permissions
for the Generative Language API.

**Why:** A live request can be rejected even after the key is present and
confirmed through the secure secrets flow.

The owner reports that the current Gemini project does not have free-tier API
access. Keep Gemini optional; do not assume re-entering a key resolves the
account's access or quota limits.

**How to apply:** For provider/account validation, make one explicit selected
issue request and report the sanitized provider category. Do not claim the
account works based only on `/config` or secret-presence status.
