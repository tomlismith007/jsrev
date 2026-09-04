#!/usr/bin/env python3
"""jsrev consistency audit — find "another set of discrepancies" mechanically.

Checks:
  A. dual manifests (.zcode-plugin vs .claude-plugin) byte-identical
  B. every relative markdown link inside skills/jsrev resolves
  C. .mcp.json entry files exist (chrome build + firefox launcher)
  D. CLI task/handoff templates ⊆ evidence-schemas.md declared fields
  E. engine internal display names vs declared server keys (informational)
  F. hooks.json script path + commands/ files exist
  G. no stale references to retired legacy skill inside the payload surface
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
fails: list[str] = []
notes: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    print(f"[{'PASS' if ok else 'FAIL'}] {name}" + (f": {detail}" if detail else ""))
    if not ok:
        fails.append(name)


# A. dual manifests
a = (ROOT / ".zcode-plugin" / "plugin.json").read_text(encoding="utf-8")
b = (ROOT / ".claude-plugin" / "plugin.json").read_text(encoding="utf-8")
check("A dual manifests identical", a == b)

# B. relative md links resolve (strip fenced code blocks + inline code first)
link_re = re.compile(r"\[[^\]]+\]\(([^)#\s]+)\)")
broken: list[str] = []
scanned = 0
for md in (ROOT / "skills" / "jsrev").rglob("*.md"):
    text = md.read_text(encoding="utf-8", errors="ignore")
    text = re.sub(r"```.*?```", "", text, flags=re.S)  # fenced blocks
    text = re.sub(r"`[^`]*`", "", text)  # inline code
    scanned += 1
    for m in link_re.finditer(text):
        target = m.group(1)
        if target.startswith(("http://", "https://", "mailto:")):
            continue
        if "/" not in target and "." not in target:
            continue  # prose fragments like (args), not links
        resolved = (md.parent / target).resolve()
        if not resolved.exists():
            broken.append(f"{md.relative_to(ROOT)} -> {target}")
check("B skill md links resolve", not broken, "; ".join(broken[:5]) or f"scanned {scanned} files")

# C. .mcp.json entries exist
mcp = json.loads((ROOT / ".mcp.json").read_text(encoding="utf-8"))
missing: list[str] = []
for key, srv in mcp["mcpServers"].items():
    args = srv.get("args", [])
    for arg in args:
        if "ZCODE_PLUGIN_ROOT" in arg:
            real = arg.replace("${ZCODE_PLUGIN_ROOT}/", "")
            if not (ROOT / real).exists():
                missing.append(f"{key}: {real}")
        elif arg.endswith(".py") or arg.endswith(".js"):
            if not (ROOT / arg).exists():
                missing.append(f"{key}: {arg}")
check("C .mcp.json entry files exist", not missing, "; ".join(missing))

# D. real CLI output vs evidence-schemas.md documented fields
import shutil
import subprocess
import tempfile

tmp = Path(tempfile.mkdtemp(prefix="jsrev-audit-"))
r = subprocess.run(
    ["node", str(ROOT / "cli" / "jsrev.mjs"), "task", "audit-probe", "--root", str(tmp)],
    capture_output=True, text=True, timeout=30,
)
if r.returncode != 0:
    check("D CLI task output vs schema doc", False, r.stderr.strip()[:120])
else:
    tdir = tmp / "tasks" / "audit-probe"
    task = json.loads((tdir / "task.json").read_text(encoding="utf-8"))
    handoff = json.loads((tdir / "handoff.json").read_text(encoding="utf-8"))
    schemas_md = (ROOT / "skills" / "jsrev" / "references" / "evidence-schemas.md").read_text(encoding="utf-8")
    missing = [f"task.json:{k}" for k in task if f'"{k}"' not in schemas_md]
    missing += [f"handoff.json:{k}" for k in handoff if f'"{k}"' not in schemas_md]
    files_ok = all((tdir / f).exists() for f in ("network.jsonl", "runtime-evidence.jsonl", "report.md", "fixtures"))
    check("D CLI task output vs schema doc", not missing and files_ok,
          f"missing: {missing}" if missing else f"task.json {len(task)} fields + handoff {len(handoff)} fields documented; files {'ok' if files_ok else 'MISSING'}")
shutil.rmtree(tmp, ignore_errors=True)

# E. engine internal display names (informational)
chrome_main = (ROOT / "engines" / "chrome" / "src" / "main.ts").read_text(encoding="utf-8", errors="ignore")
chrome_name = re.search(r"name:\s*['\"]([^'\"]+)['\"]", chrome_main)
ff_server = (ROOT / "engines" / "firefox" / "src" / "camoufox_reverse_mcp" / "server.py").read_text(encoding="utf-8", errors="ignore")
ff_name = re.search(r'SchemaCompatibleFastMCP\(\s*"([^"]+)"', ff_server)
print(f"[INFO] E chrome serverInfo.name = {chrome_name.group(1) if chrome_name else '?'} (declared key: jsrev-chrome)")
print(f"[INFO] E firefox FastMCP name  = {ff_name.group(1) if ff_name else '?'} (declared key: jsrev-firefox)")

# F. hooks + commands files exist
hooks = json.loads((ROOT / "hooks" / "hooks.json").read_text(encoding="utf-8"))
hook_args = hooks["hooks"]["SessionStart"][0]["hooks"][0]["args"][0]
hook_rel = hook_args.replace("${ZCODE_PLUGIN_ROOT}/", "")  # e.g. hooks/session-start.mjs
check("F hooks script exists", (ROOT / hook_rel).exists(), hook_rel)
cmds = list((ROOT / "commands").glob("*.md"))
check("F commands present", {p.name for p in cmds} >= {"doctor.md", "task.md"}, f"{[p.name for p in cmds]}")

# G. legacy-skill references in operational payload — lineage/attribution lines are
# legitimate provenance; flag only functional references (instructions to load/call it).
lineage_re = re.compile(r"^\s*>|lineage|蒸馏自|源自|迁移自|新写于|legacy-skill|retire|退役")
stale: list[str] = []
for p in list((ROOT / "skills").rglob("*.md")) + list((ROOT / "commands").glob("*.md")):
    for i, line in enumerate(p.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
        if "hello_js_reverse_skill" in line and not lineage_re.search(line):
            stale.append(f"{p.relative_to(ROOT)}:{i}")
if "hello_js_reverse_skill" in (ROOT / ".mcp.json").read_text(encoding="utf-8"):
    stale.append(".mcp.json")
check("G no functional legacy-skill references in payload", not stale, "; ".join(stale[:5]))

# H. tool-matrix completeness vs authoritative engine tool lists (from live audit)
CHROME_TOOLS = {"break_on_xhr","clear_network_requests","clear_site_data","click_element","evaluate_script","get_paused_info","get_request_initiator","get_script_source","get_websocket_messages","list_breakpoints","list_console_messages","list_network_requests","list_scripts","navigate_page","new_page","pause_or_resume","remove_breakpoint","save_script_source","search_in_sources","select_frame","select_page","set_breakpoint_on_text","step","take_screenshot"}
FIREFOX_TOOLS = {"launch_browser","close_browser","navigate","reload","take_screenshot","take_snapshot","click","type_text","wait_for","get_page_info","reset_browser_state","scripts","search_code","evaluate_js","hook_function","inject_hook_preset","remove_hooks","get_console_logs","network_capture","list_network_requests","get_network_request","get_request_initiator","intercept_request","cookies","get_storage","export_state","import_state","analyze_cookie_sources","hook_jsvmp_interpreter","compare_env","instrumentation","check_environment","verify_signer_offline","trace_property_access","list_trace_files","query_trace_file"}
OLD_NAMES = {"trace_function","start_network_capture","stop_network_capture","get_cookies","save_script","find_dispatch_loops","instrument_jsvmp_source","reload_with_hooks","get_instrumentation_log","get_instrumentation_status","stop_instrumentation","get_property_access_log","get_trace_data","set_breakpoint_via_hook","get_breakpoint_data","get_fingerprint_info","check_detection","dump_jsvmp_strings","get_runtime_probe_log","bypass_debugger_trap","get_jsvmp_log","list_sessions","attach_domain_readonly","verify_assertion"}
matrix = (ROOT / "skills" / "jsrev" / "references" / "tool-matrix.md").read_text(encoding="utf-8")
miss_matrix = sorted((CHROME_TOOLS | FIREFOX_TOOLS) - {t for t in (CHROME_TOOLS | FIREFOX_TOOLS) if f"`{t}`" in matrix})
check("H tool-matrix covers all 60 engine tools", not miss_matrix, f"missing from matrix: {miss_matrix}")
stray: list[str] = []
for p in list((ROOT / "skills").rglob("*.md")) + list((ROOT / "commands").glob("*.md")):
    if p.name == "tool-matrix.md":
        continue
    text = p.read_text(encoding="utf-8", errors="ignore")
    for old in OLD_NAMES:
        if re.search(rf"`{old}`", text):
            stray.append(f"{p.relative_to(ROOT)}:`{old}`")
check("H no old tool names outside migration table", not stray, "; ".join(stray[:5]))

# H3. generated tool-matrix.json must match the authoritative live-audited lists
matrix_json_path = ROOT / "skills" / "jsrev" / "references" / "tool-matrix.json"
if not matrix_json_path.exists():
    check("H3 generated tool-matrix.json", False, "missing — node scripts/generate-tool-matrix.mjs")
else:
    mj = json.loads(matrix_json_path.read_text(encoding="utf-8"))
    jc = {t["name"] for t in mj.get("engines", {}).get("chrome", {}).get("tools", [])}
    jf = {t["name"] for t in mj.get("engines", {}).get("firefox", {}).get("tools", [])}
    ok = jc == CHROME_TOOLS and jf == FIREFOX_TOOLS
    detail = "" if ok else f"chrome diff: {sorted(jc ^ CHROME_TOOLS)[:6]}; firefox diff: {sorted(jf ^ FIREFOX_TOOLS)[:6]}"
    check("H3 generated tool-matrix.json matches authoritative lists", ok, detail)

# I. JSREV_PROXY env chain: manifest userConfig → .mcp.json env → launch_server read → README doc
chain_ok = (
    "firefox_proxy" in a  # manifest userConfig (reuse check-A content)
    and '"JSREV_PROXY": "${user_config.firefox_proxy}"' in (ROOT / ".mcp.json").read_text(encoding="utf-8")
    and 'os.environ.get("JSREV_PROXY"' in (ROOT / "engines" / "firefox" / "launch_server.py").read_text(encoding="utf-8")
    and "firefox_proxy" in (ROOT / "README.md").read_text(encoding="utf-8")
)
check("I JSREV_PROXY config chain coherent", chain_ok, "manifest → .mcp.json → launch_server → README")

# J. engine-guide.md: every backticked snake_case token must be a real engine tool or known non-tool term
guide = (ROOT / "skills" / "jsrev" / "references" / "engine-guide.md").read_text(encoding="utf-8")
guide_allow = {
    "jsrev_chrome", "jsrev_firefox", "camoufox_fetch", "requirements_txt", "engine_trace_not_available",
    "pre_inject_hooks", "hot_keys", "__mcp_cookie_log", "__mcp_vmp_log", "__mcp_proxy_originals",
    "__mcp_jsvmp_installed", "document_title", "file_url", "allowedroots", "isolated", "browserurl",
    "log_file", "node", "python", "example_com", "navigator", "document", "window", "jsrev_home",
    "firefox_proxy", "en_us", "lang_c", "tools_list", "inputschema", "action", "list_changed",
    # parameter VALUES (enums) verified against live schemas:
    "xhr", "fetch", "crypto", "websocket", "debugger_bypass", "cookie", "runtime_probe",  # inject_hook_preset presets
    "install", "log", "stop", "reload", "status",  # instrumentation actions
    "get", "set", "delete", "reqid",  # cookies actions / chrome reqid
}
guide_tokens = {t for t in re.findall(r"`([a-z_][a-z0-9_]{2,40})`", guide)}
invented = sorted(t for t in guide_tokens if t not in CHROME_TOOLS and t not in FIREFOX_TOOLS and t not in guide_allow and t not in OLD_NAMES)
check("J engine-guide tool names all real", not invented, f"unrecognized: {invented}")

print()
if fails:
    print(f"CONSISTENCY AUDIT: {len(fails)} FAIL -> {fails}")
    sys.exit(1)
print("CONSISTENCY AUDIT: all checks passed")
