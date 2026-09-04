---
description: Initialize a jsrev evidence-workspace task directory (tasks/<name>/ with task.json, evidence files, report skeleton)
---

Initialize a new jsrev task workspace via the CLI, from the **session's project root** (evidence must land in the project's `js_reverse_cache/`, not the plugin cache):

```shell
node "<plugin-root>/cli/jsrev.mjs" task <name>            # root = $JSREV_HOME or ./js_reverse_cache/
node "<plugin-root>/cli/jsrev.mjs" task <name> --root <dir>   # explicit root
```

Task id: use $ARGUMENTS if provided, otherwise propose `YYYY-MM-DD-<short-slug>` from the current date and target domain.

The CLI creates `tasks/<name>/` containing task.json (status "recon"), empty network.jsonl / runtime-evidence.jsonl, handoff.json (mode/stage "recon"), fixtures/, and a six-section report.md skeleton — all matching the minimal schemas in the jsrev skill's `references/evidence-schemas.md`.

After creation:

1. Show the created tree.
2. Fill in `task.json` with the user's target URL and goal fields — ask if not obvious from $ARGUMENTS; never invent a target.
3. Remind the user of the Startup Gate: MODE / TOOLS / CLASS / DELIVERY / SUCCESS declarations happen at the start of the first working turn.
