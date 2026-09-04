# jsrev

JS reverse engineering toolkit for coding agents. One plugin payload, dual engines, evidence-backed delivery.

> For authorized targets only. The user is responsible for ensuring they are authorized to test the target. Not for credential stuffing, account takeover, bulk registration, or bulk scraping.

## What it ships

| Component | Path | Purpose |
|---|---|---|
| Chrome engine MCP | `engines/chrome/` | Chromium true breakpoints, network/WS forensics (vendored from js-reverse-mcp v4.0.3, Apache-2.0 — snapshot `1a95d9c`) |
| Firefox engine MCP | `engines/firefox/` | Camoufox anti-fingerprint browsing, hook/AST instrumentation, JSVMP probes (vendored from camoufox-reverse-mcp v1.2.0) |
| Skill | `skills/jsrev/` | Methodology router: anti-bot classification → engine routing → Core Loop → delivery ladder → completion contract |
| Hooks | `hooks/session-start.mjs` | Doctor-lite engine probe, injected as session context |
| Commands | `commands/` | `/jsrev:doctor` (full diagnostics), `/jsrev:task` (evidence workspace scaffold) |
| CLI | `cli/jsrev.mjs` | Zero-dep Node CLI: `doctor` (real MCP handshakes), `task`, `crypto identify`, `hookgen`, `sandbox`, `proof`, `handshake` |
| Evals | `evals/` | Trigger evals (29, bilingual + compliance negatives) + dual-engine routing evals (10) + validator |

Design docs: [fusion-analysis.md](docs/fusion-analysis.md) (source audit) · [fusion-plan.md](docs/fusion-plan.md) (gap-driven plan) · [docs/DECISIONS.md](docs/DECISIONS.md) (decision record).

## Install (ZCode / Claude Code)

1. **Chrome engine** (required for the debugger server):

   ```shell
   cd engines/chrome
   npm install
   npm run build
   ```

2. **Firefox engine** (for instrumentation server; optional — disable the `jsrev-firefox` MCP server if not needed):

   ```shell
   pip install -r engines/firefox/requirements.txt
   camoufox fetch        # download the Camoufox browser binary (~300 MB, explicit step)
   ```

3. **Enable the plugin** in your host (ZCode: local plugin install / marketplace entry; Claude Code: plugin install from this directory). Both MCP servers (`jsrev-chrome`, `jsrev-firefox`) are declared in [.mcp.json](.mcp.json) and start from the plugin root automatically.

4. Optional user config: `jsrev_home` (evidence workspace root override; default per-project `./js_reverse_cache/`), `firefox_proxy` (HTTP proxy passed to the Camoufox engine).

5. Verify: open a new session — the SessionStart hook reports engine status; run the full diagnostics (real MCP handshakes on both engines):

   ```shell
   node cli/jsrev.mjs doctor
   ```

## CLI

```shell
node cli/jsrev.mjs doctor                  # diagnostics + real stdio MCP handshakes (chrome 24 / firefox 36 tools)
node cli/jsrev.mjs task my-target          # evidence workspace scaffold (tasks/my-target/)
node cli/jsrev.mjs crypto identify "<样本>" # ciphertext fingerprint
node cli/jsrev.mjs hookgen cookie          # prototype-chain cookie hook code
node cli/jsrev.mjs sandbox app.js          # zero-dep vm sandbox (add --extract-cookie)
node cli/jsrev.mjs proof public_proof_lab --self-test
node cli/jsrev.mjs handshake firefox       # single-engine handshake debug
```

All commands are zero-dependency (Node ≥ 20.19). `JSREV_PYTHON` and `JSREV_HOME` env vars override the python interpreter and workspace root.

## Host support tiers

- **Tier-1**: ZCode, Claude Code — full payload (dual MCP + skill + hooks + commands).
- **Tier-2**: Cursor / Codex / OpenCode — MCP + skills via `jsrev install <host>` (planned, M4).
- **Tier-3**: any shell-capable agent — CLI channel + skill markdown (planned).

## Layout

```
jsrev/
├── .zcode-plugin/plugin.json    # ZCode manifest (primary)
├── .claude-plugin/plugin.json   # Claude Code mirror (keep in sync)
├── .mcp.json                    # dual-engine MCP declaration
├── hooks/  commands/  skills/jsrev/
├── engines/chrome  engines/firefox
├── evals/  docs/  scripts/
```

Long-lived plugin data goes to the host-provided data dir (`ZCODE_PLUGIN_DATA`); task evidence always goes to the project workspace, never into the install root.

## License

- `engines/chrome/`: Apache-2.0 (see `engines/chrome/LICENSE`; derived from chrome-devtools-mcp, Copyright Google LLC headers retained).
- `engines/firefox/`: MIT per upstream declaration.
- Payload/skill code: same-project private use.

Private-use project; not published to marketplaces. If that changes, run the compliance checklist in `docs/DECISIONS.md` first.
