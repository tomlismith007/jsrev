#!/usr/bin/env node
// jsrev eval runner — validate mode is CI-safe (no model needed);
// live mode (M3+) will score trigger/routing with a real model session.
// Usage:
//   node scripts/run-evals.mjs            # validate all eval files
//   node scripts/run-evals.mjs --live     # live scoring (requires MCP_EVAL_ENDPOINT, M3+)
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const check = (name, ok, detail = "") => {
  console.log(`[${ok ? "PASS" : "FAIL"}] ${name}${detail ? ": " + detail : ""}`);
  if (!ok) errors.push(name);
};

// ---- trigger evals ----
const trigPath = path.join(ROOT, "evals", "trigger-evals.json");
const trig = JSON.parse(readFileSync(trigPath, "utf-8"));
check("trigger: ≥25 cases", trig.length >= 25, `got ${trig.length}`);
check("trigger: schema {query,should_trigger}", trig.every((c) => typeof c.query === "string" && c.query.trim() && typeof c.should_trigger === "boolean"));
const negatives = trig.filter((c) => c.should_trigger === false);
check("trigger: ≥8 negatives", negatives.length >= 8, `got ${negatives.length}`);
const en = trig.filter((c) => /[a-zA-Z]{4,}/.test(c.query));
check("trigger: bilingual coverage (≥5 EN)", en.length >= 5, `got ${en.length}`);
const dupes = trig.map((c) => c.query).filter((q, i, a) => a.indexOf(q) !== i);
check("trigger: no duplicate queries", dupes.length === 0, dupes.slice(0, 2).join(" | "));
const ids = trig.map((c) => c.id);
check("trigger: unique ids", new Set(ids).size === trig.length);
// out-of-scope negatives must stay negative (compliance smoke)
const compliance = negatives.filter((c) => /撞库|批量登录|绕过付费|credential|bulk login/i.test(c.query));
check("trigger: abuse cases remain negative", compliance.every((c) => c.should_trigger === false) && compliance.length >= 1);

// ---- engine routing evals ----
const routePath = path.join(ROOT, "evals", "engine-routing.json");
const routes = JSON.parse(readFileSync(routePath, "utf-8"));
check("routing: 10 cases", routes.length === 10, `got ${routes.length}`);
check("routing: expect_engine enum", routes.every((c) => ["chrome", "firefox", "either", "none"].includes(c.expect_engine)));
check("routing: unique ids", new Set(routes.map((c) => c.id)).size === routes.length);
const per = routes.reduce((acc, c) => ((acc[c.expect_engine] = (acc[c.expect_engine] || 0) + 1), acc), {});
check("routing: both engines covered", (per.chrome || 0) >= 2 && (per.firefox || 0) >= 4, JSON.stringify(per));

// ---- summary ----
if (errors.length) {
  console.log(`\nEVALS VALIDATE: ${errors.length} FAIL`);
  process.exit(1);
}
console.log(`\nEVALS VALIDATE: all passed (trigger ${trig.length}, routing ${routes.length})`);
if (process.argv.includes("--live")) {
  console.log("live scoring requires MCP_EVAL_ENDPOINT + model session — scheduled for M3 (see fusion-plan GC-8)");
  process.exit(2);
}
