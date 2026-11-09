import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { isPublicAddress, parsePublicUrl, resolvePublic, createSafeProxy } from "./network";
import { getRecord, putScan } from "./store";
import { generateFix } from "./remediation";
import { inertHtml, unsafePatch, simulateFix } from "./verification";
import { RemediateResponse, type IssueInput, type Scan } from "@workspace/api-zod";
import { executeScan } from "./scanner";

test("rejects local, private, metadata, multicast, reserved and transition addresses", () => {
  for (const ip of ["0.0.0.0", "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "224.0.0.1", "192.0.2.1", "198.18.0.1", "255.255.255.255", "::", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1", "2002:7f00:1::", "64:ff9b::7f00:1"]) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  for (const ip of ["1.1.1.1", "8.8.8.8", "2606:4700:4700::1111"])
    assert.equal(isPublicAddress(ip), true, ip);
});
test("URL gate rejects alternate IP encodings, credentials, unsafe protocols and ports", () => {
  for (const url of [
    "file:///etc/passwd", "ftp://example.com", "https://localhost", "http://2130706433",
    "http://0x7f000001", "http://127.1", "http://[::1]", "http://[::ffff:127.0.0.1]",
    "http://169.254.169.254", "https://example.com:8080", "https://user:pass@example.com",
    "https://internal.local", "http://metadata.google.internal", "not a URL",
  ]) assert.throws(() => parsePublicUrl(url), Error, url);
  assert.equal(parsePublicUrl("https://example.com/path?q=1").hostname, "example.com");
});
test("DNS resolution rejects local destinations", async () => {
  await assert.rejects(resolvePublic("localhost"), /private|reserved/);
});
test("HTTP and CONNECT proxy reject private destinations without connecting", async () => {
  const proxy = await createSafeProxy();
  try {
    const p = new URL(proxy.url);
    const status = await new Promise<number>(resolve => {
      http.get({ host: p.hostname, port: p.port, path: "http://127.0.0.1/" }, res => { res.resume(); resolve(res.statusCode!); });
    });
    assert.equal(status, 403);
    const response = await new Promise<string>(resolve => {
      const socket = net.connect({ host: p.hostname, port: Number(p.port) }, () => {
        socket.write("CONNECT 169.254.169.254:443 HTTP/1.1\r\nHost: 169.254.169.254:443\r\n\r\n");
      });
      socket.once("data", data => { resolve(data.toString()); socket.destroy(); });
    });
    assert.match(response, /403 Forbidden/);
  } finally { proxy.close(); }
});
test("snapshot sanitization removes active page content", () => {
  const clean = inertHtml('<html lang="en"><head><script>alert(1)</script><meta http-equiv="refresh" content="0;url=http://localhost"></head><body onload="alert(1)"><iframe src="http://localhost"></iframe><a href="javascript:alert(1)">link</a><button onclick="alert(1)">Go</button></body></html>');
  assert.doesNotMatch(clean, /<script|<meta|<iframe|onload|onclick|javascript:/);
  assert.equal(unsafePatch('<button onclick="fetch(\'http://localhost\')">Go</button>'), true);
  assert.equal(unsafePatch('<button aria-label="Search">Go</button>'), false);
});

function fixture(): IssueInput {
  const id = randomUUID();
  const scan: Scan = { id, url: "https://example.com", createdAt: new Date().toISOString(), status: "complete", stage: "Complete", warnings: [], issues: [{
    id: "button-name", impact: "critical", help: "Buttons must have discernible text", description: "An accessible name is needed.", helpUrl: "https://dequeuniversity.com/rules/axe/4.14/button-name", wcag: ["wcag412"], principle: "Robust",
    nodes: [{ html: '<button id="action"></button>', target: ["#action"], summary: "Element does not have text." }],
  }] };
  const r = putScan(scan);
  // Explicit test fixture, never an application demo or substitute scan result.
  r.snapshot = '<!doctype html><html lang="en"><head><title>Verification fixture</title></head><body><main><button id="action"></button></main></body></html>';
  return { scanId: id, issueId: "button-name", nodeIndex: 0 };
}

async function withMockedGemini(
  mockFetch: typeof fetch,
  run: () => Promise<void>,
) {
  return withMockedProvider({ GEMINI_API_KEY: "test-key-not-a-real-credential" }, mockFetch, run);
}

async function withMockedProvider(env: NodeJS.ProcessEnv, mockFetch: typeof fetch, run: () => Promise<void>) {
  const keys = ["GEMINI_API_KEY", "GEMINI_MODEL", "OPENAI_BASE_URL", "OPENAI_MODEL", "OPENAI_API_KEY"];
  const originals = keys.map(key => process.env[key]);
  const originalFetch = globalThis.fetch;
  keys.forEach(key => {
    if (env[key] === undefined) delete process.env[key];
    else process.env[key] = env[key];
  });
  globalThis.fetch = mockFetch;
  try { await run(); }
  finally {
    keys.forEach((key, index) => {
      if (originals[index] === undefined) delete process.env[key];
      else process.env[key] = originals[index];
    });
    globalThis.fetch = originalFetch;
  }
}

function geminiResponse(suggested = '<button id="action" aria-label="Search"></button>') {
  return new Response(JSON.stringify({
    candidates: [{ content: { parts: [{ text: JSON.stringify({
      suggested, explanation: "The button needs an accessible name.", correction: "Adds a descriptive name.",
    }) }] } }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

test("Gemini receives one selected-issue request and returns a reviewable, unverified suggestion", async () => {
  let calls = 0;
  let requestUrl = "";
  let requestBody = "";
  let hasApiKeyHeader = false;
  await withMockedGemini(async (input, init) => {
    calls++;
    requestUrl = String(input);
    requestBody = String(init?.body ?? "");
    hasApiKeyHeader = new Headers(init?.headers).has("x-goog-api-key");
    return geminiResponse();
  }, async () => {
    const input = fixture();
    const record = getRecord(input.scanId)!;
    const fix = await generateFix(input);
    assert.equal(fix.source, "gemini");
    assert.equal(fix.suggested, '<button id="action" aria-label="Search"></button>');
    assert.match(fix.warning, /Review and adapt/);
    assert.equal(record.fixes.size, 1);
    assert.doesNotMatch(fix.warning, /verified/i);
  });
  assert.equal(calls, 1, "one explicit generate action must make exactly one provider request");
  assert.match(requestUrl, /models\/gemini-2\.5-flash:generateContent$/);
  assert.ok(hasApiKeyHeader);
  assert.match(requestBody, /button-name/);
  assert.match(requestBody, /action/);
  assert.doesNotMatch(requestBody, /https:\/\/example\.com|snapshot|screenshot/i);
});

test("Gemini authentication, model, quota, timeout and malformed JSON errors do not retry or save fixes", async () => {
  const failures: {
    label: string;
    response?: Response;
    rejection?: Error;
    message: RegExp;
  }[] = [
    { label: "invalid key", response: new Response(JSON.stringify({ error: { message: "API key not valid" } }), { status: 400 }), message: /API key or access/ },
    { label: "rejected request", response: new Response(JSON.stringify({ error: { message: "Invalid structured output configuration" } }), { status: 400 }), message: /rejected the request \(HTTP 400\)/ },
    { label: "missing model", response: new Response("{}", { status: 404 }), message: /model was not found/ },
    { label: "quota", response: new Response("{}", { status: 429 }), message: /quota or rate limit/ },
    { label: "timeout", rejection: Object.assign(new Error("timeout"), { name: "TimeoutError" }), message: /timed out after 20 seconds/ },
    { label: "malformed JSON", response: new Response("{", { status: 200 }), message: /invalid structured response/ },
  ];

  for (const failure of failures) {
    let calls = 0;
    await withMockedGemini(async () => {
      calls++;
      if (failure.rejection) throw failure.rejection;
      return failure.response!;
    }, async () => {
      const input = fixture();
      const record = getRecord(input.scanId)!;
      await assert.rejects(generateFix(input), failure.message, failure.label);
      assert.equal(record.fixes.size, 0, `${failure.label} must not create a fix`);
    });
    assert.equal(calls, 1, `${failure.label} must not trigger an automatic retry`);
  }
});

const openaiEnv = { OPENAI_BASE_URL: "https://provider.example/v1", OPENAI_MODEL: "qwen3-coder-next", GEMINI_API_KEY: "test-gemini-should-not-be-used" };
const validSuggestion = { suggested: '<button id="action" aria-label="Search"></button>', explanation: "Missing accessible name.", correction: "Adds a name." };
const openaiResponse = (text: string) => Response.json({ choices: [{ message: { content: text }, finish_reason: "stop" }] });

test("OpenAI fixes preserve response validation, fix storage, selected inputs and explicit verification", async () => {
  let calls = 0;
  await withMockedProvider(openaiEnv, async () => { calls++; return openaiResponse(JSON.stringify(validSuggestion)); }, async () => {
    const input = fixture();
    const record = getRecord(input.scanId)!;
    const fix = RemediateResponse.parse(await generateFix(input));
    assert.equal(fix.source, "openai-compatible");
    assert.equal(fix.original, '<button id="action"></button>');
    assert.deepEqual(record.fixes.get(fix.id), { input, fix });
    assert.equal(record.fixes.size, 1);
    assert.match(fix.warning, /Simulation does not verify the live site/);
    const result = await simulateFix({ ...input, fixId: fix.id });
    assert.equal(result.status, "Verified in simulation", JSON.stringify(result));
    assert.ok(result.before > result.after);
    await assert.rejects(simulateFix({ ...input, nodeIndex: 1, fixId: fix.id }), /expired|unavailable/);
  });
  assert.equal(calls, 1, "verification must not request another AI response");
});

test("both providers accept fenced JSON only after the existing Zod schema passes", async () => {
  for (const provider of ["gemini", "openai-compatible"]) {
    const env = provider === "gemini" ? { GEMINI_API_KEY: "test-gemini" } : openaiEnv;
    for (const text of [
      `\`\`\`json\n${JSON.stringify(validSuggestion)}\n\`\`\``,
      `\`\`\`\n${JSON.stringify(validSuggestion)}\n\`\`\``,
      '{"suggested":"x"}', '{"suggested":1,"explanation":"why","correction":"how"}',
      JSON.stringify({ ...validSuggestion, suggested: "" }),
      JSON.stringify({ ...validSuggestion, explanation: "x".repeat(3001) }),
      JSON.stringify({ ...validSuggestion, suggested: "x".repeat(20001) }),
      `Here is the JSON:\n${JSON.stringify(validSuggestion)}`, "```json\n{broken}\n```",
    ]) {
      let calls = 0;
      await withMockedProvider(env, async () => {
        calls++;
        return provider === "gemini"
          ? Response.json({ candidates: [{ content: { parts: [{ text }] } }] })
          : openaiResponse(text);
      }, async () => {
        const input = fixture();
        const record = getRecord(input.scanId)!;
        if (text.startsWith("```") && !text.includes("{broken}")) {
          const fix = await generateFix(input);
          assert.equal(fix.source, provider);
          assert.equal(record.fixes.size, 1);
        } else {
          await assert.rejects(generateFix(input), /invalid structured response/);
          assert.equal(record.fixes.size, 0);
        }
      });
      assert.equal(calls, 1);
    }
  }
});

test("OpenAI failures do not fall back to Gemini, replace stored fixes, or create false results", async () => {
  let calls = 0;
  let failing = false;
  await withMockedProvider(openaiEnv, async () => {
    calls++;
    return failing ? Response.json({ error: { message: "private-details" } }, { status: 429 }) : openaiResponse(JSON.stringify(validSuggestion));
  }, async () => {
    const input = fixture();
    const record = getRecord(input.scanId)!;
    const fix = await generateFix(input);
    failing = true;
    await assert.rejects(generateFix(input), /quota or rate limit/);
    assert.equal(record.fixes.size, 1);
    assert.deepEqual(record.fixes.get(fix.id), { input, fix });
  });
  assert.equal(calls, 2, "two explicit actions, no fallback request");
});

test("partial configuration does not use a deterministic template or Gemini", async () => {
  await withMockedProvider({ OPENAI_MODEL: "test-model", GEMINI_API_KEY: "test-gemini" }, async () => {
    assert.fail("configuration errors must not make a provider request");
  }, async () => {
    const input = fixture();
    await assert.rejects(generateFix(input), /configuration is incomplete/);
    assert.equal(getRecord(input.scanId)!.fixes.size, 0);
  });
});

test("deterministic templates still generate and store fixes with no AI calls", async () => {
  await withMockedProvider({}, async () => { assert.fail("deterministic fixes must not make AI calls"); }, async () => {
    for (const [rule, html, attribute] of [
      ["button-name", '<button id="action"></button>', "aria-label="],
      ["image-alt", '<img src="example.png">', "alt="],
      ["html-has-lang", "<html></html>", 'lang="en"'],
    ]) {
      const input = fixture();
      const record = getRecord(input.scanId)!;
      record.scan.issues[0]!.id = rule!;
      record.scan.issues[0]!.nodes[0]!.html = html!;
      input.issueId = rule!;
      const fix = RemediateResponse.parse(await generateFix(input));
      assert.equal(fix.source, "deterministic");
      assert.ok(fix.suggested.includes(attribute!));
      assert.match(fix.warning, /not an AI-generated fix/);
      assert.deepEqual(record.fixes.get(fix.id), { input, fix });
    }
    const unsupported = fixture();
    const record = getRecord(unsupported.scanId)!;
    record.scan.issues[0]!.id = unsupported.issueId = "color-contrast";
    await assert.rejects(generateFix(unsupported), /no safe deterministic template/);
    assert.equal(record.fixes.size, 0);
  });
});

test("live Gemini selected-issue smoke test", { skip: process.env.GEMINI_LIVE_TEST !== "1" }, async () => {
  assert.ok(process.env.GEMINI_API_KEY, "GEMINI_API_KEY must be configured for the explicitly requested live smoke test");
  const input = fixture();
  const record = getRecord(input.scanId)!;
  const fix = await generateFix(input);
  assert.equal(fix.source, "gemini");
  assert.ok(fix.suggested.length > 0);
  assert.ok(fix.explanation.length > 0);
  assert.ok(fix.correction.length > 0);
  assert.match(fix.warning, /AI suggestions can be incorrect/);
  assert.equal(record.fixes.size, 1);
});

test("isolated re-test distinguishes success, remaining issue, regression and unavailable", async () => {
  const input = fixture();
  // Exercise stored deterministic template regardless of ambient Gemini config.
  const record = getRecord(input.scanId)!;
  const fixId = randomUUID();
  const fix = { id: fixId, source: "deterministic" as const, original: '<button id="action"></button>', suggested: '<button id="action" aria-label="Search"></button>', explanation: "Fixture", correction: "Fixture", wcag: ["wcag412"], warning: "Fixture only" };
  record.fixes.set(fixId, { input, fix });
  let result = await simulateFix({ ...input, fixId });
  assert.equal(result.status, "Verified in simulation", JSON.stringify(result));
  assert.ok(result.before > result.after);
  fix.suggested = fix.original;
  result = await simulateFix({ ...input, fixId });
  assert.equal(result.status, "Issue still detected", JSON.stringify(result));
  fix.suggested = '<button id="action" aria-label="Search"><img src="missing.png"></button>';
  result = await simulateFix({ ...input, fixId });
  assert.equal(result.status, "Regression detected", JSON.stringify(result));
  assert.ok(result.regressions.includes("image-alt"));
  fix.suggested = '<button onclick="alert(1)">Search</button>';
  result = await simulateFix({ ...input, fixId });
  assert.equal(result.status, "Verification unavailable");
  record.snapshot = '<html lang="en"><head><title>Fixture</title></head><body><main><button id="action">Already named</button></main></body></html>';
  // Keep identity consistent so this case exercises the zero-baseline guard,
  // rather than the stricter stale-element fingerprint guard.
  record.scan.issues[0]!.nodes[0]!.html = '<button id="action">Already named</button>';
  fix.suggested = '<button id="action">Search</button>';
  result = await simulateFix({ ...input, fixId });
  assert.equal(result.status, "Verification unavailable");
  assert.match(result.explanation, /could not be reproduced/);
});
test("invalid issue and fix IDs cannot mutate or verify another element", async () => {
  const input = fixture();
  await assert.rejects(generateFix({ ...input, nodeIndex: 99 }), /expired|unavailable/);
  await assert.rejects(simulateFix({ ...input, fixId: randomUUID() }), /not found/);
});

test("AI code is rejected before storing or copying unsafe or multi-root suggestions for either provider", async () => {
  for (const provider of ["gemini", "openai-compatible"]) {
    for (const suggested of [
      '<button onclick="alert(1)">Search</button>', '<script>alert(1)</script>',
      '<button>One</button><button>Two</button>', 'extra text<button>Search</button>',
      '<a href="java&#x73;cript:alert(1)">Search</a>',
    ]) {
      await withMockedProvider(provider === "gemini" ? { GEMINI_API_KEY: "fixture" } : openaiEnv, async () =>
        provider === "gemini" ? geminiResponse(suggested) : openaiResponse(JSON.stringify({ ...validSuggestion, suggested })),
      async () => {
        const input = fixture();
        await assert.rejects(generateFix(input), /unsafe|replacement element/);
        assert.equal(getRecord(input.scanId)!.fixes.size, 0);
      });
    }
  }
});

test("AI remediation categories produce validated fixes and pass actual isolated Axe checks", async () => {
  for (const [rule, original, suggested] of [
    ["image-alt", '<img id="action" src="missing.png" width="20" height="20">', '<img id="action" src="missing.png" width="20" height="20" alt="Test illustration">'],
    ["label", '<input id="action" type="text">', '<input id="action" type="text" aria-label="Search">'],
    ["button-name", '<button id="action"></button>', '<button id="action" aria-label="Search"></button>'],
    ["aria-valid-attr-value", '<button id="action" aria-expanded="maybe">Menu</button>', '<button id="action" aria-expanded="false">Menu</button>'],
    ["color-contrast", '<b id="action" style="color:#777;background:#fff">Free Penguins</b>', '<b id="action" style="color:#2d3e46;background:#fff">Free Penguins</b>'],
  ]) {
    await withMockedProvider(openaiEnv, async () => openaiResponse(JSON.stringify({ ...validSuggestion, suggested })), async () => {
      const input = fixture();
      const record = getRecord(input.scanId)!;
      input.issueId = record.scan.issues[0]!.id = rule!;
      record.scan.issues[0]!.nodes[0]!.html = original!;
      record.snapshot = `<!doctype html><html lang="en"><head><title>Category fixture</title></head><body><main>${original}</main></body></html>`;
      const fix = await generateFix(input);
      assert.equal(fix.suggested, suggested);
      const result = await simulateFix({ ...input, fixId: fix.id });
      assert.equal(result.status, "Verified in simulation", `${rule}: ${JSON.stringify(result)}`);
      assert.ok(result.before > 0);
      assert.ok(result.after < result.before);
      assert.deepEqual(result.regressions, []);
    });
  }
});

test("verification cannot claim success by deleting, hiding or disabling the selected control", async () => {
  const input = fixture();
  const record = getRecord(input.scanId)!;
  const fixId = randomUUID();
  for (const suggested of [
    '<span>Search</span>', '<button hidden aria-label="Search"></button>',
    '<button disabled aria-label="Search"></button>',
    '<button style="display:none" aria-label="Search"></button>',
  ]) {
    record.fixes.set(fixId, { input, fix: { id: fixId, source: "deterministic", original: '<button id="action"></button>', suggested, explanation: "Fixture", correction: "Fixture", wcag: ["wcag412"], warning: "Fixture only" } });
    const result = await simulateFix({ ...input, fixId });
    assert.equal(result.status, "Verification unavailable", JSON.stringify({ suggested, result }));
    assert.match(result.explanation, /preserve/);
  }
});

test("a scanner validation failure clears results, exposes a safe error and releases capacity", async () => {
  const input = fixture();
  const record = getRecord(input.scanId)!;
  record.scan.url = "http://127.0.0.1";
  record.scan.status = "running";
  let released = false;
  await executeScan(record, () => { released = true; });
  assert.equal(record.scan.status, "failed");
  assert.match(record.scan.error!, /public|private|blocked/i);
  assert.deepEqual(record.scan.issues, []);
  assert.equal(released, true);
});
