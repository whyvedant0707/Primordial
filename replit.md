# Primordial — Accessibility Copilot

Single-page accessibility auditing MVP for CoNSTruct 2.0. Target rules:
WCAG 2.0/2.1 Levels A and AA. Automated results and the internal estimated
indicator are not a WCAG conformance certification.

## Run

Use the artifact-managed workflows, not `pnpm dev` at the workspace root:

- `artifacts/primordial: web` — Next.js App Router dashboard at `/`.
- `artifacts/api-server: API Server` — Express API at `/api`.
- `artifacts/mockup-sandbox: Component Preview Server` — pre-existing canvas.

Managed workflows provide `PORT` and `BASE_PATH`. Browser API calls use
same-origin `/api/...`; never hardcode development hostnames or service ports.
The frontend has server-side Next.js production build and run commands.

## Optional configuration

Use Replit Secrets; never paste keys into source code:

- `GEMINI_API_KEY`: enables Google Gemini on explicit Generate AI Fix clicks
  when no OpenAI-compatible settings are present. With neither provider
  configured, supported rules return clearly labeled deterministic templates;
  unsupported rules return a configuration message. No automatic AI calls or
  retries occur. Screenshots and the complete document are not sent to AI.
- `GEMINI_MODEL`: optional model name, defaults to `gemini-2.5-flash`.
- `OPENAI_BASE_URL` and `OPENAI_MODEL`: together select an OpenAI-compatible
  provider ahead of Gemini. The base URL must include any API prefix such as
  `/v1`; the server appends only `/chat/completions`, never another `/v1`.
  No endpoint or model default is hardcoded.
- `OPENAI_API_KEY`: optional server-side secret for Bearer authentication.
  Leave it unset for a proxy without authentication. Providing any OpenAI
  setting without both a nonempty base URL and model returns a configuration
  error, even if Gemini is configured. Remove all three settings to return to
  Gemini or deterministic templates.
- Both AI providers use one request per explicit action, with a 20-second
  timeout, no redirects, retries or failover. Returned JSON (optionally wrapped
  in one complete JSON Markdown fence) must pass the same remediation Zod
  schema. Provider configuration status does not establish live connectivity.
- The API reads these names directly from `process.env` in
  `src/services/llm.ts`; no dotenv loader or frontend `NEXT_PUBLIC_*` setting
  supplies them. After changing environment settings, restart
  `artifacts/api-server: API Server`. Its startup log reports only nonempty
  presence booleans for the three OpenAI settings, never their values.
  Restarting and reading `/api/config` do not contact the provider.
  Reload the dashboard afterward: it fetches configuration on mount.
- Provider failures log only provider type, a safe failure category, request
  phase and upstream HTTP status (`null` when no response was received).
  They never log endpoints, credentials, error objects or response bodies.
  The API's own HTTP 503 is not evidence of an upstream HTTP 503.
- A proxy listening on loopback on an owner's Mac is not reachable from the
  Replit cloud backend. Run the backend in that same network context or arrange
  a separately approved, authenticated reachable endpoint before live testing.
  Do not test the local proxy automatically or expose an unauthenticated proxy
  publicly. All keys remain in the API server, never in `NEXT_PUBLIC_*` values.
- `MONGODB_URI`: optional scan-history connection. The chosen database stores
  normalized reports for 7 days with a TTL index, scoped to the authenticated
  Clerk account that started each scan. Screenshots, raw snapshots and
  generated fixes are not persisted. Without a healthy connection, scanning
  works in temporary memory and History is hidden. Signed-out scans remain
  temporary and are not written to shared storage.
- `CHROMIUM_PATH`: optional executable override. Development prefers the
  current workspace Chromium. Production finds Chromium on PATH from the
  declared Nix dependency, without a Playwright download or workspace-only
  tools. Sites may bot-block particular browser versions; W3C's demo blocks
  the current Nix Chromium but allows the workspace Chromium. The Nix browser
  was separately tested scanning example.com and running isolated re-tests.

Gemini and MongoDB were not configured during initial implementation. Their live
service paths require credentials and have not been integration-tested.
No PostgreSQL schema, seed or DB push belongs to this product. Existing
Drizzle/PostgreSQL workspace packages are unused scaffold.

## Product behavior and limits

- Actual Playwright Chromium rendering and Axe-core audits, with a fixed
  1280×800 viewport screenshot and reliable visible-element bounding boxes.
- One initial public page state only. No crawling, cookies from the scanned
  site, payments, GitHub automation, or full-site compliance claims.
- Public HTTP(S) only on ports 80/443. IPv4/IPv6 private, local, reserved and
  metadata addresses are blocked. A local egress proxy validates all resolved
  addresses and pins each connection to a validated literal IP, including
  redirects and subresources. Chromium has no proxy bypass; WebSockets,
  service workers, non-GET/HEAD page requests and non-HTTP navigation are blocked.
- At most two scan/verification browsers; bounded resource counts and a
  32 MiB transfer budget per scan. Navigation is limited to 20 seconds;
  a whole scan is limited to 45 seconds. Some complex or protected sites
  cannot be scanned. The user sees an error, not invented results.
- At most 12 temporary reports, retained up to 30 minutes or server restart.
  Earlier completed reports may be evicted at capacity. DOM snapshots are
  limited to 2 MB. Screenshot bytes and snapshots stay in bounded server
  memory, not Git, local durable files or the database.
- Isolated verification uses sanitized captured HTML, blocks all network and
  active page code, reproduces the selected baseline issue, applies one safe
  element replacement, then re-runs Axe. It detects remaining issues and new
  rule/element combinations. Document roots, frames, shadow DOM and cases
  that cannot be reproduced return Verification unavailable.
- Suggested HTML is checked before it is stored or offered for copying.
  Verification refuses replacements that remove visible text, change the
  element type, or hide, disable or remove interactive controls.
- Simulation does not modify or verify the live website or repository.
  External styles, state, keyboard behavior and semantic correctness may not
  be reproduced. Placeholder labels and alt text always require human review.
- Human-review selections are per scan and local to the browser. They are
  not stored in MongoDB or shared with other users/devices.
  Copy summary includes the current browser's nine answers, including
  unanswered items. It is not a separate server-side saved-report export.
- Sign-in is required to save reports and view private history. Anonymous
  scanning remains available; those reports are temporary and accessible only
  through their short-lived scan ID. URLs with sensitive query strings and
  private content must not be submitted.

## Verification

- `pnpm run typecheck` — shared libraries and workspace leaf packages.
- `pnpm --filter @workspace/api-server run test` — deterministic safety and
  actual isolated-browser verification tests (fixture data is test-only).
  Storage-boundary tests use an isolated fake backend to cover optional
  MongoDB startup, seven-day expiry, temporary asset exclusion, and failure
  handling; they do not establish live MongoDB connectivity or restart behavior.
- `pnpm --filter @workspace/primordial run test` — component regressions,
  all checklist statuses/counts/scan isolation, clipboard boundaries and guidance.
- `MONGODB_LIVE_TEST=1 MONGODB_TEST_URI=<dedicated-test-database-uri> pnpm --filter @workspace/api-server exec tsx --test src/services/mongo-live.test.ts`
  — opt-in only; requires a separate authorized URI whose database name ends
  with `test`. Never use the application `MONGODB_URI`. Checks MongoDB TTL
  configuration, seven-day expiry, restart persistence and temporary-asset
  exclusion, then deletes only its uniquely identified fixture records.
- `pnpm --filter @workspace/api-server exec node tests/browser-flow.mjs` —
  end-to-end browser journey against running managed workflows through
  `http://localhost:80`; scans W3C's intentionally inaccessible demo, checks
   filters, screenshot mapping, configured-provider corrections, copies, simulation,
  browser-local review persistence and mobile width.
- `curl -fsS http://localhost:80/api/healthz` — shared-proxy health check.

Browser reports/screenshots go under ignored `generated-artifacts/`.
Production assets are built by the artifact service. Keep `.next`,
dependencies and generated verification files out of Git.

## Maintenance

API contracts live in `lib/api-spec/openapi.yaml`. After changes run
`pnpm --filter @workspace/api-spec run codegen`; it regenerates client
functions and server Zod schemas and checks shared library declarations.
Keep DOM iterable typings for generated header handling and React Query v5
generation. Server runtime packages that load resources dynamically are
externalized in the API build.

The authoritative MVP brief is the shorter uploaded Build Accessibility
Copilot document. The longer research document includes unsubstantiated
implementation/test/benchmark claims and roadmap-only features; do not
repeat those as actual measurements or implemented functionality.

Preserve Next.js; template availability is not permission to migrate to Vite.
Consult the installed Next.js documentation before using unfamiliar APIs.
