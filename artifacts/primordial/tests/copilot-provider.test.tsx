import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Capabilities, Fix, Scan, Verification } from "@workspace/api-client-react";
import Copilot from "../src/app/components/copilot";
import Guide from "../src/app/components/guide";

vi.mock("@workspace/api-client-react", () => ({
  checkProvider: vi.fn(),
  clearHistory: vi.fn(),
  createScan: vi.fn(),
  deleteHistory: vi.fn(),
  exportScanReport: vi.fn(),
  getConfig: vi.fn(),
  getHistory: vi.fn(),
  getHistoryCount: vi.fn(),
  getScan: vi.fn(),
  remediate: vi.fn(),
  verifyFix: vi.fn(),
}));

vi.mock("../src/app/components/auth-provider", () => ({
  useAppAuth: () => ({
    available: true,
    loaded: true,
    signedIn: true,
    userId: "test-user",
    userLabel: "Test User",
    signOut: vi.fn(),
  }),
}));

import { checkProvider, clearHistory, createScan, deleteHistory, exportScanReport, getConfig, getHistory, getHistoryCount, getScan, remediate, verifyFix } from "@workspace/api-client-react";

const scan: Scan = {
  id: "scan-test",
  url: "https://example.test/",
  createdAt: "2026-11-09T12:00:00.000Z",
  status: "complete",
  stage: "complete",
  issues: [{
    id: "button-name",
    impact: "critical",
    help: "Buttons must have discernible text",
    description: "A button needs an accessible name.",
    helpUrl: "https://example.test/rule",
    wcag: ["412"],
    principle: "Robust",
    nodes: [{ html: "<button></button>", target: ["#action"], summary: "Missing accessible name" }],
  }],
  warnings: [],
};

const openAiFix: Fix = {
  id: "fix-openai",
  source: "openai-compatible",
  original: "<button></button>",
  suggested: '<button aria-label="Search"></button>',
  explanation: "The button has no name.",
  correction: "Adds an accessible label.",
  wcag: ["412"],
  warning: "",
};

const geminiFix: Fix = { ...openAiFix, id: "fix-gemini", source: "gemini" };
const deterministicFix: Fix = { ...openAiFix, id: "fix-rule", source: "deterministic" };
const verified: Verification = {
  status: "Verified in simulation",
  explanation: "The selected rule no longer fails in the isolated simulation.",
  before: 1,
  after: 0,
  regressions: [],
};

const multiElementScan: Scan = {
  ...scan,
  issues: [
    {
      ...scan.issues[0],
      nodes: [
        scan.issues[0].nodes[0],
        { html: '<button id="close"></button>', target: ["#close"], summary: "Missing close button name" },
      ],
    },
    {
      id: "image-alt",
      impact: "serious",
      help: "Images must have alternative text",
      description: "An image needs alternative text.",
      helpUrl: "https://example.test/image-alt",
      wcag: ["111"],
      principle: "Perceivable",
      nodes: [
        { html: '<img id="logo" src="logo.png">', target: ["#logo"], summary: "Missing logo alternative" },
        { html: '<img id="chart" src="chart.png">', target: ["#chart"], summary: "Missing chart alternative" },
      ],
    },
  ],
};

function capabilities(provider: Capabilities["provider"], extra: Partial<Capabilities> = {}): Capabilities {
  return {
    gemini: provider === "gemini",
    provider,
    history: false,
    retention: "temporary",
    ...extra,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function scanThroughUi() {
  render(<Copilot />);
  fireEvent.change(screen.getByTestId("input-url"), { target: { value: "https://example.test/" } });
  fireEvent.click(screen.getByTestId("button-scan"));
  await screen.findByTestId("panel-issue-button-name");
}

describe("provider metadata and verification UI", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.mocked(getConfig).mockResolvedValue(capabilities("openai-compatible"));
    vi.mocked(checkProvider).mockResolvedValue({
      status: "available",
      provider: "openai-compatible",
      message: "Live OpenAI-compatible provider access verified.",
    });
    vi.mocked(createScan).mockResolvedValue(scan);
    vi.mocked(getScan).mockResolvedValue(scan);
    vi.mocked(getHistory).mockResolvedValue([]);
    vi.mocked(getHistoryCount).mockResolvedValue({ count: 0 });
    vi.mocked(remediate).mockResolvedValue(openAiFix);
    vi.mocked(verifyFix).mockResolvedValue(verified);
  });

  it("runs a live provider request only after manual refresh", async () => {
    render(<Copilot />);
    const status = await screen.findByTestId("status-provider");
    expect(status.textContent).toContain("OpenAI-compatible provider configured.");
    expect(status.textContent).not.toContain("Configuration status does not confirm live provider access");
    expect(checkProvider).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("button-refresh-provider"));
    expect(status.textContent).toContain("Testing live provider access");
    await waitFor(() => expect(status.textContent).toContain("Live OpenAI-compatible provider access verified."));
    expect(checkProvider).toHaveBeenCalledOnce();
  });

  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it.each([
    ["openai-compatible", openAiFix, "Generated by OpenAI-compatible provider"],
    ["gemini", geminiFix, "Generated by Gemini"],
    ["deterministic", deterministicFix, "Deterministic rule-based suggestion"],
  ] as const)("shows the correct source badge for %s results", async (provider, fix, badge) => {
    vi.mocked(getConfig).mockResolvedValue(capabilities(provider));
    vi.mocked(remediate).mockResolvedValue(fix);

    await scanThroughUi();
    expect(remediate).not.toHaveBeenCalled();
    expect(verifyFix).not.toHaveBeenCalled();
    if (provider === "deterministic") {
      expect(screen.getByText(/No AI provider is configured.*deterministic rule-based suggestion/i)).toBeTruthy();
    }

    fireEvent.click(screen.getByTestId("button-generate-fix"));
    expect((await screen.findByTestId("text-fix-source")).textContent).toBe(badge);
    expect(remediate).toHaveBeenCalledTimes(1);
  });

  it("explains that scans remain temporary when saved history is unavailable", async () => {
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: false }));
    await scanThroughUi();

    const notice = screen.getByTestId("status-saved-history-unavailable");
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("You can still run scans");
    expect(notice.textContent).toContain("results are temporary");
    expect(notice.textContent).toContain("30 minutes");
    expect(notice.textContent).not.toMatch(/MongoDB|MONGODB_URI|connection/i);
    expect(createScan).toHaveBeenCalledTimes(1);
  });

  it("downloads the shareable export after reopening an owner-saved report", async () => {
    const savedScan = { ...scan, id: "6d595a01-3580-45b6-a197-7c01faed661a" };
    const summary = {
      id: savedScan.id,
      url: savedScan.url,
      createdAt: savedScan.createdAt,
      total: savedScan.issues.length,
    };
    const report = {
      formatVersion: 1 as const,
      scope: "One public page in its initial state.",
      disclaimer: "Not a conformance certification.",
      scan: { url: savedScan.url, createdAt: savedScan.createdAt, issues: [] },
    };
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: true }));
    vi.mocked(getHistory).mockResolvedValue([summary]);
    vi.mocked(getScan).mockResolvedValue(savedScan);
    vi.mocked(exportScanReport).mockResolvedValue(report);
    const createObjectUrl = vi.fn(() => "blob:report-export");
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal("URL", Object.assign(class extends URL {}, {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    render(<Copilot />);
    fireEvent.click(await screen.findByTestId("tab-history"));
    fireEvent.click(await screen.findByTestId(`row-history-${savedScan.id}`));
    await screen.findByTestId("button-export-report");
    fireEvent.click(screen.getByTestId("button-export-report"));

    await waitFor(() => expect(exportScanReport).toHaveBeenCalledExactlyOnceWith(savedScan.id));
    expect(createObjectUrl).toHaveBeenCalledExactlyOnceWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("text-export-error")).toBeNull();
  });

  it("confirms report deletion and removes the row after the owner-scoped request succeeds", async () => {
    const report = {
      id: "6d595a01-3580-45b6-a197-7c01faed661a",
      url: "https://private.example.test/",
      createdAt: "2026-11-09T12:00:00.000Z",
      total: 2,
    };
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: true }));
    vi.mocked(getHistory).mockResolvedValue([report]);
    vi.mocked(deleteHistory).mockResolvedValue(undefined);
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<Copilot />);
    fireEvent.click(await screen.findByTestId("tab-history"));
    expect(await screen.findByTestId(`row-history-${report.id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`button-delete-history-${report.id}`));

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining(report.url));
    await waitFor(() => expect(deleteHistory).toHaveBeenCalledExactlyOnceWith(report.id));
    await waitFor(() => expect(screen.queryByTestId(`row-history-${report.id}`)).toBeNull());
    expect(screen.getByText("No scans recorded yet. Completed scans will appear here.")).toBeTruthy();
  });

  it("keeps a report when deletion is cancelled or fails", async () => {
    const report = {
      id: "b45711ad-e880-4cb1-b640-814b23aab337",
      url: "https://private.example.test/",
      createdAt: "2026-11-09T12:00:00.000Z",
      total: 1,
    };
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: true }));
    vi.mocked(getHistory).mockResolvedValue([report]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<Copilot />);
    fireEvent.click(await screen.findByTestId("tab-history"));
    expect(await screen.findByTestId(`row-history-${report.id}`)).toBeTruthy();
    fireEvent.click(screen.getByTestId(`button-delete-history-${report.id}`));
    expect(confirm).toHaveBeenCalledOnce();
    expect(deleteHistory).not.toHaveBeenCalled();
    expect(screen.getByTestId(`row-history-${report.id}`)).toBeTruthy();

    confirm.mockReturnValue(true);
    vi.mocked(deleteHistory).mockRejectedValueOnce(new Error("Delete request failed."));
    fireEvent.click(screen.getByTestId(`button-delete-history-${report.id}`));
    expect(await screen.findByTestId("text-delete-history-error")).toBeTruthy();
    expect(screen.getByTestId(`row-history-${report.id}`)).toBeTruthy();
  });

  it("confirms the total report count and clears the history after success", async () => {
    const report = {
      id: "6d595a01-3580-45b6-a197-7c01faed661a",
      url: "https://private.example.test/",
      createdAt: "2026-11-09T12:00:00.000Z",
      total: 2,
    };
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: true }));
    vi.mocked(getHistory).mockResolvedValue([report]);
    vi.mocked(getHistoryCount).mockResolvedValue({ count: 28 }).mockResolvedValueOnce({ count: 25 });
    vi.mocked(clearHistory).mockResolvedValue({ deleted: 25 });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<Copilot />);
    fireEvent.click(await screen.findByTestId("tab-history"));
    expect(await screen.findByTestId("button-clear-history")).toBeTruthy();
    fireEvent.click(screen.getByTestId("button-clear-history"));

    await waitFor(() => expect(confirm).toHaveBeenCalledWith("Clear all 28 saved reports? This cannot be undone."));
    await waitFor(() => expect(clearHistory).toHaveBeenCalledOnce());
    expect(getHistoryCount).toHaveBeenCalledTimes(2);
    expect((await screen.findByTestId("text-clear-history-success")).textContent).toBe("Cleared 25 saved reports.");
    expect(screen.getByText("No scans recorded yet. Completed scans will appear here.")).toBeTruthy();
    expect(screen.queryByTestId(`row-history-${report.id}`)).toBeNull();
  });

  it("keeps history visible and reports a clear failure", async () => {
    const report = {
      id: "b45711ad-e880-4cb1-b640-814b23aab337",
      url: "https://private.example.test/",
      createdAt: "2026-11-09T12:00:00.000Z",
      total: 1,
    };
    vi.mocked(getConfig).mockResolvedValue(capabilities("deterministic", { history: true }));
    vi.mocked(getHistory).mockResolvedValue([report]);
    vi.mocked(getHistoryCount).mockResolvedValue({ count: 1 });
    vi.mocked(clearHistory).mockRejectedValueOnce(new Error("Clear request failed."));
    vi.spyOn(window, "confirm").mockReturnValue(true);

    render(<Copilot />);
    fireEvent.click(await screen.findByTestId("tab-history"));
    fireEvent.click(await screen.findByTestId("button-clear-history"));

    expect((await screen.findByTestId("text-delete-history-error")).textContent).toContain("Clear request failed.");
    expect(screen.getByTestId(`row-history-${report.id}`)).toBeTruthy();
  });

  it.each(["openai-compatible", "gemini", "deterministic"] as const)(
    "checks live %s access without losing the selected element",
    async (provider) => {
      vi.mocked(getConfig).mockResolvedValueOnce(capabilities("configuration-error"));
      vi.mocked(createScan).mockResolvedValueOnce(multiElementScan);
      await scanThroughUi();
      fireEvent.change(screen.getByTestId("select-node"), { target: { value: "1" } });
      const selectedHtml = screen.getByTestId("text-node-html").textContent;
      const scanUrl = window.location.href;
      vi.mocked(checkProvider).mockResolvedValueOnce(provider === "deterministic"
        ? { status: "unavailable", provider, message: "No AI provider is configured." }
        : { status: "available", provider, message: `Live ${provider} provider access verified.` });

      fireEvent.click(screen.getByTestId("button-refresh-provider"));
      expect(screen.getByTestId("status-provider").textContent).toContain("Testing live provider access");
      expect((screen.getByTestId("button-refresh-provider") as HTMLButtonElement).disabled).toBe(true);
      await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain(
        provider === "deterministic" ? "No AI provider is configured." : `Live ${provider} provider access verified.`,
      ));
      expect(checkProvider).toHaveBeenCalledOnce();
      expect(getConfig).toHaveBeenCalledTimes(2);

      expect(screen.queryByTestId("text-provider-configuration-error")).toBeNull();
      expect((screen.getByTestId("select-node") as HTMLSelectElement).value).toBe("1");
      expect(screen.getByTestId("text-node-html").textContent).toBe(selectedHtml);
      expect(window.location.href).toBe(scanUrl);
      expect(createScan).toHaveBeenCalledTimes(1);
      expect(getScan).not.toHaveBeenCalled();
      expect(remediate).not.toHaveBeenCalled();
      expect(verifyFix).not.toHaveBeenCalled();

      fireEvent.click(screen.getByTestId("button-generate-fix"));
      await screen.findByTestId("panel-fix");
      expect(remediate).toHaveBeenCalledExactlyOnceWith({
        scanId: scan.id, issueId: "button-name", nodeIndex: 1,
      });
    },
  );

  it("preserves existing fixes, verification, and filters through failed and successful live checks", async () => {
    await scanThroughUi();
    fireEvent.click(screen.getByTestId("button-filter-critical"));
    fireEvent.change(screen.getByTestId("select-principle"), { target: { value: "Robust" } });
    const criticalPressedBefore = screen.getByTestId("button-filter-critical").getAttribute("aria-pressed");
    fireEvent.click(screen.getByTestId("button-generate-fix"));
    await screen.findByTestId("panel-fix");
    fireEvent.click(screen.getByTestId("button-verify"));
    await screen.findByTestId("status-verification");
    const fixHtml = screen.getByTestId("text-fix-suggested").textContent;
    const verification = screen.getByTestId("status-verification").textContent;
    vi.mocked(checkProvider).mockResolvedValueOnce({
      status: "unavailable",
      provider: "openai-compatible",
      message: "The provider rejected the API key or access.",
    });

    fireEvent.click(screen.getByTestId("button-refresh-provider"));
    await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain("rejected the API key"));
    expect(screen.getByTestId("text-fix-suggested").textContent).toBe(fixHtml);
    expect(screen.getByTestId("status-verification").textContent).toBe(verification);

    vi.mocked(checkProvider).mockResolvedValueOnce({
      status: "available",
      provider: "gemini",
      message: "Live Gemini provider access verified.",
    });
    fireEvent.click(screen.getByTestId("button-refresh-provider"));
    await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain("Live Gemini provider access verified."));
    expect(screen.getByTestId("text-fix-suggested").textContent).toBe(fixHtml);
    expect(screen.getByTestId("status-verification").textContent).toBe(verification);
    expect(screen.getByTestId("button-filter-critical").getAttribute("aria-pressed")).toBe(criticalPressedBefore);
    expect((screen.getByTestId("select-principle") as HTMLSelectElement).value).toBe("Robust");
    expect(checkProvider).toHaveBeenCalledTimes(2);
    expect(remediate).toHaveBeenCalledTimes(1);
    expect(verifyFix).toHaveBeenCalledTimes(1);
    expect(createScan).toHaveBeenCalledTimes(1);
  });

  it("retries a failed initial configuration request without changing the draft or current view", async () => {
    vi.mocked(getConfig).mockRejectedValueOnce(new Error("API unavailable"));
    render(<Copilot />);
    await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain("Could not refresh"));
    fireEvent.change(screen.getByTestId("input-url"), { target: { value: "https://draft.example.test/" } });
    fireEvent.click(screen.getByTestId("tab-guide"));
    fireEvent.click(screen.getByTestId("button-refresh-provider"));
    await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain("Live OpenAI-compatible provider access verified."));
    expect(checkProvider).toHaveBeenCalledOnce();
    expect(screen.getByTestId("tab-guide").getAttribute("aria-current")).toBe("page");
    fireEvent.click(screen.getByTestId("tab-scan"));
    expect((screen.getByTestId("input-url") as HTMLInputElement).value).toBe("https://draft.example.test/");
    expect(createScan).not.toHaveBeenCalled();
    expect(remediate).not.toHaveBeenCalled();
    expect(verifyFix).not.toHaveBeenCalled();
  });

  it("keeps showing a configuration error if the server settings are still incomplete", async () => {
    vi.mocked(getConfig).mockResolvedValue(capabilities("configuration-error"));
    vi.mocked(checkProvider).mockResolvedValueOnce({
      status: "unavailable",
      provider: "configuration-error",
      message: "OpenAI-compatible configuration is incomplete.",
    });
    await scanThroughUi();
    fireEvent.click(screen.getByTestId("button-refresh-provider"));
    await waitFor(() => expect(screen.getByTestId("status-provider").textContent).toContain("configuration is incomplete"));
    expect((screen.getByTestId("button-refresh-provider") as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("text-provider-configuration-error")).toBeTruthy();
    expect(remediate).not.toHaveBeenCalled();
  });

  it("explains configuration errors without promising a provider fallback", async () => {
    vi.mocked(getConfig).mockResolvedValue(capabilities("configuration-error", {
      providerError: "Provider settings are incomplete. Configure the base URL and model together.",
    }));
    await scanThroughUi();

    expect(screen.getByText("Provider settings are incomplete. Configure the base URL and model together.")).toBeTruthy();
    expect(screen.getByText(/A failed configuration will not silently fall back/)).toBeTruthy();
    expect(remediate).not.toHaveBeenCalled();

    const setupLink = screen.getByRole("link", { name: "Provider setup instructions" });
    expect(setupLink.getAttribute("href")).toBe("#provider-setup");
    fireEvent.click(setupLink);
    expect(screen.getByRole("heading", { name: "Provider setup instructions" }).id).toBe("provider-setup");
    expect(screen.getByText(/set both/, { selector: "li" }).textContent).toContain("OPENAI_BASE_URL");
    expect(screen.getByText(/set both/, { selector: "li" }).textContent).toContain("OPENAI_MODEL");
    expect(screen.getByRole("link", { name: /Safe server-secret setup in Replit/ }).getAttribute("href"))
      .toBe("https://docs.replit.com/core-concepts/project-editor/app-setup/secrets");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(remediate).not.toHaveBeenCalled();
  });

  it.each([
    undefined,
    "OPENAI_BASE_URL must be an HTTP(S) API base URL without credentials, a query or a fragment.",
    "OPENAI_API_KEY contains invalid header characters. Check server configuration.",
    "GEMINI_MODEL is invalid. Ask the app owner to check configuration.",
  ])("keeps setup help and the no-fallback warning visible for %s", async (providerError) => {
    vi.mocked(getConfig).mockResolvedValue(capabilities("configuration-error", { providerError }));
    await scanThroughUi();

    const notice = screen.getByTestId("text-provider-configuration-error");
    expect(notice.textContent).toContain(providerError || "OPENAI_BASE_URL and OPENAI_MODEL");
    expect(notice.textContent).toContain("will not silently fall back to another provider or to deterministic suggestions");
    expect(screen.getByRole("link", { name: "Provider setup instructions" })).toBeTruthy();
    expect(remediate).not.toHaveBeenCalled();
  });

  it("clears a prior verification when regeneration fails and never claims verification", async () => {
    await scanThroughUi();
    fireEvent.click(screen.getByTestId("button-generate-fix"));
    await screen.findByTestId("text-fix-source");
    fireEvent.click(screen.getByTestId("button-verify"));
    expect((await screen.findByTestId("status-verification")).textContent).toContain("Verified in simulation");
    expect(verifyFix).toHaveBeenCalledTimes(1);

    const retry = deferred<Fix>();
    vi.mocked(remediate).mockReturnValueOnce(retry.promise);
    fireEvent.click(screen.getByTestId("button-regenerate"));

    await waitFor(() => expect(screen.queryByTestId("status-verification")).toBeNull());
    expect(screen.getByText("Generating...")).toBeTruthy();
    retry.reject(new Error("The configured provider returned an error."));

    expect((await screen.findByTestId("text-fix-error")).textContent).toContain("The configured provider returned an error.");
    expect(screen.queryByTestId("status-verification")).toBeNull();
    expect(screen.queryByText(/Verified in simulation/)).toBeNull();
    expect(remediate).toHaveBeenCalledTimes(2);
  });

  it.each(["success", "failure"] as const)(
    "clears only the regenerated selection's verification after a deferred %s while navigating elements and violations",
    async (outcome) => {
      vi.mocked(createScan).mockResolvedValue(multiElementScan);
      await scanThroughUi();

      const first = {
        issueId: "button-name",
        nodeIndex: 0,
        fix: {
          ...openAiFix,
          id: "fix-button-name-0",
          original: multiElementScan.issues[0].nodes[0].html,
          suggested: '<button aria-label="Search">Search</button>',
        },
        verification: { ...verified, explanation: "Simulation result for the search button" },
      };
      const other = {
        issueId: "image-alt",
        nodeIndex: 0,
        fix: {
          ...openAiFix,
          id: "fix-image-alt-0",
          original: multiElementScan.issues[1].nodes[0].html,
          suggested: '<img id="logo" src="logo.png" alt="Company logo">',
        },
        verification: { ...verified, explanation: "Simulation result for the company logo" },
      };
      const regeneratedFix = {
        ...first.fix,
        id: "fix-button-name-0-regenerated",
        suggested: '<button aria-label="Search site">Search</button>',
      };

      function select(issueId: string, nodeIndex: number) {
        fireEvent.click(screen.getByTestId(`card-issue-${issueId}`));
        expect((screen.getByTestId("select-node") as HTMLSelectElement).value).toBe("0");
        if (nodeIndex !== 0) {
          fireEvent.change(screen.getByTestId("select-node"), { target: { value: String(nodeIndex) } });
        }
      }

      for (const selection of [first, other]) {
        select(selection.issueId, selection.nodeIndex);
        vi.mocked(remediate).mockResolvedValueOnce(selection.fix);
        fireEvent.click(screen.getByTestId("button-generate-fix"));
        expect((await screen.findByTestId("text-fix-suggested")).textContent).toBe(selection.fix.suggested);

        vi.mocked(verifyFix).mockResolvedValueOnce(selection.verification);
        fireEvent.click(screen.getByTestId("button-verify"));
        expect((await screen.findByTestId("status-verification")).textContent)
          .toContain(selection.verification.explanation);
      }

      const pendingRegeneration = deferred<Fix>();
      vi.mocked(remediate).mockReturnValueOnce(pendingRegeneration.promise);
      select(first.issueId, first.nodeIndex);
      expect(screen.getByTestId("status-verification").textContent).toContain(first.verification.explanation);
      fireEvent.click(screen.getByTestId("button-regenerate"));

      await waitFor(() => expect(screen.queryByTestId("status-verification")).toBeNull());
      expect(screen.getByText("Generating...")).toBeTruthy();
      expect(screen.getByText(first.fix.suggested)).toBeTruthy();

      // Move to another element in the same violation, then to a different
      // violation while the first selection's regeneration is still pending.
      select("button-name", 1);
      expect(screen.getByTestId("text-selector").textContent).toBe("#close");
      expect(screen.queryByTestId("panel-fix")).toBeNull();
      expect(screen.queryByTestId("status-verification")).toBeNull();

      select(other.issueId, other.nodeIndex);
      expect(screen.getByTestId("text-fix-suggested").textContent).toBe(other.fix.suggested);
      expect(screen.getByTestId("status-verification").textContent).toContain(other.verification.explanation);
      expect(screen.queryByText(first.verification.explanation)).toBeNull();

      await act(async () => {
        if (outcome === "success") {
          pendingRegeneration.resolve(regeneratedFix);
        } else {
          pendingRegeneration.reject(new Error("The configured provider returned an error."));
        }
      });

      // The late response belongs to the first selection; the other fix and
      // its previous simulation result remain available on the selected panel.
      expect(screen.getByTestId("text-fix-suggested").textContent).toBe(other.fix.suggested);
      expect(screen.getByTestId("status-verification").textContent).toContain(other.verification.explanation);

      select(first.issueId, first.nodeIndex);
      expect(screen.queryByTestId("status-verification")).toBeNull();
      expect(screen.queryByText(first.verification.explanation)).toBeNull();
      if (outcome === "success") {
        expect(screen.getByTestId("text-fix-suggested").textContent).toBe(regeneratedFix.suggested);
        expect(screen.queryByTestId("text-fix-error")).toBeNull();
      } else {
        expect(screen.getByTestId("text-fix-suggested").textContent).toBe(first.fix.suggested);
        expect(screen.getByTestId("text-fix-error").textContent)
          .toContain("The configured provider returned an error.");
      }

      select(other.issueId, other.nodeIndex);
      expect(screen.getByTestId("text-fix-suggested").textContent).toBe(other.fix.suggested);
      expect(screen.getByTestId("status-verification").textContent).toContain(other.verification.explanation);
      expect(remediate).toHaveBeenCalledTimes(3);
      expect(verifyFix).toHaveBeenCalledTimes(2);
    },
  );

  it("keeps fixes and verification scoped to each element across violations", async () => {
    vi.mocked(createScan).mockResolvedValue(multiElementScan);
    await scanThroughUi();

    const selections = multiElementScan.issues.flatMap((issue) =>
      issue.nodes.map((node, nodeIndex) => ({
        issueId: issue.id,
        nodeIndex,
        selector: node.target.join(" "),
        fix: {
          ...openAiFix,
          id: `fix-${issue.id}-${nodeIndex}`,
          original: node.html,
          suggested: `${node.html} <!-- correction for ${issue.id}:${nodeIndex} -->`,
        },
        verification: {
          ...verified,
          explanation: `Simulation result for ${issue.id}:${nodeIndex}`,
        },
      })),
    );

    function select(issueId: string, nodeIndex: number) {
      fireEvent.click(screen.getByTestId(`card-issue-${issueId}`));
      expect((screen.getByTestId("select-node") as HTMLSelectElement).value).toBe("0");
      fireEvent.change(screen.getByTestId("select-node"), { target: { value: String(nodeIndex) } });
    }

    for (const [index, selection] of selections.entries()) {
      select(selection.issueId, selection.nodeIndex);
      expect(screen.getByTestId("text-selector").textContent).toBe(selection.selector);
      expect(screen.getByTestId("text-node-html").textContent).toBe(selection.fix.original);
      expect(screen.queryByTestId("panel-fix")).toBeNull();
      expect(screen.queryByTestId("status-verification")).toBeNull();
      expect(screen.queryByTestId("button-verify")).toBeNull();

      vi.mocked(remediate).mockResolvedValueOnce(selection.fix);
      fireEvent.click(screen.getByTestId("button-generate-fix"));
      expect((await screen.findByTestId("text-fix-suggested")).textContent).toBe(selection.fix.suggested);
      expect(remediate).toHaveBeenNthCalledWith(index + 1, {
        scanId: multiElementScan.id, issueId: selection.issueId, nodeIndex: selection.nodeIndex,
      });
      expect(screen.queryByTestId("status-verification")).toBeNull();

      vi.mocked(verifyFix).mockResolvedValueOnce(selection.verification);
      fireEvent.click(screen.getByTestId("button-verify"));
      expect((await screen.findByTestId("status-verification")).textContent).toContain(selection.verification.explanation);
      expect(verifyFix).toHaveBeenNthCalledWith(index + 1, {
        scanId: multiElementScan.id, issueId: selection.issueId,
        nodeIndex: selection.nodeIndex, fixId: selection.fix.id,
      });
    }

    for (const selection of [...selections].reverse()) {
      select(selection.issueId, selection.nodeIndex);
      expect(screen.getByTestId("text-fix-original").textContent).toBe(selection.fix.original);
      expect(screen.getByTestId("text-fix-suggested").textContent).toBe(selection.fix.suggested);
      const status = screen.getByTestId("status-verification").textContent;
      expect(status).toContain(selection.verification.explanation);
      for (const other of selections.filter((s) => s !== selection)) {
        expect(status).not.toContain(other.verification.explanation);
        expect(screen.queryByText(other.fix.suggested)).toBeNull();
      }
    }
    expect(remediate).toHaveBeenCalledTimes(selections.length);
    expect(verifyFix).toHaveBeenCalledTimes(selections.length);
  });

  it.each(["element", "violation"] as const)(
    "keeps late fix and verification responses with their original selection after switching %s",
    async (destination) => {
      vi.mocked(createScan).mockResolvedValue(multiElementScan);
      const pendingFix = deferred<Fix>();
      const pendingVerification = deferred<Verification>();
      vi.mocked(remediate).mockReturnValueOnce(pendingFix.promise);
      vi.mocked(verifyFix).mockReturnValueOnce(pendingVerification.promise);
      await scanThroughUi();

      function switchAway() {
        if (destination === "violation") fireEvent.click(screen.getByTestId("card-issue-image-alt"));
        fireEvent.change(screen.getByTestId("select-node"), { target: { value: "1" } });
      }
      function switchBack() {
        fireEvent.click(screen.getByTestId("card-issue-button-name"));
      }

      fireEvent.click(screen.getByTestId("button-generate-fix"));
      switchAway();
      await act(async () => { pendingFix.resolve(openAiFix); });
      expect(screen.queryByTestId("panel-fix")).toBeNull();
      switchBack();
      expect((await screen.findByTestId("text-fix-suggested")).textContent).toBe(openAiFix.suggested);

      fireEvent.click(screen.getByTestId("button-verify"));
      switchAway();
      await act(async () => { pendingVerification.resolve(verified); });
      expect(screen.queryByTestId("panel-fix")).toBeNull();
      expect(screen.queryByTestId("status-verification")).toBeNull();
      switchBack();
      expect((await screen.findByTestId("status-verification")).textContent).toContain(verified.explanation);
      expect(remediate).toHaveBeenCalledExactlyOnceWith({
        scanId: scan.id, issueId: "button-name", nodeIndex: 0,
      });
      expect(verifyFix).toHaveBeenCalledExactlyOnceWith({
        scanId: scan.id, issueId: "button-name", nodeIndex: 0, fixId: openAiFix.id,
      });
    },
  );

  describe.each(["fix", "verification"] as const)("%s request failures", (request) => {
    it.each(["element", "violation"] as const)(
      "keeps loading, errors, and retries scoped when switching %s",
      async (destination) => {
        vi.mocked(createScan).mockResolvedValue(multiElementScan);
        await scanThroughUi();

        const origin = { issueId: "button-name", nodeIndex: 0 };
        const other = destination === "element"
          ? { issueId: "button-name", nodeIndex: 1 }
          : { issueId: "image-alt", nodeIndex: 0 };
        const originFix = { ...openAiFix, id: "fix-origin" };
        const otherFix = { ...openAiFix, id: "fix-other" };
        const errorId = request === "fix" ? "text-fix-error" : "text-verify-error";
        const buttonId = request === "fix" ? "button-generate-fix" : "button-verify";
        const idleLabel = request === "fix" ? "Generate AI Fix" : "Apply & Verify";
        const loadingLabel = request === "fix" ? "Generating fix..." : "Re-running Axe-core...";
        const originError = "The originating selection request failed";
        const otherError = "The other selection request failed";

        function select(selection: typeof origin) {
          fireEvent.click(screen.getByTestId(`card-issue-${selection.issueId}`));
          fireEvent.change(screen.getByTestId("select-node"), {
            target: { value: String(selection.nodeIndex) },
          });
          expect(screen.getByTestId("text-selector").textContent).toBe(
            multiElementScan.issues.find((issue) => issue.id === selection.issueId)!
              .nodes[selection.nodeIndex].target.join(" "),
          );
        }

        function expectLoading(loading: boolean) {
          const button = screen.getByTestId(buttonId) as HTMLButtonElement;
          expect(button.disabled).toBe(loading);
          expect(button.textContent).toBe(loading ? loadingLabel : idleLabel);
          if (!loading) expect(screen.queryByText(loadingLabel)).toBeNull();
          if (request === "verification") {
            expect((screen.getByTestId("button-regenerate") as HTMLButtonElement).disabled).toBe(loading);
          }
        }

        function expectError(message?: string) {
          if (message) {
            const error = screen.getByTestId(errorId);
            expect(error.getAttribute("role")).toBe("alert");
            expect(error.textContent).toContain(message);
            expect(error.textContent).not.toContain(message === originError ? otherError : originError);
            if (request === "verification") {
              expect(error.textContent).toContain("No verification result exists.");
            }
          } else expect(screen.queryByTestId(errorId)).toBeNull();
          expect(screen.queryByTestId(request === "fix" ? "text-verify-error" : "text-fix-error")).toBeNull();
          expect(screen.queryByTestId("text-scan-error")).toBeNull();
          expect(screen.queryByTestId("status-verification")).toBeNull();
        }

        // Verification needs a distinct existing fix on both selections so that
        // a leaked loading/error state would be visible on either destination.
        if (request === "verification") {
          for (const [selection, fix] of [[origin, originFix], [other, otherFix]] as const) {
            select(selection);
            vi.mocked(remediate).mockResolvedValueOnce(fix);
            fireEvent.click(screen.getByTestId("button-generate-fix"));
            await screen.findByTestId("panel-fix");
          }
          select(origin);
        }

        function queueRequest() {
          if (request === "fix") {
            const pending = deferred<Fix>();
            vi.mocked(remediate).mockReturnValueOnce(pending.promise);
            return { reject: pending.reject, resolve: () => pending.resolve(originFix) };
          }
          const pending = deferred<Verification>();
          vi.mocked(verifyFix).mockReturnValueOnce(pending.promise);
          return { reject: pending.reject, resolve: () => pending.resolve(verified) };
        }

        const pendingOrigin = queueRequest();
        const pendingOther = queueRequest();
        const retry = queueRequest();
        const requestMock = request === "fix" ? vi.mocked(remediate) : vi.mocked(verifyFix);

        fireEvent.click(screen.getByTestId(buttonId));
        expectLoading(true);
        expectError();
        select(other);
        expectLoading(false);
        expectError();

        fireEvent.click(screen.getByTestId(buttonId));
        expectLoading(true);
        await act(async () => { pendingOther.reject(new Error(otherError)); });
        expectLoading(false);
        expectError(otherError);

        select(origin);
        expectLoading(true);
        expectError();
        select(other);
        // A late rejection must not replace the currently displayed error.
        await act(async () => { pendingOrigin.reject(new Error(originError)); });
        expectLoading(false);
        expectError(otherError);
        select(origin);
        expectLoading(false);
        expectError(originError);

        fireEvent.click(screen.getByTestId(buttonId));
        expectLoading(true);
        expectError();
        select(other);
        expectLoading(false);
        expectError(otherError);
        select(origin);
        expectLoading(true);
        expectError();
        select(other);
        await act(async () => { retry.resolve(); });
        expectLoading(false);
        expectError(otherError);

        select(origin);
        expect(screen.queryByTestId(errorId)).toBeNull();
        if (request === "fix") {
          expect(screen.getByTestId("text-fix-suggested").textContent).toBe(originFix.suggested);
          expect(screen.queryByTestId("button-generate-fix")).toBeNull();
          expect((screen.getByTestId("button-regenerate") as HTMLButtonElement).disabled).toBe(false);
        } else {
          expectLoading(false);
          expect(screen.getByTestId("status-verification").textContent).toContain(verified.explanation);
        }
        select(other);
        expectLoading(false);
        expectError(otherError);

        expect(requestMock).toHaveBeenCalledTimes(3);
        for (const [index, selection, fix] of [
          [1, origin, originFix], [2, other, otherFix], [3, origin, originFix],
        ] as const) {
          expect(requestMock).toHaveBeenNthCalledWith(index, {
            scanId: multiElementScan.id,
            ...selection,
            ...(request === "verification" ? { fixId: fix.id } : {}),
          });
        }
      },
    );
  });

  describe.each(["fix", "verification"] as const)("late %s responses from an old scan", (request) => {
    it.each(["after clearing", "while starting another scan", "after another scan completes"] as const)(
      "does not populate matching elements %s",
      async (transition) => {
        const pendingFix = deferred<Fix>();
        const pendingVerification = deferred<Verification>();
        const pendingScan = deferred<Scan>();
        const replacementScan: Scan = {
          ...scan,
          id: "scan-replacement",
          url: "https://replacement.example.test/",
        };
        const replacementFix: Fix = {
          ...openAiFix,
          id: "fix-replacement",
          suggested: '<button aria-label="Replacement action"></button>',
        };
        const replacementVerification: Verification = {
          ...verified,
          explanation: "Only the replacement scan was checked in this simulation.",
        };

        if (request === "fix") vi.mocked(remediate).mockReturnValueOnce(pendingFix.promise);
        else vi.mocked(verifyFix).mockReturnValueOnce(pendingVerification.promise);
        await scanThroughUi();
        fireEvent.click(screen.getByTestId("button-generate-fix"));
        if (request === "verification") {
          await screen.findByTestId("text-fix-source");
          fireEvent.click(screen.getByTestId("button-verify"));
          expect((screen.getByTestId("button-verify") as HTMLButtonElement).disabled).toBe(true);
          expect(verifyFix).toHaveBeenCalledExactlyOnceWith({
            scanId: scan.id, issueId: "button-name", nodeIndex: 0, fixId: openAiFix.id,
          });
        } else {
          expect((screen.getByTestId("button-generate-fix") as HTMLButtonElement).disabled).toBe(true);
        }
        expect(remediate).toHaveBeenCalledExactlyOnceWith({
          scanId: scan.id, issueId: "button-name", nodeIndex: 0,
        });

        vi.mocked(createScan).mockReturnValueOnce(pendingScan.promise);
        function startReplacement() {
          fireEvent.change(screen.getByTestId("input-url"), { target: { value: replacementScan.url } });
          fireEvent.click(screen.getByTestId("button-scan"));
        }
        async function generateReplacementFix() {
          vi.mocked(remediate).mockResolvedValueOnce(replacementFix);
          fireEvent.click(screen.getByTestId("button-generate-fix"));
          expect((await screen.findByTestId("text-fix-suggested")).textContent).toBe(replacementFix.suggested);
        }
        const hasReplacementFix = request === "verification" && transition === "after another scan completes";
        if (transition === "after clearing") fireEvent.click(screen.getByTestId("button-new-scan"));
        else startReplacement();
        expect(screen.queryByTestId("panel-issue-button-name")).toBeNull();
        if (transition === "after another scan completes") {
          await act(async () => { pendingScan.resolve(replacementScan); });
          expect(screen.getByTestId("panel-issue-button-name").getAttribute("data-scan")).toBe(replacementScan.id);
          // Give stale simulation results a visible destination before they arrive.
          if (hasReplacementFix) await generateReplacementFix();
        }

        await act(async () => {
          if (request === "fix") pendingFix.resolve(openAiFix);
          else pendingVerification.resolve(verified);
        });
        if (hasReplacementFix) {
          expect(screen.getByTestId("text-fix-suggested").textContent).toBe(replacementFix.suggested);
        } else expect(screen.queryByTestId("panel-fix")).toBeNull();
        expect(screen.queryByTestId("status-verification")).toBeNull();

        if (transition === "after clearing") startReplacement();
        if (transition !== "after another scan completes") {
          await act(async () => { pendingScan.resolve(replacementScan); });
        }
        expect(createScan).toHaveBeenNthCalledWith(2, { url: replacementScan.url });
        expect(screen.getByTestId("panel-issue-button-name").getAttribute("data-scan")).toBe(replacementScan.id);
        expect(screen.getByTestId("text-selector").textContent).toBe(scan.issues[0].nodes[0].target.join(" "));
        if (!hasReplacementFix) expect(screen.queryByTestId("panel-fix")).toBeNull();
        expect(screen.queryByTestId("status-verification")).toBeNull();
        if (!hasReplacementFix) expect(screen.queryByTestId("button-verify")).toBeNull();

        if (!hasReplacementFix) await generateReplacementFix();
        expect(remediate).toHaveBeenNthCalledWith(2, {
          scanId: replacementScan.id, issueId: "button-name", nodeIndex: 0,
        });
        expect(screen.queryByText(openAiFix.suggested)).toBeNull();
        expect(screen.queryByTestId("status-verification")).toBeNull();
        expect((screen.getByTestId("button-verify") as HTMLButtonElement).disabled).toBe(false);

        vi.mocked(verifyFix).mockResolvedValueOnce(replacementVerification);
        fireEvent.click(screen.getByTestId("button-verify"));
        expect((await screen.findByTestId("status-verification")).textContent).toContain(replacementVerification.explanation);
        expect(screen.getByTestId("status-verification").textContent).not.toContain(verified.explanation);
        expect(verifyFix).toHaveBeenLastCalledWith({
          scanId: replacementScan.id, issueId: "button-name", nodeIndex: 0, fixId: replacementFix.id,
        });
      },
    );
  });

  it("documents deterministic suggestions and simulation-only verification", () => {
    render(<Guide />);
    expect(screen.getByText(/otherwise a deterministic rule-based suggestion is returned/)).toBeTruthy();
    expect(screen.getByText(/not a silent provider fallback/)).toBeTruthy();
    expect(screen.getByText(/A Verified in simulation status means only/)).toBeTruthy();
    expect(screen.getByText(/Any OpenAI-compatible setting/).textContent).toContain("remove all three");
    expect(screen.getByText(/For Gemini/).textContent).toContain("GEMINI_MODEL");
    expect(screen.getByText(/Configuration checks do not confirm/)).toBeTruthy();
    expect(screen.getByText(/Never paste credentials/)).toBeTruthy();
  });
});
