// MCP functional probe — beyond handshake: schema audit, generic tool call, chrome e2e.
// Thin client over cli/lib/handshake.mjs (the proven session layer used by doctor).
// Usage:
//   node scripts/mcp-probe.mjs audit                       # both engines: tools/list + inputSchema validity
//   node scripts/mcp-probe.mjs call <engine> <tool> '<json-args>'
//   node scripts/mcp-probe.mjs chrome-e2e                  # real browser launch → page → eval → network
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, engineSpecs } from "../cli/lib/handshake.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.JSREV_PYTHON || (process.platform === "win32" ? "python" : "python3");

async function withSession(engine, timeoutMs, fn) {
  const spec = engineSpecs(ROOT, PY)[engine];
  if (!spec) throw new Error(`unknown engine: ${engine}`);
  if (engine === "firefox") spec.command = PY;
  const s = createSession({ ...spec, timeoutMs });
  try {
    await s.ready;
    return await fn(s);
  } finally {
    s.close();
  }
}

const mode = process.argv[2];

if (mode === "audit") {
  for (const engine of ["chrome", "firefox"]) {
    await withSession(engine, 45000, async (s) => {
      const tools = await s.listTools();
      const bad = tools.filter((t) => !t.inputSchema || typeof t.inputSchema !== "object");
      const names = tools.map((t) => t.name);
      console.log(`[${engine}] tools=${tools.length} inputSchemaValid=${tools.length - bad.length} invalid=${bad.map((t) => t.name).join(",") || "none"}`);
      console.log(`[${engine}] ${names.join(",")}`);
    }).catch((e) => console.log(`[${engine}] AUDIT_FAIL: ${e.message}`));
  }
  process.exit(0);
}

if (mode === "call") {
  const engine = process.argv[3];
  const tool = process.argv[4];
  const jsonArgs = process.argv[5];
  await withSession(engine, 60000, async (s) => {
    const r = await s.callTool(tool, jsonArgs ? JSON.parse(jsonArgs) : {});
    console.log(JSON.stringify(r, (k, v) => (v === undefined ? undefined : v), 2));
  }).catch((e) => { console.error("CALL_FAIL:", e.message); process.exit(1); });
  process.exit(0);
}

if (mode === "chrome-e2e") {
  const steps = [];
  const t0 = Date.now();
  let pass = false;
  try {
    await withSession("chrome", 120000, async (s) => {
      const tools = await s.listTools();
      const names = new Set(tools.map((t) => t.name));
      const schemaOf = (n) => tools.find((x) => x.name === n);
      for (const want of ["new_page", "evaluate_script", "list_network_requests", "take_screenshot"]) {
        if (!names.has(want)) throw new Error(`tool missing: ${want}`);
      }
      const np = schemaOf("new_page");
      steps.push(`schema new_page: (${Object.keys(np.inputSchema.properties || {}).join(",")})`);
      const r1 = await s.callTool("new_page", { url: "about:blank" });
      steps.push(`new_page(about:blank) → ${r1.ok ? "OK" : "FAIL"} ${r1.summary || ""}`);
      if (!r1.ok) throw new Error("new_page failed: " + r1.summary);
      const ev = schemaOf("evaluate_script");
      steps.push(`schema evaluate_script: (${Object.keys(ev.inputSchema.properties || {}).join(",")})`);
      const r2 = await s.callTool("evaluate_script", { function: "() => 6 * 7", confirm: true });
      const r2b = r2.ok ? r2 : await s.callTool("evaluate_script", { fn: "() => 6 * 7", confirm: true });
      steps.push(`evaluate_script(() => 6*7, confirm) → ${r2b.ok ? "OK" : "FAIL"} ${r2b.summary || ""} ${r2b.data !== undefined ? "result=" + JSON.stringify(r2b.data).slice(0, 120) : ""}`);
      const r3 = await s.callTool("list_network_requests", {});
      steps.push(`list_network_requests → ${r3.ok ? "OK" : "FAIL"} ${r3.summary || ""}`);
      const r4 = await s.callTool("take_screenshot", { format: "jpeg", quality: 50 });
      steps.push(`take_screenshot → ${r4.ok ? "OK" : "FAIL"} ${(r4.summary || "").slice(0, 100)}`);
      pass = r1.ok && r2b.ok && r3.ok;
    });
    console.log(`CHROME_E2E ${pass ? "PASS" : "PARTIAL"} (${Date.now() - t0}ms)`);
  } catch (e) {
    console.log(`CHROME_E2E FAIL: ${e.message} (${Date.now() - t0}ms)`);
  }
  steps.forEach((s) => console.log("  - " + s));
  process.exit(0);
}

if (mode === "firefox-e2e") {
  const steps = [];
  const t0 = Date.now();
  let pass = false;
  try {
    await withSession("firefox", 180000, async (s) => {
      const tools = await s.listTools();
      const names = new Set(tools.map((t) => t.name));
      for (const want of ["launch_browser", "navigate", "evaluate_js", "close_browser"]) {
        if (!names.has(want)) throw new Error(`tool missing: ${want}`);
      }
      const r1 = await s.callTool("launch_browser", {});
      steps.push(`launch_browser → ${r1.ok ? "OK" : "FAIL"} ${(r1.summary || "").slice(0, 160)}`);
      if (!r1.ok) throw new Error("launch_browser failed: " + r1.summary);
      const r2 = await s.callTool("navigate", { url: "https://example.com" });
      steps.push(`navigate(example.com) → ${r2.ok ? "OK" : "FAIL"} ${(r2.summary || "").slice(0, 120)}`);
      if (!r2.ok) throw new Error("navigate failed: " + r2.summary);
      const r3 = await s.callTool("evaluate_js", { expression: "document.title" });
      steps.push(`evaluate_js(document.title) → ${r3.ok ? "OK" : "FAIL"} ${(r3.summary || "").slice(0, 120)}`);
      const r4 = await s.callTool("cookies", { action: "get" });
      steps.push(`cookies(action=get) → ${r4.ok ? "OK" : "FAIL"} ${(r4.summary || "").slice(0, 100)}`);
      const r5 = await s.callTool("close_browser", {});
      steps.push(`close_browser → ${r5.ok ? "OK" : "FAIL"} ${(r5.summary || "").slice(0, 100)}`);
      pass = r1.ok && r2.ok && r3.ok && r5.ok;
    });
    console.log(`FIREFOX_E2E ${pass ? "PASS" : "PARTIAL"} (${Date.now() - t0}ms)`);
  } catch (e) {
    console.log(`FIREFOX_E2E FAIL: ${e.message} (${Date.now() - t0}ms)`);
  }
  steps.forEach((s) => console.log("  - " + s));
  process.exit(0);
}

console.log("usage: node scripts/mcp-probe.mjs audit | call <engine> <tool> '<json>' | chrome-e2e | firefox-e2e");
process.exit(2);
