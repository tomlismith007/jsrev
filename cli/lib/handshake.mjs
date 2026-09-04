// Minimal MCP stdio client (zero-dep, Node >= 20) — single source of truth for
// all jsrev tooling that talks to the engines over stdio.
// Used by: cli/jsrev.mjs (doctor / handshake), scripts/mcp-probe.mjs.
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * Full session over stdio: initialize → initialized → arbitrary requests.
 * The pump below is the proven pattern (doctor's handshake passes with it).
 * @returns {Promise<{request, listTools, callTool, close}>}
 */
export function createSession({ command, argv, env = {}, cwd = PLUGIN_ROOT, timeoutMs = 45000 }) {
  const child = spawn(command, argv, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  let settled = false;
  let stderrTail = "";
  const pending = new Map();
  let nextId = 1;

  const close = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try { child.kill(); } catch {}
  };
  const failAll = (message) => {
    const err = new Error(message + (stderrTail ? ` | stderr: ${stderrTail.slice(-400)}` : ""));
    pending.forEach((p) => p.reject(err));
    pending.clear();
    return err;
  };
  const timer = setTimeout(() => {
    const err = failAll(`session timeout after ${timeoutMs}ms`);
    readyReject(err);
  }, timeoutMs);
  let readyReject = () => {};

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (d) => { stderrTail += d; if (stderrTail.length > 4000) stderrTail = stderrTail.slice(-4000); });
  child.on("error", (e) => { readyReject(failAll(`spawn failed: ${e.message}`)); });
  child.on("exit", (code) => {
    if (!settled) readyReject(failAll(`server exited early (code ${code})`));
  });

  // newline-delimited JSON-RPC pump (single handler, proven in doctor)
  let lineBuf = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    lineBuf += chunk;
    let idx;
    while ((idx = lineBuf.indexOf("\n")) >= 0) {
      const line = lineBuf.slice(0, idx).trim();
      lineBuf = lineBuf.slice(idx + 1);
      if (!line.startsWith("{")) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.code} ${msg.error.message}`));
        else p.resolve(msg.result);
      }
    }
  });

  function request(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  const ready = (async () => {
    const p = new Promise((res, rej) => { readyReject = rej; });
    try {
      const init = await Promise.race([
        request("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "jsrev-client", version: "0.1.0" },
        }),
        p,
      ]);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
      return init;
    } catch (e) {
      close();
      throw e;
    }
  })();

  return {
    ready,
    request,
    close,
    async listTools() {
      const r = await request("tools/list", {});
      return r.tools || [];
    },
    async callTool(name, args) {
      try {
        const r = await request("tools/call", { name, arguments: args || {} });
        const sc = r.structuredContent || {};
        // FastMCP (firefox engine) returns dicts as text content without
        // structuredContent — parse the text so callers always get .data.
        let data = sc.data;
        if (data === undefined && !sc.ok) {
          const text = r.content?.[0]?.text;
          if (text) { try { data = JSON.parse(text); } catch { /* plain text */ } }
        }
        // B-style envelope: {ok:false,...}. A-style envelope: {"error":"..."}.
        const aStyleError = typeof data?.error === "string" && data.ok === undefined && !r.structuredContent;
        const ok = sc.ok !== false && !aStyleError;
        return {
          ok,
          summary: ok ? (sc.summary || r.content?.[0]?.text?.slice(0, 300) || "(no text)") : (aStyleError ? data.error : (sc.error?.message || sc.summary || r.content?.[0]?.text?.slice(0, 300) || "failed")),
          data,
        };
      } catch (e) {
        return { ok: false, summary: e.message };
      }
    },
  };
}

/** One-shot handshake (initialize + tools/list), used by doctor. */
export function mcpHandshake({ command, argv, env = {}, cwd = PLUGIN_ROOT, timeoutMs = 45000 }) {
  return new Promise((resolve) => {
    const s = createSession({ command, argv, env, cwd, timeoutMs });
    (async () => {
      try {
        await s.ready;
        const tools = await s.listTools();
        resolve({ ok: true, toolCount: tools.length, tools, serverInfo: {} });
      } catch (e) {
        resolve({ ok: false, error: e.message });
      } finally {
        s.close();
      }
    })();
  });
}

export function engineSpecs(root = PLUGIN_ROOT, pyCmd = "python") {
  return {
    chrome: { command: "node", argv: [path.join(root, "engines", "chrome", "build", "src", "index.js")] },
    firefox: { command: pyCmd, argv: [path.join(root, "engines", "firefox", "launch_server.py")] },
  };
}

// direct-run: node cli/lib/handshake.mjs chrome|firefox
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const which = process.argv[2];
  const specs = engineSpecs();
  if (!specs[which]) {
    console.error("usage: node cli/lib/handshake.mjs chrome|firefox");
    process.exit(2);
  }
  const spec = { ...specs[which] };
  if (which === "firefox" && process.platform === "win32") {
    spec.command = process.env.JSREV_PYTHON || "python";
  }
  const r = await mcpHandshake(spec);
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
}
