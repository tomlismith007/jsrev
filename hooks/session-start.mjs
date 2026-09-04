#!/usr/bin/env node
/**
 * jsrev SessionStart hook — engine availability probe (doctor-lite).
 *
 * Protocol (ZCode/Claude Code):
 * - Read one JSON event object from stdin
 * - Write a single JSON object to stdout (must start with `{`)
 * - Diagnostics on stderr only
 *
 * Deliberately cheap: binary/build existence checks + one fast python probe
 * (importlib.util.find_spec does NOT execute the modules). Deep checks
 * (pip versions, MCP handshake, browser binaries) belong to /jsrev:doctor.
 * Every failure degrades silently: this hook always exits 0 with valid JSON.
 */

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const PLUGIN_ROOT =
  process.env.ZCODE_PLUGIN_ROOT ||
  process.env.CLAUDE_PLUGIN_ROOT ||
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;

let input = {};
try {
  input = raw.trim() ? JSON.parse(raw) : {};
} catch (err) {
  process.stderr.write(`[jsrev] invalid SessionStart stdin: ${err}\n`);
  process.exit(1);
}

function run(cmd, args, timeoutMs = 3000) {
  try {
    const r = spawnSync(cmd, args, {
      timeout: timeoutMs,
      encoding: "utf8",
      windowsHide: true,
    });
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
    if (version && /^\d+\.\d+/.test(version)) {
      return { cmd, version, deps: deps || "" };
    }
  }
  return null;
}

const ok = [];
const missing = [];

// 1. chrome engine build artifact (entry pointed to by .mcp.json)
const chromeEntry = path.join(PLUGIN_ROOT, "engines", "chrome", "build", "src", "index.js");
if (existsSync(chromeEntry)) {
  ok.push("chrome:ready");
} else {
  missing.push("chrome engine not built — run: cd engines/chrome && npm install && npm run build");
}

// 2. firefox engine: vendored source + python deps (single fast probe)
const firefoxSrc = path.join(PLUGIN_ROOT, "engines", "firefox", "src", "camoufox_reverse_mcp", "server.py");
if (!existsSync(firefoxSrc)) {
  missing.push("firefox engine source missing from plugin payload");
} else {
  const py = probePython();
  if (!py) {
    missing.push("python 3 not found on PATH — firefox engine unavailable (install Python 3.10+)");
  } else {
    ok.push(`python:${py.version}`);
    if (py.deps) {
      const absent = py.deps.split(",").filter((m) => m.startsWith("-")).map((m) => m.slice(1));
      if (absent.length === 0) {
        ok.push("firefox deps:ok");
      } else {
        missing.push(
          `firefox engine missing pip deps: ${absent.join(", ")} — run: pip install -r engines/firefox/requirements.txt (then: camoufox fetch)`,
        );
      }
    }
  }
}

const status = missing.length === 0 ? "all engines ready" : `${missing.length} issue(s)`;
const context =
  `jsrev plugin active (${status}). ` +
  (ok.length ? `OK: ${ok.join("; ")}. ` : "") +
  (missing.length ? `MISSING: ${missing.join(" | ")} — run /jsrev:doctor for full diagnostics. ` : "") +
  "Reverse-engineering workflows: see the jsrev skill; evidence goes to the project's js_reverse_cache/tasks/ workspace.";

process.stderr.write(
  `[jsrev] SessionStart source=${input.source || "unknown"} ok=${ok.length} missing=${missing.length}\n`,
);

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: {
      hookEventName: input.hook_event_name || input.hookEventName || "SessionStart",
      additionalContext: context,
    },
  }),
);
