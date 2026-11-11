import dns from "node:dns/promises";
import http from "node:http";
import net, { type Socket } from "node:net";
import ipaddr from "ipaddr.js";

export class PublicError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function isPublicAddress(address: string): boolean {
  try {
    const ip = ipaddr.process(address);
    // ipaddr classifies private, CGNAT, link-local, loopback, reserved,
    // multicast, unspecified, IPv4-mapped and transition IPv6 separately.
    return ip.range() === "unicast";
  } catch { return false; }
}

export function parsePublicUrl(raw: string): URL {
  let url: URL;
  try { url = new URL(raw); } catch { throw new PublicError("Enter a complete public URL, such as https://example.com."); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new PublicError("Only HTTP and HTTPS URLs without embedded credentials are supported.");
  if (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
    throw new PublicError("Only standard HTTP (80) and HTTPS (443) ports are supported.");
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || !host.includes(".") && !net.isIP(host) ||
    /\.(localhost|local|internal|test|invalid|onion)$/.test(host) ||
    net.isIP(host) && !isPublicAddress(host))
    throw new PublicError("This address is not a public website. Local, private and reserved networks are blocked.");
  return url;
}

export async function resolvePublic(host: string): Promise<{ address: string; family: number }> {
  host = host.replace(/^\[|\]$/g, "");
  if (net.isIP(host)) {
    if (!isPublicAddress(host)) throw new PublicError("Private or reserved network destination blocked.");
    return { address: host, family: net.isIP(host) };
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const addresses = await Promise.race([
      dns.lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new PublicError("DNS lookup timed out.")), 4000); }),
    ]);
    if (!addresses.length || addresses.some(a => !isPublicAddress(a.address)))
      throw new PublicError("This hostname resolves to a private or reserved network. Use a public website.");
    return addresses.find(a => a.family === 4) ?? addresses[0]!;
  } catch (e) {
    if (e instanceof PublicError) throw e;
    throw new PublicError("The website hostname could not be resolved. Check the URL.");
  } finally { clearTimeout(timer); }
}

/**
 * The browser never resolves/connects to target hosts directly. Every HTTP
 * request and HTTPS tunnel resolves here, validates ALL answers, then connects
 * to the chosen literal IP. This closes the validate-then-resolve-again gap.
 * Redirects/subresources create new checked connections; CONNECT allows TLS
 * only on 443 and Chromium still validates the destination certificate.
 */
export async function createSafeProxy() {
  const sockets = new Set<Socket>();
  let requests = 0;
  let transferred = 0;
  const withinBudget = (bytes: number) => {
    transferred += bytes;
    return transferred <= 32 * 1024 * 1024;
  };
  const server = http.createServer(async (req, res) => {
    try {
      if (++requests > 350) throw new PublicError("Page resource limit exceeded.");
      const url = parsePublicUrl(req.url ?? "");
      if (url.protocol !== "http:" || !["GET", "HEAD"].includes(req.method ?? ""))
        throw new PublicError("Unsupported proxy request.");
      const dest = await resolvePublic(url.hostname);
      const headers: http.OutgoingHttpHeaders = { ...req.headers, host: url.host };
      delete headers["proxy-authorization"];
      delete headers["proxy-connection"];
      const upstream = http.request({
        host: dest.address, family: dest.family, port: 80,
        path: url.pathname + url.search, method: req.method, headers,
        timeout: 12000, agent: false,
      }, response => {
        res.writeHead(response.statusCode ?? 502, response.headers);
        response.on("data", (chunk: Buffer) => {
          if (!withinBudget(chunk.length)) { upstream.destroy(); res.destroy(); }
        });
        response.pipe(res);
      });
      upstream.on("timeout", () => upstream.destroy());
      upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end(); });
      res.on("close", () => upstream.destroy());
      req.pipe(upstream);
    } catch { res.writeHead(403); res.end("Public network destination required."); }
  });
  server.on("connection", socket => {
    sockets.add(socket);
    socket.setTimeout(30000, () => socket.destroy());
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("connect", async (req, client, head) => {
    try {
      if (++requests > 350) throw new PublicError("Resource limit exceeded.");
      const url = parsePublicUrl(`https://${req.url ?? ""}`);
      const dest = await resolvePublic(url.hostname);
      const upstream = net.connect({ host: dest.address, port: 443, family: dest.family });
      sockets.add(upstream);
      upstream.on("data", (chunk: Buffer) => {
        if (!withinBudget(chunk.length)) { upstream.destroy(); client.destroy(); }
      });
      upstream.setTimeout(20000, () => upstream.destroy());
      upstream.on("close", () => { sockets.delete(upstream); client.destroy(); });
      upstream.on("error", () => client.destroy());
      client.on("error", () => upstream.destroy());
      client.on("close", () => upstream.destroy());
      upstream.on("connect", () => {
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        if (head.length) upstream.write(head);
        upstream.pipe(client);
        client.pipe(upstream);
      });
    } catch { client.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n"); }
  });
  server.on("clientError", (_e, socket) => socket.destroy());
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Proxy initialization failed");
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => { for (const s of sockets) s.destroy(); server.close(); },
  };
}
