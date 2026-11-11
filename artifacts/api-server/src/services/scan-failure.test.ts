import { test } from "node:test";
import assert from "node:assert/strict";
import { describeScanFailure, ScanNavigationError } from "./scan-failure";
import { PublicError } from "./network";
import { GetScanResponse } from "@workspace/api-zod";

test("navigation diagnostics retain target HTTP status without inventing a browser-installation failure", () => {
  const result = describeScanFailure(new ScanNavigationError(403), "Loading website", false);
  assert.deepEqual(result.details, { category: "http-response", stage: "Loading website", httpStatus: 403 });
  assert.match(result.message, /HTTP 403/);
  assert.match(result.message, /No accessibility audit was run/);
  assert.equal(describeScanFailure(new ScanNavigationError(), "Loading website", false).details.category, "no-response");
  assert.equal(describeScanFailure(new Error("Executable does not exist"), "Launching browser", false).details.category, "browser-launch");
});

test("only allowlisted failure stages and network codes leave the scanner", () => {
  const result = describeScanFailure(
    new Error("page.goto: net::ERR_TUNNEL_CONNECTION_FAILED https://private.example/?token=never-log-this"),
    "Loading website", false,
  );
  assert.equal(result.details.networkError, "ERR_TUNNEL_CONNECTION_FAILED");
  assert.equal(result.details.category, "navigation-network");
  assert.doesNotMatch(JSON.stringify(result), /private\.example|never-log-this|token=/);
  const unknown = describeScanFailure(new Error("ERR_SECRET_TOKEN secret value"), "secret-stage", false);
  assert.deepEqual(unknown.details, { stage: "Unknown", category: "unknown" });
  assert.doesNotMatch(JSON.stringify(unknown), /secret-stage|ERR_SECRET_TOKEN|secret value/);
});

test("timeouts, security denials, audit errors and snapshot failures remain distinct", () => {
  const timeout = describeScanFailure(new Error("Navigation timed out"), "Loading website", false);
  assert.equal(timeout.details.category, "timeout");
  assert.equal(describeScanFailure(new Error("Target closed"), "Loading website", false).details.category, "navigation-network");
  const denied = describeScanFailure(new PublicError("Private addresses are blocked"), "Validating URL", false);
  assert.equal(denied.details.category, "security-policy");
  assert.match(denied.message, /blocked/);
  const dns = describeScanFailure(new PublicError("The website hostname could not be resolved. Check the URL."), "Validating URL", false);
  assert.equal(dns.details.category, "navigation-network");
  assert.equal(dns.details.networkError, "ERR_NAME_NOT_RESOLVED");
  assert.equal(describeScanFailure(new Error("Axe failed"), "Running accessibility checks", false).details.category, "axe-execution");
  assert.equal(describeScanFailure(new Error("Screenshot failed"), "Preparing results", false).details.category, "snapshot-capture");
});

test("scan response validation retains diagnostic details in a failed report", () => {
  const failure = describeScanFailure(new ScanNavigationError(503), "Loading website", false);
  const response = GetScanResponse.parse({
    id: "test-scan", url: "https://example.com", createdAt: new Date().toISOString(),
    status: "failed", stage: "Failed", issues: [], warnings: [],
    error: failure.message, failure: failure.details,
  });
  assert.equal(response.failure?.httpStatus, 503);
});
