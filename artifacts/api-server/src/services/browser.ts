import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

export async function launchBrowser(proxy?: string) {
  const executablePath = process.env.CHROMIUM_PATH ||
    // The workspace supplies an up-to-date browser; published apps use the
    // declared Nix dependency instead of depending on workspace-only tooling.
    (process.env.NODE_ENV !== "production" && existsSync("/repl/tools/bin/chromium") ? "/repl/tools/bin/chromium" : undefined) ||
    (process.env.PATH ?? "").split(path.delimiter).map(p => path.join(p, "chromium")).find(p => existsSync(p));
  return chromium.launch({
    executablePath, headless: true, timeout: 15000,
    ...(proxy ? { proxy: { server: proxy } } : {}),
    args: [
      "--disable-dev-shm-usage", "--disable-quic", "--disable-background-networking",
      "--disable-extensions", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp",
      ...(proxy ? ["--proxy-bypass-list=<-loopback>", "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1"] : []),
    ],
  });
}

// A global cap covers both scans and verification; no unbounded browser queues.
let active = 0;
export function reserveBrowser() {
  if (active >= 2) return undefined;
  active++;
  let released = false;
  return () => { if (!released) { active--; released = true; } };
}
