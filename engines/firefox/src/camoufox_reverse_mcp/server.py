from mcp.server.fastmcp import FastMCP
from .browser import BrowserManager
from .schema_compat import normalize_tool_schemas


class SchemaCompatibleFastMCP(FastMCP):
    """FastMCP server that normalizes advertised schemas before every listing."""

    async def list_tools(self):
        # Re-run here so tools registered after module import receive the same
        # compatibility treatment. The rewrite is intentionally idempotent.
        normalize_tool_schemas(self)
        return await super().list_tools()


mcp = SchemaCompatibleFastMCP(
    "jsrev-firefox",
    instructions="Anti-detection browser MCP server (firefox engine of the jsrev dual-engine toolkit) for JavaScript "
    "reverse engineering. Uses Camoufox (C++ engine-level fingerprint spoofing) while performing JS analysis, "
    "hooking, source-level instrumentation, and JSVMP bytecode analysis. "
    "Routing division in dual-engine setups: signature-class/JSVMP observation, hooking, instrumentation, "
    "environment fingerprinting, and cookie provenance belong HERE; true-breakpoint debugging and "
    "network/WebSocket forensics belong to the jsrev-chrome server. Never inject JS for anti-detection "
    "on either engine."
)

browser_manager = BrowserManager()

# v1.0.0: pure JS reverse-engineering toolkit (session/assertions removed)
from .tools import navigation      # noqa: E402, F401  — browser control + page interaction
from .tools import script_analysis  # noqa: E402, F401  — scripts() + search_code()
from .tools import debugging        # noqa: E402, F401  — evaluate_js
from .tools import hooking          # noqa: E402, F401  — hook_function + inject_hook_preset + remove_hooks
from .tools import network          # noqa: E402, F401  — network_capture + list/get requests
from .tools import storage          # noqa: E402, F401  — cookies() + get_storage + export/import state
from .tools import cookie_analysis    # noqa: E402, F401  — analyze_cookie_sources (three-source attribution)
from .tools import jsvmp            # noqa: E402, F401  — hook_jsvmp_interpreter + compare_env
from .tools import instrumentation  # noqa: E402, F401  — instrumentation(action=...)
from .tools import environment      # noqa: E402, F401  — check_environment
from .tools import verification     # noqa: E402, F401  — verify_signer_offline
from .tools import trace            # noqa: E402, F401  — trace_property_access + list/query

# Normalize eagerly for code that inspects FastMCP's manager directly. The
# list_tools override also covers tools registered later at runtime.
normalize_tool_schemas(mcp)
