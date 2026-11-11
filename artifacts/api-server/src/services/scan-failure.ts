import type { ScanFailure } from "@workspace/api-zod";
import { PublicError } from "./network";

export class ScanNavigationError extends PublicError {
  constructor(public readonly httpStatus?: number) {
    super(httpStatus === undefined
      ? "The website did not return a page response. No accessibility audit was run."
      : `The website returned HTTP ${httpStatus} while loading. It may reject automated access from this server. No accessibility audit was run.`);
  }
}

const stages = new Set([
  "Validating URL", "Launching browser", "Loading website",
  "Running accessibility checks", "Preparing results",
]);
const networkErrors = new Set<NonNullable<ScanFailure["networkError"]>>([
  "ERR_NAME_NOT_RESOLVED", "ERR_CONNECTION_REFUSED", "ERR_CONNECTION_RESET",
  "ERR_CONNECTION_CLOSED", "ERR_CONNECTION_TIMED_OUT", "ERR_PROXY_CONNECTION_FAILED",
  "ERR_TUNNEL_CONNECTION_FAILED", "ERR_CERT_AUTHORITY_INVALID", "ERR_CERT_DATE_INVALID",
  "ERR_SSL_PROTOCOL_ERROR", "ERR_TIMED_OUT", "ERR_ABORTED", "ERR_FAILED",
]);

export function describeScanFailure(error: unknown, stage: string, expired: boolean) {
  const details: ScanFailure = { stage: stages.has(stage) ? stage : "Unknown", category: "unknown" };
  // Inspect errors for allowlisted codes only. Never return or log the raw error:
  // browser messages may contain URLs, headers, or other sensitive content.
  const text = error instanceof Error ? error.message : "";
  const code = text.match(/\bERR_[A-Z_]+\b/)?.[0] as ScanFailure["networkError"];
  if (code && networkErrors.has(code)) details.networkError = code;
  let message: string;
  if (error instanceof ScanNavigationError) {
    details.category = error.httpStatus === undefined ? "no-response" : "http-response";
    if (error.httpStatus !== undefined) details.httpStatus = error.httpStatus;
    message = error.message;
  } else if (expired || error instanceof Error && (error.name === "TimeoutError" || /timeout|timed out/i.test(text))) {
    details.category = "timeout";
    message = `The scan timed out during ${details.stage.toLowerCase()}. No completed accessibility result exists.`;
  } else if (error instanceof PublicError) {
    if (text === "The website hostname could not be resolved. Check the URL.") {
      details.category = "navigation-network";
      details.networkError = "ERR_NAME_NOT_RESOLVED";
    } else {
      details.category = "security-policy";
    }
    message = error.message;
  } else if (stage === "Launching browser") {
    details.category = "browser-launch";
    message = "The scanner's browser could not start. Ask the app owner to inspect the browser installation and launch configuration.";
  } else if (stage === "Loading website") {
    details.category = "navigation-network";
    message = `The browser could not load the website${details.networkError ? ` (${details.networkError})` : ""}. No accessibility audit was run.`;
  } else if (stage === "Running accessibility checks") {
    details.category = "axe-execution";
    message = "The accessibility checks could not complete. No completed accessibility result exists.";
  } else if (stage === "Preparing results") {
    details.category = "snapshot-capture";
    message = "The scan could not finish preparing its screenshot and results. No completed accessibility result exists.";
  } else {
    message = "The scan could not complete. Ask the app owner to inspect the scan failure category and stage.";
  }
  return { message, details };
}
