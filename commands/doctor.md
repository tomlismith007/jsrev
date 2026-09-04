---
description: Run full jsrev environment diagnostics (engines, dependencies, real MCP handshakes) and report what is missing with fix instructions
---

Run the jsrev CLI diagnostics and interpret the results. Run it from the **session's project root** — the workspace check resolves to `$JSREV_HOME` or `./js_reverse_cache`, the same root `/jsrev:task` uses — and invoke the CLI by its absolute path inside this plugin:

```shell
node "<plugin-root>/cli/jsrev.mjs" doctor
```

Do NOT `cd` into the plugin root to run it: the workspace check would then validate the plugin cache's own `js_reverse_cache` instead of the project evidence workspace.

It checks and reports PASS/FAIL with fix commands for:

1. **node** (≥20.19) and **python** (≥3.10) runtimes
2. **firefox-deps**: mcp / camoufox / playwright / esprima importability (fast find_spec probe)
3. **chrome-mcp**: build artifact + a REAL stdio MCP handshake (initialize → tools/list), expects 24 tools
4. **firefox-mcp**: a REAL stdio handshake through `engines/firefox/launch_server.py`, expects 36 tools (no browser launched)
5. **tool-matrix**: live tool lists vs the generated `references/tool-matrix.json` — DRIFT means an engine changed; fix: `node scripts/generate-tool-matrix.mjs`
6. **camoufox-binary**: whether the Camoufox browser binary has been fetched (fix: `camoufox fetch`)
7. **legacy-skill**: old `hello_js_reverse_skill` installs that compete for triggers (retire them — they reference deleted tools)
8. **workspace**: JSREV_HOME (or default `./js_reverse_cache/`) writability

Nine checks total (node/python/firefox-deps count separately), exit code is non-zero if anything failed. For each FAIL, surface the printed `fix:` command to the user and offer to run it.

If the user passed arguments ($ARGUMENTS), filter the reported checks to those keywords before summarizing. Do not run the checks manually unless the CLI itself is broken — report that separately if so.
