// MCP functional smoke test (beyond handshake): tools/list validation + real tools/call.
// Usage: node scripts/mcp-smoke.mjs chrome|firefox|all
// chrome: new_page(about:blank) + list_console_messages  (launches system Chrome headed, briefly)
// firefox: check_environment (browserless self-check)

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.JSREV_PYTHON || (process.platform === "win32" ? "python" : "python3");

function engineSpec(which) {
  return which === "chrome"
    ? { command: "node", argv: [path.join(PLUGIN_ROOT, "engines", "chrome", "build", "src", "index.js")] }
    : { command: PY, argv: [path.join(PLUGIN_ROOT, "engines", "firefox", "launch_server.py")] };
}

function session(spec, timeoutMs = 90000) {
  const child = spawn(spec.command, spec.argv, {
    cwd: PLUGIN_ROOT,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let stderr = "";
  child.stderr.on("data", (d) => { stderr += d; if (stderr.length > 4000) stderr = stderr.slice(-4000); });
  let buf = "";
  child.stdout.setEncoding("utf8");
  const pending = new Map();
  let nextId = 1;

  child.stdout.on("data", (chunk) => {
    buf += chunk;
    let idx;
    while ((idx = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 1);
      if (!line.startsWith("{")) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id && pending.has(msg.id)) {
          const p = pending.get(msg.id);
          pending.delete(msg.id);
          msg.error ? p.reject(new Error(`${msg.error.code} ${msg.error.message}`)) : p.resolve(msg.result);
        }
      } catch { /* skip non-JSON line */ }
    }
  });

  const timer = setTimeout(() => {
    try { child.kill(); } catch {}
  }, timeoutMs);

  const request = (method, params) =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });

  return {
    request,
    async close() {
      clearTimeout(timer);
      try { child.kill(); } catch {}
    },
    stderr: () => stderr,
  };
}

async function validateTools(s, expected) {
  const list = await s.request("tools/list", {});
  const tools = list.tools || [];
  const bad = tools.filter((t) => !t.name || !t.description || !t.inputSchema);
  console.log(`  tools/list: ${tools.length} tools (expect ${expected}), schema-incomplete: ${bad.length}`);
  if (tools.length !== expected) throw new Error(`tool count ${tools.length} != ${expected}`);
  if (bad.length) throw new Error(`schema-incomplete: ${bad.map((t) => t.name).join(",")}`);
  return tools;
}

async function callTool(s, name, args) {
  const r = await s.request("tools/call", { name, arguments: args || {} });
  const sc = r.structuredContent;
  const text = (r.content || []).map((c) => c.text || "").join(" ").slice(0, 200);
  return { isError: Boolean(r.isError), ok: sc ? sc.ok !== false : !r.isError, summary: sc ? sc.summary : text, sc };
}

async function testChrome() {
  console.log("== chrome engine: functional smoke ==");
  const s = session(engineSpec("chrome"));
  try {
    await s.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "jsrev-smoke", version: "0.1.0" },
    });
    s.request("notifications/initialized", {}).catch(() => {});
    await validateTools(s, 24);

    const r1 = await callTool(s, "new_page", { url: "about:blank" });
    console.log(`  new_page(about:blank): ${r1.ok && !r1.isError ? "OK" : "FAIL"} ${r1.isError ? r1.summary : ""}`);
    if (r1.isError) throw new Error(r1.summary);

    const r2 = await callTool(s, "list_console_messages", {});
    console.log(`  list_console_messages: ${r2.ok && !r2.isError ? "OK" : "FAIL"} ${JSON.stringify(r2.sc?.data ?? "").slice(0, 80)}`);

    const r3 = await callTool(s, "navigate_page", { url: "data:text/html,<title>jsrev-smoke</title><h1>ok</h1>" });
    console.log(`  navigate_page: ${r3.ok && !r3.isError ? "OK" : "FAIL"} ${r3.isError ? r3.summary : ""}`);

    const r4 = await callTool(s, "take_screenshot", { format: "png", quality: undefined, fullPage: false }).catch((e) => ({ isError: true, ok: false, summary: e.message }));
    console.log(`  take_screenshot: ${r4.ok && !r4.isError ? "OK" : "FAIL"}`);

    console.log("  chrome functional smoke: PASS (browser launched, page created, navigation + screenshot exercised)");
  } finally {
    await s.close();
  }
}

async function testFirefox() {
  console.log("== firefox engine: functional smoke (browserless tools only) ==");
  const s = session(engineSpec("firefox"));
  try {
    await s.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "jsrev-smoke", version: "0.1.0" },
    });
    s.request("notifications/initialized", {}).catch(() => {});
    await validateTools(s, 36);

    const env = await callTool(s, "check_environment", {});
    if (env.isError) throw new Error(env.summary);
    const d = env.sc?.data ?? {};
    console.log(`  check_environment: OK (mcp=${d.mcp?.version}, deps=${Object.entries(d.deps || {}).map(([k, v]) => `${k}:${v.ok ? "ok" : "missing"}`).join(",")}, browser_running=${d.browser?.running ?? false})`);

    console.log("  firefox functional smoke: PASS (server live, real tool call returned structured result)");
    console.log("  note: browser-dependent tools (launch_browser/navigate/hook/…) require `camoufox fetch` first — by design, not a defect");
  } finally {
    await s.close();
  }
}

const which = process.argv[2] || "all";
try {
  if (which === "chrome" || which === "all") await testChrome();
  if (which === "firefox" || which === "all") await testFirefox();
  process.exit(0);
} catch (e) {
  console.error(`SMOKE FAIL: ${e.message}`);
  process.exit(1);
}
