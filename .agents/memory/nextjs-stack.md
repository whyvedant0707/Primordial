---
name: Next.js stack approval
description: Product stack constraint and the user's decision when no Next.js artifact template was available.
---

Keep Next.js for the product, even when the artifact bootstrap offers only a
React/Vite web template. The user explicitly chose “Keep Next.js with custom
setup” rather than approving React/Vite.

**Why:** Next.js is part of the requested product stack; template availability
is not permission to change frameworks.

**How to apply:** Treat web bootstrap tooling as registration infrastructure,
not as the product framework. Future product work should use Next.js; ask
before changing the stack.
