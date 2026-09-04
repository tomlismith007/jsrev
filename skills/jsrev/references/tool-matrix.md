# tool-matrix（人读视图 + 旧名迁移表）

> 能力 → 双引擎工具映射。skill 层只引能力名，落到具体工具查本表。
> **维护方式（GB-1/GB-2 已落地）**：机器版 [tool-matrix.json](tool-matrix.json) 由 `node scripts/generate-tool-matrix.mjs` 从双 live server 实采生成（含每个工具的 description/required/properties）；`jsrev doctor` 每次运行都对撞 live 工具清单做**漂移检测**，不一致即 FAIL 并提示重新生成。引擎变更后重跑生成脚本；人工不得直接新增工具名。
> 引擎：**chrome** = `jsrev-chrome`（js-reverse-mcp v4.0.4，24 工具）；**firefox** = `jsrev-firefox`（camoufox-reverse-mcp v1.2.0 vendor，36 工具）。

## 能力矩阵

| 能力 | chrome 工具 | firefox 工具 | 备注 |
|---|---|---|---|
| 浏览器生命周期 | server 自管（attach 可用 `--browserUrl`） | `launch_browser` / `close_browser` / `reset_browser_state` | chrome 默认连接系统 Chrome，禁 headless |
| 页面导航/管理 | `navigate_page` / `new_page` / `select_page` / `select_frame` | `navigate`（**支持 `pre_inject_hooks` 参数**：导航前注入 hook 预设——RS/Akamai 首屏挑战的正规解法）/ `reload` / `get_page_info` / `take_snapshot` | |
| 页面交互 | `click_element` | `click` / `type_text` / `wait_for` | |
| 截图 | `take_screenshot` | `take_screenshot` | 同名不同 server，注意命名空间 |
| JS 执行 | `evaluate_script` | `evaluate_js` | 破坏性操作需 confirm 参数 |
| 网络捕获/取证 | `list_network_requests`（**无独立详情工具**：详情走本工具的 reqid 参数模式，急切抓 body）/ `clear_network_requests` | `network_capture`（action=start/stop/read）/ `list_network_requests` / `get_network_request` / `intercept_request`（请求拦截改写） | chrome 捕获懒激活非回溯（先导航再刷新）；firefox 需先 start |
| 请求发起追溯 | `get_request_initiator` + `break_on_xhr` | `get_request_initiator` | 非回溯性：需断点复现（chrome） |
| WebSocket | `get_websocket_messages` | —（经 `websocket_hook` 预设） | chrome 是 WS 取证主力 |
| 控制台 | `list_console_messages` | `get_console_logs` | |
| 源码枚举/搜索 | `list_scripts` / `get_script_source` / `search_in_sources` / `save_script_source` | `scripts` / `search_code` | v4.0.4：`search_in_sources` 对压缩单行 bundle 按出现次展开，`columnNumber` 可直接作 `get_script_source` 的 `offset` |
| **真断点调试** | `set_breakpoint_on_text` / `break_on_xhr` / `list_breakpoints` / `remove_breakpoint` / `pause_or_resume` / `step` / `get_paused_info` | —（无真断点，伪断点用 hook） | chrome 独有 |
| **Hook/插桩** | —（禁 JS 注入，见检测不变量） | `hook_function` / `inject_hook_preset`（xhr/fetch/crypto/websocket/debugger_bypass/cookie/runtime_probe）/ `remove_hooks` / `instrumentation`（action=install/log/stop/reload/status） | firefox 独有；签名型只用源码级插桩 |
| JSVMP | — | `hook_jsvmp_interpreter`（proxy/transparent 双模式）+ `instrumentation`（源码级） | firefox 独有 |
| 环境对比 | — | `compare_env` | 补环境对齐用 |
| 引擎层属性追踪 | — | `trace_property_access` / `list_trace_files` / `query_trace_file` | **需外部定制版浏览器**，缺失时报 `engine_trace_not_available` |
| Cookie/存储 | `clear_site_data` | `cookies` / `get_storage` / `export_state` / `import_state` / `analyze_cookie_sources` | firefox 三源 cookie 归因 |
| 离线签名验证 | — | `verify_signer_offline` | 字符级首偏差定位 |
| 环境自检 | — | `check_environment` | |

## 旧名迁移表（C 文档/案例 → 现名，机械过滤用）

| 旧名（v0.9 前及部分 v0.9 迁移表残留） | 现名 / 处置 |
|---|---|
| `trace_function` | `hook_function` |
| `start_network_capture` / `stop_network_capture` | `network_capture(action="start"/"stop")` |
| `get_cookies` | `cookies` |
| `list_scripts` | `scripts`（firefox） |
| `get_script_source` / `save_script` | `search_code` + `instrumentation`（源码读写并入插桩流） |
| `find_dispatch_loops` | 已删除 → `instrumentation(action="install")` 的 log 分析替代 |
| `instrument_jsvmp_source` | `instrumentation(action="install")` |
| `reload_with_hooks` | hook 后 `reload`（firefox） |
| `get_instrumentation_log` / `get_instrumentation_status` | `instrumentation(action="log"/"status")` |
| `stop_instrumentation` | `instrumentation(action="stop")` |
| `get_property_access_log` | `query_trace_file`（引擎层 trace） |
| `get_trace_data` | `query_trace_file` |
| `analyze_cookie_sources` | 同名（v1.x 起已注册，jsrev vendor 已激活） |
| `set_breakpoint_via_hook` / `get_breakpoint_data` / `get_fingerprint_info` / `check_detection` / `dump_jsvmp_strings` / `get_runtime_probe_log` / `bypass_debugger_trap` / `get_jsvmp_log` / `list_sessions` / `attach_domain_readonly` / `verify_assertion` 等 session/assertion 系 | **已删除，无对应物**（session 状态一律落证据工作区文件层；断点用 chrome 引擎真断点） |

> 案例迁移时按此表机械替换；标"已删除"的直接改写为现工作流描述，不得保留对不存在工具的调用描述。
