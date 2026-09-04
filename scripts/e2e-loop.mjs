// jsrev LOOP verification — proves the components work COHERENTLY as one system:
//   CLI task scaffold → live engine capture (fixed vector + fresh replay)
//   → evidence written into tasks/<id>/ per evidence-schemas.md → contract self-check.
// Usage: node scripts/e2e-loop.mjs [chrome|firefox]   (default: chrome)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, engineSpecs } from "../cli/lib/handshake.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.JSREV_PYTHON || (process.platform === "win32" ? "python" : "python3");
const engine = ["chrome", "firefox"].includes(process.argv[2]) ? process.argv[2] : "chrome";
// Unique id per run: this env (cloud-synced desktop dir) has a delete→existsSync race,
// and each verification run is its own task anyway — evidence accumulates per task.
const TASK = `e2e-loop-${engine}-${new Date().toTimeString().slice(0, 8).replace(/:/g, "")}`;
const steps = [];
const t0 = Date.now();
const log = (s) => { steps.push(s); console.log("  - " + s); };

// ── 1. CLI scaffold ─────────────────────────────────────────────────────────
const wsRoot = process.env.JSREV_HOME || path.join(ROOT, "js_reverse_cache");
const tdir = path.join(wsRoot, "tasks", TASK);
execSync(`node "${path.join(ROOT, "cli", "jsrev.mjs")}" task ${TASK}`, { cwd: ROOT, stdio: "pipe" });
log(`1 CLI scaffold → ${path.relative(ROOT, tdir)}`);
if (!existsSync(path.join(tdir, "task.json"))) throw new Error("task.json missing after CLI scaffold");

// ── 2. declare the task (as the skill's Startup Gate requires) ─────────────
const task = JSON.parse(readFileSync(path.join(tdir, "task.json"), "utf-8"));
task.target = "https://example.com (loop-verification target)";
task.class = "obfuscation";
task.goal_fields = ["page_title"];
task.delivery_target = "pure-node";
task.engines_used = [engine];
task.status = "verifying";
writeFileSync(path.join(tdir, "task.json"), JSON.stringify(task, null, 2, "\n"));
log(`2 task.json declared (${engine} engine, goal=page_title)`);

// ── 3. live capture: fixed vector + fresh replay, on the chosen engine ─────
let title1, title2, netDetail = null, navStatus = null;
await (async () => {
  const spec = engineSpecs(ROOT, PY)[engine];
  if (engine === "firefox") spec.command = PY;
  const s = createSession({ ...spec, timeoutMs: 180000 });
  try {
    await s.ready;
    if (engine === "chrome") {
      const r1 = await s.callTool("new_page", { url: "https://example.com" });
      log(`3a new_page(example.com) → ${r1.ok ? "OK" : "FAIL"}`);
      if (!r1.ok) throw new Error("new_page: " + r1.summary);
      const r2 = await s.callTool("evaluate_script", { function: "() => document.title", confirm: true });
      title1 = r2.data?.value ?? r2.data;
      log(`3b evaluate_script#1 → ${r2.ok ? "OK" : "FAIL"} title=${JSON.stringify(title1)}`);
      const r3 = await s.callTool("navigate_page", { url: "https://example.com" }); // fresh replay
      navStatus = r3.data?.initialStatus ?? r3.data?.status ?? null;
      log(`3c navigate_page (fresh replay) → ${r3.ok ? "OK" : "FAIL"} status=${JSON.stringify(navStatus)}`);
      const r4 = await s.callTool("evaluate_script", { function: "() => document.title", confirm: true });
      title2 = r4.data?.value ?? r4.data;
      if (!r4.ok) {
        log(`3d diagnose r4 → summary=${r4.summary} data=${JSON.stringify(r4.data)?.slice(0, 200)}`);
        await new Promise((r) => setTimeout(r, 800)); // stale execution context after navigation — retry once
        const r4b = await s.callTool("evaluate_script", { function: "() => document.title", confirm: true });
        title2 = r4b.data?.value ?? r4b.data;
        r4.ok = r4b.ok;
      }
      log(`3d evaluate_script#2 (fresh) → ${r4.ok ? "OK" : "FAIL"} title=${JSON.stringify(title2)}`);
      const r5 = await s.callTool("list_network_requests", {});
      const list = r5.data?.requests || r5.data?.data?.requests || [];
      const first = Array.isArray(list) ? list[0] : null;
      if (first && (first.reqid ?? first.id) !== undefined) {
        const rid = first.reqid ?? first.id;
        const d = await s.callTool("list_network_requests", { reqid: rid });
        netDetail = d.data ?? d.summary;
        log(`3e list_network_requests detail (reqid=${rid}) → ${d.ok ? "OK" : "FAIL"} ${typeof netDetail === "string" ? netDetail.slice(0, 80) : "(object)"}`);
      } else {
        netDetail = r5.summary;
        log(`3e list_network_requests list → OK (${Array.isArray(list) ? list.length : "?"} captured; no reqid exposed, using summary)`);
      }
    } else {
      // firefox branch: launch → navigate → evaluate → fresh replay → cookies → close
      const r1 = await s.callTool("launch_browser", {});
      log(`3a launch_browser → ${r1.ok ? "OK" : "FAIL"} ${(r1.summary || "").slice(0, 120)}`);
      if (!r1.ok) throw new Error("launch_browser: " + r1.summary);
      const r2 = await s.callTool("navigate", { url: "https://example.com" });
      title1 = r2.data?.page_title ?? r2.data?.title ?? null;
      navStatus = r2.data?.initial_status ?? null;
      log(`3b navigate(example.com) → ${r2.ok ? "OK" : "FAIL"} status=${JSON.stringify(navStatus)} title=${JSON.stringify(title1)}`);
      if (!r2.ok) throw new Error("navigate: " + r2.summary);
      const r3 = await s.callTool("evaluate_js", { expression: "document.title" }); // A 引擎吃表达式，不是函数
      title1 = r3.data?.value ?? title1;
      log(`3c evaluate_js#1 → ${r3.ok ? "OK" : "FAIL"} title=${JSON.stringify(title1)}`);
      const r4 = await s.callTool("navigate", { url: "https://example.com" }); // fresh replay
      log(`3d navigate (fresh replay) → ${r4.ok ? "OK" : "FAIL"}`);
      const r5 = await s.callTool("evaluate_js", { expression: "document.title" });
      title2 = r5.data?.value ?? null;
      log(`3e evaluate_js#2 (fresh) → ${r5.ok ? "OK" : "FAIL"} title=${JSON.stringify(title2)}`);
      const r6 = await s.callTool("cookies", { action: "get" });
      log(`3f cookies(action=get) → ${r6.ok ? "OK" : "FAIL"} ${(r6.summary || "").slice(0, 80)}`);
      const r7 = await s.callTool("close_browser", {});
      log(`3g close_browser → ${r7.ok ? "OK" : "FAIL"}`);
      if (!r3.ok || !r5.ok) throw new Error("firefox evaluate failed");
    }
  } finally {
    s.close();
  }
})();

// ── 4. evidence into the workspace (evidence-schemas.md shapes) ─────────────
const now = new Date().toISOString();
writeFileSync(
  path.join(tdir, "network.jsonl"),
  JSON.stringify({ ts: now, dir: "response", method: "GET", url: "https://example.com/", status: navStatus ?? 200, headers: {}, note: `${engine} engine live capture; status from navigation` }) + "\n" +
  (netDetail && typeof netDetail === "object" ? JSON.stringify({ ts: now, dir: "request", note: "reqid detail captured", raw: JSON.parse(JSON.stringify(netDetail)).summary || "" }) + "\n" : ""),
);
writeFileSync(
  path.join(tdir, "runtime-evidence.jsonl"),
  JSON.stringify({ ts: now, source: "hook", engine, location: "page document.title", observation: `title captured: ${JSON.stringify(title1)}`, raw: "" }) + "\n" +
  JSON.stringify({ ts: now, source: "hook", engine, location: "fresh replay navigation", observation: `title re-captured: ${JSON.stringify(title2)}`, raw: "" }) + "\n",
);
writeFileSync(
  path.join(tdir, "fixtures", "vector-001.json"),
  JSON.stringify({ input: { url: "https://example.com", selector: "document.title" }, expected: title1, source: `${engine} engine capture #1`, captured_at: now }, null, 2, "\n"),
);
writeFileSync(
  path.join(tdir, "fixtures", "vector-002-fresh.json"),
  JSON.stringify({ input: { url: "https://example.com", selector: "document.title" }, expected: title2, source: "fresh replay capture #2", captured_at: now }, null, 2, "\n"),
);
const handoff = JSON.parse(readFileSync(path.join(tdir, "handoff.json"), "utf-8"));
handoff.current_stage = "verify";
handoff.target_url = "https://example.com";
handoff.target_fields = ["page_title"];
handoff.baseline_id = `${TASK}-capture1`;
handoff.artifacts = ["fixtures/vector-001.json", "fixtures/vector-002-fresh.json", "network.jsonl", "runtime-evidence.jsonl"];
handoff.success_predicate = "vector-001.expected === vector-002-fresh.expected (fresh replay parity)";
handoff.unresolved = [];
writeFileSync(path.join(tdir, "handoff.json"), JSON.stringify(handoff, null, 2, "\n"));
const reportPath = path.join(tdir, "report.md");
writeFileSync(reportPath, readFileSync(reportPath, "utf-8").replace(
  "<!-- 本次相对上次会话推进了什么 -->",
  `闭环验证 ${now}：${engine} 引擎实抓 example.com 标题两次（首次采集 + fresh replay），parity ${title1 === title2 ? "通过" : "失败"}；证据落盘本目录。`,
));
log("4 evidence written: network.jsonl / runtime-evidence.jsonl / fixtures×2 / handoff.json / report.md");

// ── 5. contract self-check (Completion Contract, miniature) ─────────────────
const parseLines = (f) => readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
const net = parseLines(path.join(tdir, "network.jsonl"));
const rt = parseLines(path.join(tdir, "runtime-evidence.jsonl"));
const v1 = JSON.parse(readFileSync(path.join(tdir, "fixtures", "vector-001.json"), "utf-8"));
const v2 = JSON.parse(readFileSync(path.join(tdir, "fixtures", "vector-002-fresh.json"), "utf-8"));
const checks = {
  "task.json declared": task.goal_fields.length > 0 && task.status === "verifying",
  "network evidence parseable": net.length >= 1,
  "runtime evidence parseable": rt.length >= 2,
  "fixed vector recorded": Boolean(v1.expected),
  "fresh replay parity": v1.expected === v2.expected && title1 === title2,
  "handoff artifacts listed": handoff.artifacts.length >= 4,
};
let ok = true;
for (const [name, passed] of Object.entries(checks)) {
  log(`5 self-check ${name} → ${passed ? "PASS" : "FAIL"}`);
  ok = ok && passed;
}
console.log(`\nE2E_LOOP [${engine}] ${ok ? "PASS" : "FAIL"} (${Date.now() - t0}ms) — workspace: ${path.relative(ROOT, tdir)}`);
process.exit(ok ? 0 : 1);
