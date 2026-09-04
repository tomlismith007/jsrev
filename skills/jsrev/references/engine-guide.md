# 双引擎使用规范（Engine Guide）

> lineage：jsrev 融合项目 2026-08-30 新写。工具清单来自双引擎 schema 实测审计（chrome 24 / firefox 36，`node scripts/mcp-probe.mjs audit`）；关键参数经源码与实测双重确认（file:line 证据见 docs/knowledge-coverage.md 与各引擎源码）。**参数细节以 tools/list 返回的 inputSchema 为准**——探针命令：`node scripts/mcp-probe.mjs call <engine> <tool> '{}'`，缺参时引擎会列出必填项。

## 0. 一句话定位与不可替代性

| | jsrev-chrome | jsrev-firefox |
|---|---|---|
| 浏览器 | 系统 Chrome（真实指纹基线） | Camoufox（C++ 引擎层反指纹 Firefox） |
| 本质 | **调试器**：真断点 + 取证 | **观测仪器**：hook + 源码插桩 + 环境采集 |
| 不可替代 | 断点/单步/暂停态求值——firefox 无对应物 | 插桩/透明探针/环境采集——chrome 因零注入红线永远不会有 |
| 不可用后果 | 签名定位退化为纯源码阅读 + hook 盲猜 | 签名型目标失去安全观测路径；JSVMP 方法论无法执行 |

**结论：双引擎不是冗余，是能力互补的两半。** 日常取证可只用 firefox 承担（见 §1 决策表），但断点定位与插桩分别只有对方能做。

## 1. 路由决策表（先分型，再选引擎）

| 任务/场景 | 引擎 | 理由 |
|---|---|---|
| 看清"哪个请求带了什么参数" | chrome（优先） | 急切抓 body、initiator 追溯、reqid 详情 |
| 签名函数定位（要跟栈、看中间值） | chrome | 真断点 + 暂停态求值（verticals/debugger.md 十步配方） |
| 签名型目标（RS/AK）的运行时观测 | firefox | 只允许 transparent 探针或源码插桩（chrome 引擎做观测会注入 JS，违反红线） |
| JSVMP 保护的目标 | firefox | hook_jsvmp_interpreter 双模式 + instrumentation 源码级插桩 |
| 补环境/环境模拟 | firefox（采集）+ Node（还原） | compare_env 采集指纹 → knowledge/env-patch.md 补丁 → vm 沙箱验证 |
| Cookie 溯源（谁写的、何时写的） | firefox | analyze_cookie_sources 三源归因；chrome 侧用 Set-Cookie 时序（cookieName 参数） |
| 离线签名验证 | firefox | verify_signer_offline 字符级首偏差定位 |
| 请求拦截/改写实验 | firefox | intercept_request（chrome 无拦截工具） |
| WebSocket 帧取证 | chrome | get_websocket_messages（firefox 走 websocket_hook 预设，较弱） |
| 验证码协议分析 | 多数**无需引擎** | verticals/captcha/ 纯 Python 回归模板；需现场取证时按上两行选 |

**同一目标双引擎都要用时的标准节奏**：chrome 取证 → firefox 插桩 → 离线还原 → verify_signer_offline（见 §4 换手协议）。

## 2. chrome 引擎（jsrev-chrome）怎么用

### 2.1 启动与配置
- 插件内由 `.mcp.json` 以默认参数启动（persistent profile、禁 headless、真 Chrome 渠道）。
- 高级启动参数（`--isolated` 一次性 profile / `--browserUrl` 接管已开 Chrome / `--allowedRoots` 文件沙箱 / `--cloak` 源码级指纹补丁内核）**不在插件默认参数里**：需要时改 `.mcp.json` 的 args，或脱离插件手动运行 `node engines/chrome/build/src/index.js --help` 查看全部参数（engines/chrome/README.md 有完整说明）。
- `--allowedRoots` 一旦配置：本地文件读写被钉死在白名单内、符号链接逃逸被拒、`file:` 系页面被禁——做不可信站点时建议配置。

### 2.2 标准工作流
- **取证配方**：`list_network_requests`（列表，急切抓 body）→ `list_network_requests` + `reqid`（详情）→ `get_request_initiator`（发起栈）→ 不够回溯就 `break_on_xhr` 复现 → 进断点流程。
- **断点配方**：`list_scripts` / `search_in_sources` 定位 → `set_breakpoint_on_text` 下断 → `pause_or_resume` → `get_paused_info` → `step` → 暂停帧 `evaluate_script` → `save_script_source` 导出。十步完整版：verticals/debugger.md。
- **捕获懒激活（非回溯）**：CDP 域延迟激活是反检测设计——先 `new_page`/`navigate_page` 过风控，再刷新一次才能看到完整请求列表（knowledge/invariants.md §1.3）。
- **导航后立即求值会报 stale context 错**（JSHandles …created）——稍候重试即可（verticals/debugger.md §5，e2e 实测）。

### 2.3 能做（工具分组）
导航/页面：`navigate_page` `new_page` `select_page` `select_frame`；交互：`click_element` `take_screenshot`；求值：`evaluate_script`；源码：`list_scripts` `search_in_sources` `get_script_source` `save_script_source`；断点：`set_breakpoint_on_text` `break_on_xhr` `list_breakpoints` `remove_breakpoint` `pause_or_resume` `step` `get_paused_info`；网络：`list_network_requests`（reqid 详情）`clear_network_requests`；WS：`get_websocket_messages`；控制台：`list_console_messages`；站点数据：`clear_site_data`。

### 2.4 不能做（★ 明确禁令与空缺）
1. **禁止任何 JS 注入式反检测**——不给浏览器加 stealth 脚本、不 `addInitScript` 伪装 navigator。这是设计红线（knowledge/invariants.md §1.1）：JS patch 留三类可检痕迹，历史上 stealth 脚本已被删除且被实测检测。想要指纹隐身用 `--cloak`（源码层），不要写脚本。
2. **没有 hook/插桩/JSVMP 工具**——需要 hook 时换 firefox 引擎，不要在 chrome 里手写注入。
3. **headless 不可用**（硬禁，无此参数）——本引擎是给人看的视觉调试工具。
4. **没有请求拦截改写工具**——改写实验去 firefox。
5. **破坏性工具要 confirm**：`evaluate_script` / `click_element` / `clear_network_requests` / `clear_site_data` / `remove_breakpoint`——confirm=true 仅在用户明确授权该具体效果时使用。
6. **断点暂停被风控计时**——暂停期间动作要快、一次到位（§2.2 配方）。
7. `--cloak` 首次使用自动下载 ~200MB 二进制（显式行为，勿在无告知时启用）。

### 2.5 失效与降级
- build 缺失 → `cd engines/chrome && npm install && npm run build`（doctor 会给出）。
- Chrome 浏览器未安装/被占用 → 引擎启动失败，错误信息会说明；或用 `--browserUrl` 接管已有实例。
- 被目标风控标记（验证码循环/封禁页）→ 换 firefox 引擎以 Camoufox 指纹重试，或冷却后重来。

## 3. firefox 引擎（jsrev-firefox）怎么用

### 3.1 启动前置（缺一不可，doctor 会逐项检查）
1. pip 依赖：`pip install -r engines/firefox/requirements.txt`（mcp / camoufox[geoip] / playwright / esprima）；
2. 浏览器内核：`camoufox fetch`（~300MB 显式下载，下载可走代理但**运行不需要** clash）；
3. 可选代理：userConfig `firefox_proxy` → `JSREV_PROXY` → 引擎 `--proxy`（目标站需要时才配）；
4. locale 已由启动器自动清洗（`LANG=C` 环境免疫，GD-1.1）。
- 启动/关闭是显式生命周期：`launch_browser` → … → `close_browser`。关闭会清插桩路由；不关会留下浏览器进程。

### 3.2 hook 时序纪律（★ 本引擎最重要的规则）
- **探针必须先于导航注册**：SDK 在启动时用闭包捕获原生引用，导航后才装 hook 永远不触发且看起来"正常"。
- 两条正路：① `navigate(url, pre_inject_hooks=[预设名])` 导航前注入；② 先 `inject_hook_preset` / `hook_function`，再 `navigate`；已导航过 → 带插桩 `reload` 重来（knowledge/invariants.md §2.2/2.3）。
- 预设 7 种：`xhr` `fetch` `crypto` `websocket` `debugger_bypass` `cookie` `runtime_probe`。
- 结果收集：hook 输出走 `get_console_logs`；页面缓冲数组（`__mcp_*_log`）用 `evaluate_js` 读取。

### 3.3 插桩工作流（JSVMP/混淆目标的主力）
`instrumentation(action=…)` 四步：`install`（AST/regex 源码改写，重叠区间消解）→ 触发操作 → `log`（读 tap 日志，hot_keys 暴露环境指纹集）→ `stop`；改完源码要重载用 `reload`。AST 失败自动回退 regex；健康诊断与陷阱见 verticals/jsvmp.md。

### 3.4 JSVMP 双模式与签名型禁令
- `hook_jsvmp_interpreter` 两种模式：**proxy**（功能强，留 Proxy 对象 + `__mcp_*` 全局标记——**签名型目标禁用**）与 **transparent**（只换原型 getter，唯一残留是 getter 函数身份——签名型运行时观测首选）。
- 分不清目标类型时：按签名型处理（SKILL.md §2 三分法；宁可保守）。

### 3.5 能做（工具分组）
生命周期：`launch_browser` `close_browser` `reset_browser_state`；导航/交互：`navigate`（**支持 `pre_inject_hooks`**）`reload` `click` `type_text` `wait_for` `get_page_info` `take_snapshot` `take_screenshot`；求值：`evaluate_js`（吃**表达式**，不是函数——e2e 实测）；hook/插桩：`hook_function` `inject_hook_preset` `remove_hooks` `get_console_logs` `instrumentation` `hook_jsvmp_interpreter`；网络：`network_capture`（start/stop/read）`list_network_requests` `get_network_request` `get_request_initiator` `intercept_request`；存储/cookie：`cookies`（action=get/set/delete）`get_storage` `export_state` `import_state` `analyze_cookie_sources`；环境/验证：`compare_env` `check_environment` `verify_signer_offline`；引擎层追踪（需外部定制浏览器，缺失报 `engine_trace_not_available`）：`trace_property_access` `list_trace_files` `query_trace_file`。

### 3.6 不能做（★ 明确禁令与空缺）
1. **没有真断点**——需要断点/单步/暂停态求值时换 chrome 引擎，这是硬空缺不是配置问题。
2. **proxy 模式 hook 禁用于签名型目标**（会被 RS/AK 检测）——见 §3.4；行为型/纯混淆才可用。
3. **环境篡改默认禁用**——补环境只发生在离线 Node 沙箱（knowledge/env-patch.md），不是在浏览器里改。
4. **无本地文件沙箱**（chrome 引擎的 allowedRoots 机制本引擎没有）——注意 `evaluate_js` 的副作用边界。
5. `trace_property_access` 需要外部定制版浏览器，普通环境显式报错——这不是 bug，按提示装组件或改用源码级插桩。
6. **不可承诺 undetectable**——Camoufox 提高门槛不保证不可检测（合规红线 11）。

### 3.7 失效与降级
- 内核未下载 → launch 报错，`camoufox fetch` 解决；pip 缺依赖 → requirements.txt；
- 引擎整体不可用 → chrome-only 瘦身档（宿主 MCP 面板禁用 jsrev-firefox，零代码）；
- 浏览器残留进程 → 检查是否有未 `close_browser` 的会话。

## 4. 换手协议（双引擎协作的标准节奏）

```text
chrome 取证（§2.2 配方）→ 确认目标函数与输入构造
  → firefox 插桩（§3.3）或 transparent 观测（§3.4）→ 拿到算法行为证据
  → 离线还原（knowledge/crypto.md + env-patch.md）
  → verify_signer_offline 固定向量 parity（firefox）
  → fresh replay（chrome 或 firefox 重新走真实流程）
每次换引擎前：保存基线（页面状态/已捕获请求/hook 状态）→ 串行纪律（invariants.md §3）
```

## 5. 共同纪律（两引擎通用）
1. 同一时间只用一个浏览器工具家族持有 live target（invariants.md §3）；
2. 破坏性操作必经用户确认（chrome confirm 语义 / 任何改写类操作）；
3. 观测证据实时落 `tasks/<id>/`（network.jsonl / runtime-evidence.jsonl / fixtures）；
4. 不承诺 undetectable、不规避宿主安全策略（合规红线）；
5. 工具参数以 `tools/list` 的 inputSchema 为准——本文档与 tool-matrix 都不是参数的权威，schema 才是。

## 6. 引擎不可用降级矩阵

| 状态 | 可用路径 |
|---|---|
| 双引擎正常 | 全能力 |
| firefox 缺内核/依赖 | chrome-only 档（面板禁用 jsrev-firefox）；补环境用 CLI sandbox；验证用固定向量手工比 |
| chrome 未构建 | firefox-only；断点需求改用 firefox hook 定位 + 源码阅读 |
| 双引擎都不可用 | CLI（task/crypto/hookgen/sandbox/proof）+ 知识文档手工路径；不触发浏览器 |
| 目标被风控标记 | 换引擎指纹 / 冷却 / --cloak（chrome）——不做对抗性规避 |
