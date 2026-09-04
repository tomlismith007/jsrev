# 融合插件蓝图：基于 example-plugin 模版的详细分析

> 审查日期：2026-08-30 · 前置文档：[fusion-analysis.md](fusion-analysis.md)（四项目评估）、[fusion-plan.md](fusion-plan.md)（缺口规划）
> 本文新增：① 对四项目的**代码级复核**（修正前两文档的事实偏差）；② zcode 最小插件模版（example-plugin 0.2.0）的**能力面解剖**；③ 融合架构与模版能力的**逐项映射**——哪些缺口被模版直接消掉、哪些仍在、最终插件长什么样。

---

## 1. 四项目复核结论（对前两文档的修订）

四个项目全部完成独立深查（每个项目一份带 file:line 证据的报告）。总体判断与 fusion-analysis.md 一致：**互补性远大于重叠，融合成立**。以下只列**修订与新发现**，已验证成立的结论不再重复。

### 1.1 事实修订表

| # | 原文档说法 | 复核结果 | 影响 |
|---|---|---|---|
| 1 | A（camoufox）约 30 个工具 | **实测 35 个注册**（36 个 `@mcp.tool()` 定义，`analyze_cookie_sources` 因 `server.py:27-37` 未导入该模块而休眠） | 融合时一行 import 即可激活 cookie 三源归因工具，或删除；README 内部另有 "32" 陈旧文案（README.md:353、README_en.md:251） |
| 2 | A 是 MIT | pyproject 声明 MIT 但**仓库无 LICENSE 文件** | GE-2/GE-3 范围扩大：A 也要补许可证正文 |
| 3 | C（hello）"3 个零依赖脚本" | 实为 3 个 Node 脚本 + 1 个 bash（check-deps.sh）；另有 **templates/ 5 个项目模板 1,613 行**未被计入；references 实测 7,668 行非 7.4k | 资产清单修正：templates/ 是可平移资产 |
| 4 | C 的漂移是 v0.9.0 前旧工具名 | **漂移有三层**：v0.9 前旧名 → v0.9 迁移表自身也列了 10+ 个 v1.x 已删除工具（mcp-tool-reference.md:219-244）→ SKILL.md L511 仍引用不存在的 `get_jsvmp_log`；真实工具数 36 vs 声称 35 差 1 | "根治漂移"必须以 live server 采集为准，人工修文档修不完三层 |
| 5 | D（trace）"4 篇引用外部案例文件" | 实为 5 处 + CSDN 文档硬编码**小写**盘符路径 `e:\ai_project\csdn文字点选`（csdn doc:10）；另有 `gt4_word_pure.py:437` 硬编码 `C:\Windows\Fonts\msyh.ttc` | 清洗清单需含脚本内路径，正则要兼容小写盘符 |
| 6 | D 的知识量 ≈135KB | 实测 ≈147KB（13 核心 25.1KB + 10 captcha 122KB） | 无实质影响 |
| 7 | —（原文档未发现） | **D 的 2 个 GT4 脚本开箱不可运行**：gt4_replay.py / gt4_winlinze_replay.py 经 `subprocess.run(["node", helper])` 调用包内不存在的 .js helper；gt4_word_pure.py 依赖 **cv2 + scipy** 未声明 | captcha 模块清洗项增加：helper 找回或降级说明、依赖声明补 cv2/scipy |
| 8 | —（原文档未发现） | **C 存在合规实锤**：git 提交 02e30c0（2026-04-21）提交信息即 "docs: update one-click install prompt to avoid LLM safety filter"；SKILL.md L104/L107 是"预先取消模型安全判断"的强话术 | 红线 9 从"疑似意图"升级为"有 commit 证据"——融合版授权段必须重写，且**原话术一个字都不能带进来** |
| 9 | —（原文档未发现） | **D 的证据工作区约定有空洞**：task.json / network.jsonl / runtime-evidence.jsonl 只在 SKILL.md:103-105 出现文件名，无任何 schema（handoff.json 有 schema 在 workflow.md:37-54） | GB-4 落地时需补这三个文件的最小 schema |
| 10 | —（原文档未发现） | B 的 `docs:check` 只防 tool-reference.md 与 README 工具数，**不防** anti-detection-work.md 中的行号引用（已漂移 5 处）；McpContext.ts:120 有 addInitScript 陈旧注释（零 JS 注入原则的源码级漂移） | 借鉴 B 的 generate-docs 机制时要把覆盖面说清 |
| 11 | —（原文档未发现） | B 的 routing eval 实为 **30 条**（expectedToolCount=24 硬校验）；B 是 zhizhuodemao/js-reverse-mcp 的干净 git clone（origin 可查，v4.0.3 = dad4a00） | D1 决策门的前提（第三方属性）获得 git 级证据；30 条评测结构可整体复用 |
| 12 | A 的 `trace_property_access` 依赖外部定制浏览器 | 确认，且更精确：无 `~/.cache/camoufox-reverse/control/control-*.cmd` 时显式报 `engine_trace_not_available`，文件协议（control/*.cmd → C++ 写 JSONL → Python 聚合四视图） | 在统一工具矩阵中标注"需外部组件"，不由融合项目分发 |

### 1.2 各项目一句话定级（复核后不变，补充依据）

- **A（camoufox-reverse-mcp）v1.2.0**：35 工具的 Firefox 反指纹观测仪器。可复用核心 = `utils/ast_rewriter.py`+`js_rewriter.py`（578 行，零 MCP 耦合，含重叠区间消解与 source-site 内容寻址）、13 个 hooks/*.js（4 层 JSVMP 探针 + 透明探针）、`camou_config.py`（Windows 分块修复，纯函数）、`schema_compat.py`（Kimi 严格校验兼容——多宿主场景意外有用）。应丢弃 = JSVMP_PLAYBOOK.md（全篇旧工具名 + 引用未注册工具）、deprecation.py（死代码）、fingerprint.py（空壳）、property_access_hook.js（孤儿）。
- **B（js-reverse-mcp）v4.0.3**：24 工具的 Chromium 调试器，工程化天花板（信封 + 11 错误码 + Mutex/SingleFlight + CdpSessionProvider + 988 行字节预算 NetworkCollector + 1174 行 DebuggerContext + LocalFileAccess 沙箱 + 脱敏日志 + 30 条路由评测 + generate-docs --check）。**第三方项目（Apache-2.0，Google LLC header 逐文件），D1 决策门不变**。
- **C（hello_js_reverse_skill）v3.4.1**：资产 = 四案例（踩坑表/禁动清单/UA 分支矩阵）、jsdom-env-patches.md（915 行）、JSVMP 双路径 + 源码插桩盲区分析、crypto-patterns.md（双语言 424 行）、22 条经验法则骨架。负债 = 三层文档漂移 + 62KB 过重 SKILL.md + 合规实锤。**漂移是结构性的（人工修不完），根治靠 B 的 live-server 文档一致性校验**。
- **D（trace）**：资产 = 全组唯一验收契约层（Startup Gate / Core Loop 五级阶梯 / Evidence Contract / Completion Contract / 10 条三段式反模式 / Proof Manifest / 固定向量 schema）+ captcha 垂直域（11 家族路由 + 10 profile，GT4 8 种 risk_type）+ 15 条触发评测。负债 = iv8 双层悬空、路径错误 20+ 处、外部引用清洗、依赖未声明。

### 1.3 共同点（复核后维持六条，措辞收紧）

1. **同一使命**：把受保护 Web 目标还原为 browser-free 可重复协议工作流；浏览器是证据源不是交付物。
2. **同一反爬分类学**：签名型（禁 Proxy hook、禁环境篡改、只许源码级插桩）/ 行为型 / 纯混淆——C 三分法、A README 决策表、D CLASS 声明互相印证。
3. **同一工作流骨架**：侦察 → 定位 → 插桩 → 理解 → 离线还原 → 固定向量验证。
4. **同一架构共识**：状态不属于 MCP，属于文件层（A 删过 11 个 session 工具并有反向断言测试；D 形式化为 Evidence Contract）。
5. **同一工程痛点**：工具数量与描述质量决定 agent 路由质量（A 80→35 裁剪、B 30 条路由评测锁描述、C 漂移是反例）。
6. **知识资产重叠**：crypto ×2、env-patch ×3、hook 模板 ×4 处——可合并为单一来源。

---

## 2. example-plugin 模版解剖（能力面清单）

模版 0.2.0 共 11 个文件 57KB。它不是"玩具"，而是 zcode 插件系统的**完整能力面样本**：

| 能力 | 模版实现 | 对融合项目的意义 |
|---|---|---|
| **双宿主 manifest** | `.zcode-plugin/plugin.json`（首选）+ `.claude-plugin/plugin.json`（内容相同的兼容镜像） | **ZCode + Claude Code 双宿主开箱即用**，fusion-plan GA-2 的五宿主清单在这两个宿主上零成本成立 |
| **MCP 多 server 声明** | 根 `.mcp.json`：`stdio`/`http`/`sse` 三种类型，每 server 独立 `enabled` 开关 + `timeoutMs` | 双引擎（chrome/firefox）可作为两个 stdio server 并列声明；`enabled` 字段就是"瘦身档"的实现机制 |
| **插件根变量** | args/env 中可用 `${ZCODE_PLUGIN_ROOT}`（兼容注入 `CLAUDE_PLUGIN_ROOT`） | vendor 进插件包的引擎可以从插件根启动，无需用户写绝对路径 |
| **用户配置** | manifest `userConfig`：typed 字段（string），`sensitive: true` 标记密钥，引用语法 `${user_config.*}`，注入 env 或 headers | `JSREV_HOME`（证据工作区根）、python 路径、proxy 等有了标准化的配置通道 |
| **命名空间隔离** | "ZCode namespaces plugin MCP keys automatically"；skill 名 = `插件名:技能名` | 双 server 同名类工具（navigate/evaluate）与旧装 hello skill 的冲突被系统层缓解 |
| **Hooks 自动加载** | `hooks/hooks.json` 免声明自动加载（勿在 manifest 重复指向）；SessionStart/PreToolUse 等，`type:"process"` + node 跨平台，`statusMessage`、`timeoutMs` | **SessionStart = doctor-lite 的天然挂点**（注入 additionalContext 报告环境状态） |
| **Slash commands** | `commands/*.md`，frontmatter description + `$ARGUMENTS` | `/jsrev:doctor`、`/jsrev:task` 等入口 |
| **Subagents** | `agents/*.md`（可选） | v1 不用（红线 5：不加功能） |
| **长命数据目录** | README 明示 `ZCODE_PLUGIN_DATA`，"never write back into install root" | 插件级缓存/日志的合法去处（注意：**不是**任务证据工作区的默认根，见 §4.5） |
| **市场发布链** | README checklist：name=目录名 kebab-case 唯一、`description_i18n` 双语、README.md+README_CN.md 必备、根 `marketplace.json` 注册、版本同步、`scripts/validate.py` + `build_dist.py` 校验构建 | 发布流程有官方路径，fusion-plan T5 的"插件市场渠道"具体化 |
| **Hooks 快照语义** | "plugin hooks are snapshotted when a session starts"——改 hooks 后要新开会话 | 开发期文档要写清，避免"改了没生效"的困惑 |

**模版没有的能力**（明确边界）：不能安装 pip/npm 依赖、不能下载浏览器内核、不能跨宿主分发（Cursor/Codex 等不认这个格式）、没有 skill 触发评测机制（D 的 evals 是自建约定）、userConfig 类型实测只见 string（boolean 待验证）。

---

## 3. 映射分析：fusion-plan 缺口 × 模版能力

把 fusion-plan §1 的缺口登记表逐项对着模版过一遍，**缺口格局发生实质变化**：

### 3.1 被模版直接消掉或大幅收缩的缺口

| Gap | 原方案 | 模版带来的变化 |
|---|---|---|
| **GA-2 宿主适配清单**（★★★） | 每宿主手写 manifest（ponytail 模式） | ZCode + Claude Code 由模版双 manifest 直接覆盖（Tier-1 五宿主消掉 2 个）；剩余 Cursor/Codex/OpenCode 仍需 CLI 生成 |
| **GA-3 `jsrev install`**（★★★） | 统一 CLI 安装器 | 在 zcode/claude 上 install 整个不存在了——启用插件即安装。CLI 的 install 降级为**Tier-2 宿主专用**；doctor 降级为 SessionStart hook + `/jsrev:doctor` command |
| **GA-5 发布流水线**（★★） | 自建 npm/PyPI/marketplace 提交 | zcode 市场有官方 validate/build 脚本与 checklist；Claude Code 用同一 payload。npm/PyPI 渠道保留但优先级降后 |
| **GB-4 证据工作区接入**（★★） | `JSREV_HOME` env 约定 | userConfig `jsrev_home` → `${user_config.jsrev_home}` 注入双 server env，**用户可视化配置**，无需改 shell profile |
| **GB-5 双 server 共存路由**（★★） | server instructions 分工 + 瘦身档 | `.mcp.json` 的 per-server `enabled` 字段 + 宿主 MCP 设置面板（"plugin-bundled" 可视化）给瘦身档一个**零代码开关**；instructions 分工照旧 |
| **GE-4 旧安装退役**（★） | install 检测旧副本 | 插件命名空间（`jsrev:jsrev`）与旧 `hello_js_reverse_skill` 不冲突注册，但**触发竞争仍在**（两者 description 都含 JS 逆向触发词）——退役提示仍要写进 README 与 SessionStart 注入文案 |

### 3.2 模版解决不了、维持原方案的缺口

| Gap | 疼级 | 维持原方案 |
|---|---|---|
| GA-1 monorepo 骨架 | ★★★ | 模版只管插件载荷结构，monorepo 里 engines/cli/evals 的分层照 fusion-plan §3.2 M2 |
| GA-4 浏览器内核安装 | ★★★ | 插件不能下载几百 MB 内核；doctor hook 检测 + 指引 `camoufox fetch` / Chrome 渠道 |
| GB-1 中性工具矩阵 | ★★★ | 纯设计工作，与模版无关 |
| GB-2 能力清单协议 | ★★★ | doctor 对双 server 做 tools/list 握手校验，非模版能力 |
| GB-3 信封/错误码统一 | ★★ | A 对齐 B 的 ToolError/信封，代码工作 |
| GC-1~7 知识层全部 | ★★~★★★ | SKILL.md 瘦身 ≤300 行、知识合并、检测不变量总纲、captcha 清洗、触发评测扩容、授权话术重写——全在 skills/ 目录内容里，模版只提供容器 |
| GD-1~4 引擎层修复 | ★~★★ | 实例化、日志、Windows CI——代码工作 |

### 3.3 结论：融合项目的重心转移

原 fusion-plan 把「CLI（`jsrev install`/`doctor`）」当作分发核心（GA-3 ★★★）。模版分析之后，**重心应改为：插件载荷本身 = 分发**。

- **ZCode / Claude Code**（本机可验证的两个宿主）：模版原生承载，一条命令都不需要。
- **其余宿主**：CLI 降级为「配置生成器」——`jsrev install cursor|codex|opencode` 只写 mcp 配置 + 拷 skills，复杂度比原方案低一个量级。
- CLI 的不可替代职责收缩为：Tier-2 宿主配置生成、`task` 证据工作区脚手架、`crypto identify|diff`、`hook gen`。

---

## 4. 融合插件的具体设计（基于模版逐文件落位）

### 4.1 monorepo 总布局（模版目录 = 插件载荷根）

```
jsrev/                                  # monorepo 根（git）
├── .zcode-plugin/plugin.json           # ← 模版要求：首选 manifest
├── .claude-plugin/plugin.json          # ← 内容相同的 Claude Code 镜像
├── .mcp.json                           # ← 双引擎 server 声明（见 4.3）
├── hooks/
│   ├── hooks.json                      # ← 自动加载（manifest 里勿重复指向）
│   └── session-start.mjs               # ← doctor-lite：探测 node/python/双内核，注入 additionalContext
├── commands/
│   ├── doctor.md                       # /jsrev:doctor：跑完整体检（调 CLI）
│   └── task.md                         # /jsrev:task：证据工作区脚手架（调 CLI）
├── skills/
│   └── jsrev/
│       ├── SKILL.md                    # ≤300 行路由器（D 骨架 + C 方法论下沉）
│       ├── references/                 # 按需加载：phases / invariants / tool-matrix
│       ├── knowledge/                  # C+D 合并：crypto / env-patch / hooks / obfuscation
│       ├── verticals/                  # jsvmp（C）/ captcha（D 清洗后）/ debugger（新写，素材=B）
│       └── cases/                      # C 案例库 + D captcha 实战
├── engines/
│   ├── chrome/                         # B：vendor 快照或 npm 依赖（D1 决策）
│   └── firefox/                        # A：Python 包，pip 安装或 uvx 运行
├── cli/                                # jsrev CLI（Node）：Tier-2 install / task / crypto / hook-gen
├── evals/                              # 触发评测（D 15 条扩容）+ 工具路由评测（B 30 条结构）+ 文档一致性
├── assets/hooks/                       # 引擎无关 JS 模板（A 的 13 个上移，C 脚本产物对齐）
├── marketplace.json                    # zcode 市场注册（若提交官方市场）
├── README.md / README_CN.md            # 模版 checklist 必备
└── scripts/validate.py                 # 模版校验脚本接入
```

要点：**模版的目录约定即插件载荷结构**，monorepo 的其余目录（engines/cli/evals）通过 `.mcp.json` 与 commands 引用进载荷；`skills/`、`hooks/`、`commands/`、`.mcp.json`、双 manifest 全部按模版标准路径放置，manifest 无需显式声明组件字段（模版明示标准路径免声明）。

### 4.2 manifest 草案（.zcode-plugin/plugin.json）

```json
{
  "name": "jsrev",
  "description": "JS reverse engineering toolkit for coding agents: dual-engine browser MCP (Chromium debugger + Camoufox instrumentation), progressive-disclosure skills, evidence workspace contract.",
  "description_i18n": {
    "en": "JS reverse engineering toolkit: dual-engine MCP, skills, evidence workspace contract. Authorized targets only.",
    "zh-CN": "JS 逆向工具包：双引擎 MCP（Chromium 调试器 + Camoufox 插桩）、渐进披露技能、证据工作区契约。仅限授权目标。"
  },
  "version": "0.1.0",
  "author": { "name": "<owner>" },
  "keywords": ["js-reverse", "mcp", "anti-detection", "jsvmp", "captcha"],
  "userConfig": {
    "jsrev_home": {
      "title": "Evidence workspace root",
      "description": "Root dir for tasks/<id>/ evidence artifacts. Empty = per-project ./js_reverse_cache/",
      "type": "string",
      "default": ""
    },
    "python_path": {
      "title": "Python interpreter",
      "description": "Interpreter used to launch the firefox engine (camoufox-reverse-mcp).",
      "type": "string",
      "default": "python"
    },
    "proxy": {
      "title": "Proxy for firefox engine",
      "description": "Optional HTTP proxy passed to the Camoufox engine.",
      "type": "string",
      "default": "",
      "required": false
    }
  }
}
```

- `name: jsrev` 满足 kebab-case + 与目录同名；skill 命名空间为 `jsrev:jsrev`。
- userConfig 类型按模版实测只写 string；`sensitive: true` 如未来需要放 API key。
- **双 manifest 同步**是模版 checklist 第 2 条的硬要求（建议 CI 里 diff 校验）。

### 4.3 .mcp.json 草案（双引擎 + 瘦身档机制）

```json
{
  "mcpServers": {
    "jsrev-chrome": {
      "type": "stdio",
      "command": "node",
      "args": ["${ZCODE_PLUGIN_ROOT}/engines/chrome/build/src/index.js"],
      "env": { "JSREV_HOME": "${user_config.jsrev_home}" },
      "enabled": true,
      "timeoutMs": 30000
    },
    "jsrev-firefox": {
      "type": "stdio",
      "command": "${user_config.python_path}",
      "args": ["-m", "camoufox_reverse_mcp"],
      "env": {
        "JSREV_HOME": "${user_config.jsrev_home}",
        "JSREV_PROXY": "${user_config.proxy}"
      },
      "enabled": true,
      "timeoutMs": 30000
    }
  }
}
```

设计含义：
- **D1 决策（B 的处置）在模版语境下有了新倾向**：`args` 直接指 `engines/chrome/build/src/index.js` 意味着 **vendor 快照进插件包**（自包含、离线可用、版本锁定），比 npm 依赖（要求用户机器联网 npx、版本漂移）更适合市场分发。代价是承担上游同步——维持 D1-c 的"先 npm 后 vendor"可以反转：**若主分发渠道定为 zcode/claude 市场，直接 vendor（保留 Apache-2.0 LICENSE/NOTICE 与 Google header）**。这是对原 D1 推荐的一个修订建议。
- **firefox 引擎的启动前提**（pip 包 + camoufox 内核）由 SessionStart hook 检测并在 additionalContext 里告知缺什么；server 本身 `enabled: true` 但启动失败会被宿主显示为 plugin-bundled MCP 异常——doctor 文案要覆盖这种状态的解读。
- `JSREV_HOME` 空串默认 = server 侧回退到项目内 `./js_reverse_cache/`（维持 D5 决策：项目内默认，env 覆盖）。

### 4.4 hooks 设计（唯一的 v1 hook：SessionStart doctor-lite）

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|clear|compact",
      "hooks": [{
        "type": "process", "command": "node",
        "args": ["${ZCODE_PLUGIN_ROOT}/hooks/session-start.mjs"],
        "timeoutMs": 5000,
        "statusMessage": "jsrev: checking engines…"
      }]
    }]
  }
}
```

`session-start.mjs` 职责（对标 C 的 CHECK-1 与 A 的 check_environment，但只做**毫秒级二进制探测**，不做 MCP 握手——5s 预算内完不成）：
1. `node -v`、`python -V`（用 userConfig 的 python_path 语义需 manifest 透传，v1 可先探测 PATH）、Chrome 渠道存在性、`camoufox` CLI 存在性。
2. 输出 additionalContext：一两行引擎可用性 + 缺失项的**可执行修复指引**（如 `camoufox fetch`）。
3. 任何探测失败都静默降级（stdout 仍输出合法 JSON），不阻塞会话——这是模版 README 的 stdout 纪律。

明确**不做**的 hook：PreToolUse 拦截/注入（红线 5：不加功能；且 hooks 快照语义使其排障成本高）。

### 4.5 证据工作区与 ZCODE_PLUGIN_DATA 的边界

- **任务证据**（tasks/<id>/）→ 默认**项目内** `./js_reverse_cache/`（D5 决策不变：与逆向项目工作目录天然对齐，跨宿主可迁移），userConfig `jsrev_home` 可整体改根。
- **插件自身长命数据**（doctor 缓存、日志）→ `ZCODE_PLUGIN_DATA`（模版规定，绝不写回安装根）。
- 两者语义不同，README 要分开写；task.json/network.jsonl/runtime-evidence.jsonl 补最小 schema（§1.1 修订 #9）。

### 4.6 skills 层落位（GC 系列缺口的容器）

- 主 SKILL.md ≤300 行硬预算：D 的 Startup Gate（五项前置声明）+ Core Loop 五级阶梯 + 反爬三分法路由 + Completion Contract；C 的 CHECK 复述保留但去 MCP 绑定；**授权段中性重写**（"user must ensure authorization；refuse credential-stuffing / account-takeover / bulk-registration"），C 原话术与那句 commit 意图（§1.1 修订 #8）零带入。
- `references/tool-matrix.md` 由脚本从双 live server 采集生成（B 的 generate-docs 机制推广），skill 正文只出现**中性能力名**。
- captcha 域清洗清单在 §1.1 修订 #5/#7 基础上执行；iv8 档位由 A 的 instrumentation/evaluate 承载或降级标注。
- 触发评测放 `evals/`，CI 跑（模版无此机制，自建——D 的 15 条 JSON 结构平移）。

### 4.7 commands 层

- `/jsrev:doctor`：完整体检（调 CLI doctor：node/python 版本、双内核、pip 依赖、双 MCP 握手 tools/list 与 tool-matrix 版本比对——GB-2 的落点）。
- `/jsrev:task <name>`：初始化 `tasks/<name>/` 骨架（task.json 最小 schema + report.md 模板），把 D 的 Evidence Contract 变成一条命令。

### 4.8 宿主矩阵（修订版）

| 宿主 | 承载方式 | 依赖模版吗 |
|---|---|---|
| **ZCode** | 双 manifest + .mcp.json + skills + hooks + commands（完整能力） | ✅ 直接 |
| **Claude Code** | `.claude-plugin/plugin.json` 镜像 + `CLAUDE_PLUGIN_ROOT` 兼容注入 | ✅ 直接（模版自带） |
| Cursor / Codex / OpenCode | `jsrev install <host>` 写 mcp 配置 + 拷 skills 目录（D 的 compatibility 字段先例） | ❌ CLI 通道 |
| Windsurf / Cline / Gemini CLI | mcp 配置 + AGENTS.md/规则片段 | ❌ CLI 通道 |
| 任意 agent | CLI（task/crypto/hook-gen）+ 知识即 markdown | ❌ 降级通道 |

---

## 5. 对 fusion-plan 决策门与里程碑的修订

| 决策 | 原推荐 | 修订 | 理由 |
|---|---|---|---|
| D1 B 的处置 | c：先 npm 依赖后 vendor | **若主渠道 = zcode/claude 市场，直接 vendor**（快照 tag + LICENSE/NOTICE 保留）；npm 依赖仅作 Tier-2 通道的备选 | 模版的 `${ZCODE_PLUGIN_ROOT}` + 市场分发要求载荷自包含；用户机器只需 node，不需联网拉包 |
| D4 宿主优先级 | ZCode 或 Claude Code 二选一 | **两个同时做**（同一 payload 双 manifest），切片验收在两宿主各跑一遍 | 模版让双宿主边际成本≈0 |
| M2 垂直切片 | monorepo + install + doctor 最小版 | 改为：**先落插件载荷**（manifest/.mcp.json/skills/hooks/commands 双宿主实测触发），CLI 砍到只剩 task 脚手架；install 推迟到 M4 | 避免在模版已解决的问题上重复造轮子 |
| M0 新增项 | — | A 补 LICENSE 正文；C 授权段重写列为 M1 **第一项**（合规实锤在案）；B 的 vendor 快照 tag 在 M0 打 | §1.1 修订 #2/#8/#11 |
| 红线新增 | — | **16. 不把 hooks 当功能扩展点**（v1 仅 SessionStart doctor-lite）；**17. 长命数据写 ZCODE_PLUGIN_DATA，任务证据写项目内 js_reverse_cache，两者不混** | 模版语义 + 最小改动原则 |

## 6. 风险增量（相对 fusion-plan §6 新增两条）

- **R9 插件载荷体积**：vendor B（13.2k 行 src + build 产物）+ A + 147KB 知识 + 案例，载荷可能到数十 MB。缓解：build 产物入包但 tests/evals/docs 留 monorepo 不进载荷；模版 validate.py 可加体积预算。
- **R10 双 manifest 漂移**：.zcode-plugin 与 .claude-plugin 内容要求同步，人肉维护必漂。缓解：CI 加一致性 diff（模板 checklist 第 2 条的自动化）。

## 7. 下一步（最小可执行序列）

1. M0：拍板 D1（建议 vendor）与品牌名；A 补 LICENSE；trace 推远端；打 B 快照 tag。
2. M1：C 授权段重写 + 三层漂移以「live server 采集生成 tool-matrix」为根治手段（不人工修 18 篇）；D 清洗清单（§1.1 #5/#7/#9）。
3. M2：按 §4.1–4.4 落插件载荷，ZCode + Claude Code 双宿主实测 T1（一次安装）+ T2（正确触发）；SessionStart doctor-lite 上线。
4. M3+：按 fusion-plan 原里程碑继续（契约层、知识合并、Tier-2 CLI、发布收口）。
