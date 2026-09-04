// Generate the machine tool-matrix from LIVE servers (GB-1).
// Replaces hand-maintained tool lists as the drift-detection source of truth.
// Usage: node scripts/generate-tool-matrix.mjs   → skills/jsrev/references/tool-matrix.json
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSession, engineSpecs } from "../cli/lib/handshake.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PY = process.env.JSREV_PYTHON || (process.platform === "win32" ? "python" : "python3");
const OUT = path.join(ROOT, "skills", "jsrev", "references", "tool-matrix.json");

const engines = {};
for (const engine of ["chrome", "firefox"]) {
  const spec = { ...engineSpecs(ROOT, PY)[engine] };
  if (engine === "firefox") spec.command = PY;
  const s = createSession({ ...spec, timeoutMs: 60000 });
  try {
    await s.ready;
    const tools = await s.listTools();
    engines[engine] = {
      count: tools.length,
      tools: tools.map((t) => ({
        name: t.name,
        description: (t.description || "").slice(0, 200),
        required: t.inputSchema?.required || [],
        properties: Object.keys(t.inputSchema?.properties || {}),
      })),
    };
    console.log(`[${engine}] captured ${tools.length} tools`);
  } catch (e) {
    console.error(`[${engine}] CAPTURE_FAIL: ${e.message}`);
    process.exit(1);
  } finally {
    s.close();
  }
}

const doc = {
  version: 1,
  generated_at: new Date().toISOString(),
  source: "live tools/list via scripts/generate-tool-matrix.mjs — regenerate after any engine change; doctor validates against this file",
  engines,
};
writeFileSync(OUT, JSON.stringify(doc, null, 2, "\n") + "\n");
console.log(`written: ${path.relative(ROOT, OUT)} (chrome ${engines.chrome.count} / firefox ${engines.firefox.count})`);
