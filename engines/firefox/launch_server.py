"""Launcher for the firefox engine (camoufox-reverse-mcp) inside the jsrev plugin.

Starts the vendored FastMCP server over stdio without requiring the package to
be pip-installed: only its dependencies (see requirements.txt) must be present
in the interpreter's environment.

Environment:
  JSREV_PROXY  optional HTTP proxy URL, forwarded to the engine as --proxy.
"""
import os
import pathlib
import re
import sys

# Camoufox fingerprints the browser locale and rejects invalid ones. Minimal
# shell environments often export LANG=C / C.UTF-8 / POSIX, whose language part
# ("C") is not a valid locale tag — sanitize before Camoufox reads the env.
def _sanitize_locale() -> None:
    def ok(value: str) -> bool:
        if not value:
            return False
        lang = value.split(".")[0].split("@")[0]
        return bool(re.fullmatch(r"[a-zA-Z]{2,3}(_[A-Za-z]{2,4})?", lang)) and lang.upper() not in {"C", "POSIX"}

    for var in ("LC_ALL", "LC_MESSAGES", "LANG"):
        value = os.environ.get(var, "")
        if var == "LC_ALL" and value:
            break  # LC_ALL wins; only fix it if invalid
        if value and not ok(value):
            os.environ[var] = "en_US.UTF-8"
        elif not value:
            os.environ.setdefault(var, "en_US.UTF-8")
    if not ok(os.environ.get("LANG", "")):
        os.environ["LANG"] = "en_US.UTF-8"


_sanitize_locale()

ENGINE_ROOT = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(ENGINE_ROOT / "src"))

try:
    # CRITICAL: import camoufox BEFORE the asyncio event loop starts.
    # Same rationale as camoufox_reverse_mcp.__main__: Playwright's sync
    # bootstrap deadlocks 60s+ if first imported inside a running loop.
    import camoufox  # noqa: F401
except ImportError as exc:
    sys.stderr.write(
        "[jsrev] firefox engine missing dependency: %s\n" % exc
        + '[jsrev] fix: pip install -r "%s"\n' % (ENGINE_ROOT / "requirements.txt")
        + "[jsrev] then fetch the browser binary: camoufox fetch\n"
    )
    raise SystemExit(1)

from camoufox_reverse_mcp.__main__ import main  # noqa: E402

proxy = os.environ.get("JSREV_PROXY", "").strip()
if proxy:
    sys.argv += ["--proxy", proxy]

main()
