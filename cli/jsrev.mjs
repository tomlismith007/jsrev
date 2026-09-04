#!/usr/bin/env node
// jsrev CLI — zero-dependency command line for the jsrev plugin.
// Commands:
//   jsrev doctor                       environment diagnostics + real MCP handshakes
//   jsrev task <name> [--root <dir>]   evidence workspace scaffold (tasks/<name>/)
//   jsrev evidence <task> <file>       register an evidence artifact into a task workspace
//   jsrev crypto identify|... [args]   ciphertext fingerprint (vendor/crypto-identifier.js)
//   jsrev hookgen <type> [options]     page hook code generator (vendor/hook-generator.js)
//   jsrev sandbox [args]               zero-dep vm sandbox runner (vendor/sandbox-runner.js)
//   jsrev webpack [args]               offline webpack chunk boot / module probe (vendor/webpack-boot.js)
//   jsrev proof <script> [args]        D proof scripts (crypto_fingerprint / protocol_diff / public_proof_lab)
//   jsrev handshake chrome|firefox     single-engine MCP handshake debug

import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync, readFileSync, accessSync, copyFileSync, appendFileSync, constants as fsConst } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { mcpHandshake, engineSpecs } from "./lib/handshake.mjs";

const CLI_ROOT = path.dirname(fileURLToPath(import.meta.url));
const PLUGIN_ROOT = path.resolve(CLI_ROOT, "..");
const VENDOR = (f) => path.join(CLI_ROOT, "vendor", f);
const SCRIPTS = (f) => path.join(PLUGIN_ROOT, "skills", "jsrev", "scripts", f);
const PY = process.env.JSREV_PYTHON || (process.platform === "win32" ? "python" : "python3");

function run(cmd, argv, timeoutMs = 4000) {
  try {
    const r = spawnSync(cmd, argv, { timeout: timeoutMs, encoding: "utf8", windowsHide: true });
    if (r.error || r.status !== 0) return null;
    return (r.stdout || "").trim();
  } catch {
    return null;
  }
}

function probePython() {
  const candidates = process.platform === "win32" ? ["python", "py"] : ["python3", "python"];
  const probeCode =
    "import sys, importlib.util as u;" +
    "print(sys.version.split()[0]);" +
    "mods = ['mcp', 'camoufox', 'playwright', 'esprima'];" +
    "print(','.join((m if u.find_spec(m) else '-' + m) for m in mods))";
  for (const cmd of candidates) {
    const out = run(cmd, ["-c", probeCode]);
    if (!out) continue;
    const [version, deps] = out.split("\n").map((s) => s.trim());
    if (version && /^\d+\.\d+/.test(version)) return { cmd, version, deps: deps || "" };
  }
  return null;
}

// ---------------- doctor ----------------
async function doctor() {
  const results = [];
  const push = (name, ok, detail, fix) => results.push({ name, ok, detail, fix });

  // 1. node
  const nodeVer = process.version.replace(/^v/, "");
  const nodeOk = (() => {
    const [ma, mi] = nodeVer.split(".").map(Number);
    return ma > 20 || (ma === 20 && mi >= 19) || ma > 22 || (ma === 22 && mi >= 12) || ma >= 23;
  })();
  push("node", nodeOk, nodeVer, nodeOk ? "" : "upgrade Node.js to >= 20.19");

  // 2. python + firefox pip deps
  const py = probePython();
  if (!py) {
    push("python", false, "not found on PATH", "install Python 3.10+ and put it on PATH");
  } else {
    const absent = py.deps ? py.deps.split(",").filter((m) => m.startsWith("-")).map((m) => m.slice(1)) : [];
    push(
      "python",
      true,
      `${py.version} (${py.cmd})`,
      "",
    );
    push(
      "firefox-deps",
      absent.length === 0,
      absent.length === 0 ? py.deps : `missing: ${absent.join(", ")}`,
      absent.length === 0 ? "" : `pip install -r engines/firefox/requirements.txt`,
    );
  }

  // 3. chrome engine: build + real handshake (tools captured for GB-2 matrix drift check)
  const chromeEntry = path.join(PLUGIN_ROOT, "engines", "chrome", "build", "src", "index.js");
  let chromeTools = null;
  if (!existsSync(chromeEntry)) {
    push("chrome-mcp", false, "build/src/index.js missing", "cd engines/chrome && npm install && npm run build");
  } else {
    const spec = engineSpecs(PLUGIN_ROOT).chrome;
    const r = await mcpHandshake({ ...spec, timeoutMs: 40000 });
    chromeTools = r.ok ? r.tools.map((t) => t.name) : null;
    push(
      "chrome-mcp",
      r.ok,
      r.ok ? `handshake ok, ${r.toolCount} tools (expect 24)` : r.error,
      r.ok ? "" : "cd engines/chrome && npm install && npm run build",
    );
  }

  // 4. firefox engine: real handshake (no browser launched, tools/list only)
  const firefoxSrc = path.join(PLUGIN_ROOT, "engines", "firefox", "src", "camoufox_reverse_mcp", "server.py");
  let firefoxTools = null;
  if (!existsSync(firefoxSrc)) {
    push("firefox-mcp", false, "engine source missing", "re-vendor engines/firefox");
  } else if (!py || (py.deps && py.deps.split(",").some((m) => m.startsWith("-")))) {
    push("firefox-mcp", false, "skipped (deps missing)", "pip install -r engines/firefox/requirements.txt first");
  } else {
    const spec = engineSpecs(PLUGIN_ROOT, py.cmd).firefox;
    const r = await mcpHandshake({ command: py.cmd, argv: spec.argv, timeoutMs: 45000 });
    firefoxTools = r.ok ? r.tools.map((t) => t.name) : null;
    push(
      "firefox-mcp",
      r.ok,
      r.ok ? `handshake ok, ${r.toolCount} tools (expect 36)` : r.error,
      r.ok ? "" : "check engines/firefox/launch_server.py stderr",
    );
  }

  // 4b. tool-matrix drift check (GB-2): live tool lists vs generated machine matrix
  const matrixPath = path.join(PLUGIN_ROOT, "skills", "jsrev", "references", "tool-matrix.json");
  if (!existsSync(matrixPath)) {
    push("tool-matrix", false, "tool-matrix.json missing", "node scripts/generate-tool-matrix.mjs");
  } else if (!chromeTools && !firefoxTools) {
    push("tool-matrix", false, "skipped (no live engines to compare)", "");
  } else {
    let drift = [];
    try {
      const matrix = JSON.parse(readFileSync(matrixPath, "utf-8"));
      const live = { chrome: chromeTools, firefox: firefoxTools };
      for (const eng of ["chrome", "firefox"]) {
        if (!live[eng]) continue;
        const recorded = (matrix.engines?.[eng]?.tools || []).map((t) => t.name);
        const drifted = live[eng].filter((t) => !recorded.includes(t))
          .concat(recorded.filter((t) => !live[eng].includes(t)));
        if (drifted.length) drift.push(`${eng}: ${drifted.join(", ")}`);
      }
    } catch (e) {
      drift.push(`unreadable: ${e.message}`);
    }
    push("tool-matrix", drift.length === 0, drift.length === 0 ? "live tool lists match generated matrix" : `DRIFT ${drift.join(" | ")}`,
      drift.length === 0 ? "" : "node scripts/generate-tool-matrix.mjs   # regenerate after engine changes");
  }

  // 5. camoufox browser binary (correct API: installed_verstr() raises CamoufoxNotInstalled when missing)
  if (py && py.deps && py.deps.includes("camoufox")) {
    const ver = run(py.cmd, ["-c", "import camoufox; from camoufox.utils import installed_verstr; print(installed_verstr())"], 20000);
    push(
      "camoufox-binary",
      Boolean(ver),
      ver ? `browser binary installed (${ver})` : "browser binary not fetched",
      ver ? "" : "camoufox fetch   # downloads the patched Firefox binary (check with: camoufox active)",
    );
  }

  // 6. legacy skill conflicts (trigger competition)
  const home = os.homedir();
  const legacy = [
    ".agents/skills/hello_js_reverse_skill",
    ".zcode/skills/hello_js_reverse_skill",
    ".cursor/skills/hello_js_reverse_skill",
    ".codex/skills/hello_js_reverse_skill",
  ]
    .map((p) => path.join(home, p))
    .filter((p) => existsSync(p));
  push(
    "legacy-skill",
    legacy.length === 0,
    legacy.length === 0 ? "no legacy hello_js_reverse_skill install" : `found: ${legacy.join(", ")}`,
    legacy.length === 0 ? "" : "retire the old copies (they reference deleted tools and compete for triggers)",
  );

  // 7. evidence workspace root writability
  const wsRoot = process.env.JSREV_HOME || path.join(process.cwd(), "js_reverse_cache");
  let wsOk = false;
  let wsDetail = wsRoot;
  try {
    const target = existsSync(wsRoot) ? wsRoot : path.dirname(wsRoot);
    accessSync(target, fsConst.W_OK);
    wsOk = true;
  } catch {
    wsOk = false;
    wsDetail = `${wsRoot} (not writable)`;
  }
  push("workspace", wsOk, wsDetail, wsOk ? "" : "set JSREV_HOME to a writable directory");

  // report
  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`[${mark}] ${r.name}: ${r.detail}`);
    if (!r.ok && r.fix) console.log(`       fix: ${r.fix}`);
  }
  console.log(`\njsrev doctor: ${results.length - failed.length}/${results.length} passed`);
  return failed.length === 0 ? 0 : 1;
}

// ---------------- task ----------------
function task(name, opts = {}) {
  if (!name) {
    console.error("usage: jsrev task <name> [--root <dir>]");
    return 2;
  }
  const root = opts.root || process.env.JSREV_HOME || path.join(process.cwd(), "js_reverse_cache");
  const dir = path.join(root, "tasks", name);
  if (existsSync(dir)) {
    console.error(`task already exists: ${dir}`);
    return 1;
  }
  mkdirSync(path.join(dir, "fixtures"), { recursive: true });
  const now = new Date().toISOString();
  writeFileSync(
    path.join(dir, "task.json"),
    JSON.stringify(
      {
        task_id: name,
        target: "<authorization target URL>",
        class: "signature | behavioral | obfuscation",
        goal_fields: [],
        delivery_target: "pure | +js | +wasm | +instrumented | blocked",
        engines_used: [],
        created_at: now,
        status: "recon",
      },
      null,
      2,
      "\n",
    ),
  );
  writeFileSync(path.join(dir, "network.jsonl"), "");
  writeFileSync(path.join(dir, "runtime-evidence.jsonl"), "");
  writeFileSync(
    path.join(dir, "handoff.json"),
    JSON.stringify(
      {
        task_id: name,
        mode: "recon",
        current_stage: "recon",
        target_url: "",
        target_fields: [],
        baseline_id: "",
        artifacts: [],
        success_predicate: "fixed-vector parity + fresh replay",
        unresolved: [],
      },
      null,
      2,
      "\n",
    ),
  );
  writeFileSync(
    path.join(dir, "report.md"),
    [
      `# ${name}`,
      "",
      "## 1. Phase Delta",
      "<!-- 本次相对上次会话推进了什么 -->",
      "",
      "## 2. Recon",
      "<!-- 目标行为、类别判定（signature/behavioral/obfuscation）、动态字段清单 -->",
      "",
      "## 3. Implementation Decision",
      "<!-- 交付档位选择与理由（五级阶梯） -->",
      "",
      "## 4. Final Delivery",
      "<!-- 离线路径说明、helper 边界、文件清单 -->",
      "",
      "## 5. Minimal Verifiable Facts",
      "<!-- 5-15 条可测事实，带 fixtures/ 引用 -->",
      "",
      "## 6. Residual Risks / Blockers",
      "<!-- 未竟事项与诚实声明 -->",
      "",
    ].join("\n"),
  );
  console.log(`task workspace created: ${dir}`);
  console.log(`${dir}/task.json`);
  console.log(`${dir}/network.jsonl`);
  console.log(`${dir}/runtime-evidence.jsonl`);
  console.log(`${dir}/handoff.json`);
  console.log(`${dir}/fixtures/`);
  console.log(`${dir}/report.md`);
  return 0;
}

// ---------------- evidence ----------------
// Register an artifact into a task workspace and append a jsonl evidence line.
// Complements engine-side exports (e.g. chrome list_network_requests outputFile),
// which save bytes but do not register the file into the evidence jsonl.
function evidence(taskName, file, opts = {}) {
  if (!taskName || !file) {
    console.error("usage: jsrev evidence <task> <file> [--kind runtime|network] [--note <text>] [--root <dir>]");
    return 2;
  }
  const root = opts.root || process.env.JSREV_HOME || path.join(process.cwd(), "js_reverse_cache");
  const dir = path.join(root, "tasks", taskName);
  const jsonlName = opts.kind === "network" ? "network.jsonl" : "runtime-evidence.jsonl";
  const jsonlPath = path.join(dir, jsonlName);
  if (!existsSync(jsonlPath)) {
    console.error(`task workspace not found (missing ${jsonlName}): ${dir}`);
    return 1;
  }
  if (!existsSync(file)) {
    console.error(`artifact not found: ${file}`);
    return 1;
  }
  const resolved = path.resolve(file);
  const dest = path.join(dir, path.basename(resolved));
  let registeredFile = resolved;
  if (path.dirname(resolved) !== path.resolve(dir)) {
    copyFileSync(resolved, dest);
    registeredFile = dest;
  }
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    type: "artifact",
    file: path.basename(registeredFile),
    note: opts.note || "",
    source: "cli evidence",
  });
  appendFileSync(jsonlPath, line + "\n");
  console.log(`registered in ${jsonlName}: ${path.basename(registeredFile)}`);
  return 0;
}

// ---------------- passthrough wrappers ----------------
function passthrough(cmd, argv) {
  const child = spawn(cmd, argv, { stdio: "inherit", windowsHide: true });
  return new Promise((code) => child.on("exit", (c) => code(c ?? 1)));
}

// ---------------- main ----------------
const [, , cmd, ...rest] = process.argv;

function help() {
  console.log(`jsrev — JS reverse engineering toolkit CLI

usage: jsrev <command> [args]

  doctor                       environment diagnostics + real MCP handshakes
  task <name> [--root <dir>]   evidence workspace scaffold
  evidence <task> <file>       register artifact into task evidence jsonl
  crypto identify "<样本>"     ciphertext fingerprint (passthrough)
  hookgen <type> [options]     page hook generator (passthrough)
  sandbox <args...>            vm sandbox runner (passthrough)
  webpack <chunk.js...> [opts] offline webpack chunk boot / module probe (passthrough)
  proof <crypto_fingerprint|protocol_diff|public_proof_lab> [args...]
  handshake chrome|firefox     single-engine MCP handshake debug
  help                         this message

env:
  JSREV_HOME    evidence workspace root override (default ./js_reverse_cache)
  JSREV_PYTHON  python interpreter override (default python / python3)`);
}

switch (cmd) {
  case "doctor":
    process.exit(await doctor());
    break;
  case "task": {
    const name = rest[0] && !rest[0].startsWith("--") ? rest[0] : undefined;
    const rootIdx = rest.indexOf("--root");
    const root = rootIdx >= 0 ? rest[rootIdx + 1] : undefined;
    process.exit(await task(name, { root }));
    break;
  }
  case "evidence": {
    const flagArgs = new Set(["--kind", "--note", "--root"]);
    const positionals = [];
    for (let i = 0; i < rest.length; i++) {
      if (flagArgs.has(rest[i])) {
        i++;
        continue;
      }
      if (!rest[i].startsWith("--")) positionals.push(rest[i]);
    }
    const getOpt = (flag) => {
      const idx = rest.indexOf(flag);
      return idx >= 0 ? rest[idx + 1] : undefined;
    };
    process.exit(
      await evidence(positionals[0], positionals[1], {
        kind: getOpt("--kind"),
        note: getOpt("--note"),
        root: getOpt("--root"),
      }),
    );
    break;
  }
  case "webpack":
    process.exit(await passthrough("node", [VENDOR("webpack-boot.js"), ...rest]));
    break;
  case "crypto": {
    // jsrev crypto identify "<样本>" → vendor 脚本直接吃样本，剥掉子命令名
    const args = rest[0] === "identify" ? rest.slice(1) : rest;
    process.exit(await passthrough("node", [VENDOR("crypto-identifier.js"), ...args]));
    break;
  }
  case "hookgen": {
    // jsrev hookgen cookie --target x → --type=cookie --target x
    const args = rest[0] && !rest[0].startsWith("--") ? [`--type=${rest[0]}`, ...rest.slice(1)] : rest;
    process.exit(await passthrough("node", [VENDOR("hook-generator.js"), ...args]));
    break;
  }
  case "sandbox":
    process.exit(await passthrough("node", [VENDOR("sandbox-runner.js"), ...rest]));
    break;
  case "proof": {
    const [script, ...args] = rest;
    const allow = ["crypto_fingerprint", "protocol_diff", "public_proof_lab"];
    if (!allow.includes(script)) {
      console.error(`proof scripts: ${allow.join(", ")} (from skills/jsrev/scripts/)`);
      process.exit(2);
    }
    process.exit(await passthrough(PY, [SCRIPTS(`${script}.py`), ...args]));
    break;
  }
  case "handshake": {
    const which = rest[0];
    const specs = engineSpecs(PLUGIN_ROOT, PY);
    if (!specs[which]) {
      console.error("usage: jsrev handshake chrome|firefox");
      process.exit(2);
    }
    const spec = { ...specs[which] };
    if (which === "firefox") spec.command = PY;
    const r = await mcpHandshake(spec);
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.ok ? 0 : 1);
    break;
  }
  default:
    help();
    process.exit(cmd ? 2 : 0);
}
