# JS 逆向工具集融合分析报告

> 审查日期：2026-08-29 · 范围：`camoufox-reverse-mcp` / `js-reverse-mcp` / `hello_js_reverse_skill` / `trace`
> 目标：评估 4 个项目，找到共同点，为「融合为一个跨主流 coding agent 的插件（CLI + MCP + skills）」提供依据。

---

## 1. 四项目总览

| | camoufox-reverse-mcp | js-reverse-mcp | hello_js_reverse_skill | trace |
|---|---|---|---|---|
| **形态** | Python MCP server（stdio） | TypeScript MCP server（stdio） | 知识型 Skill | 知识型 Skill |
| **底层引擎** | Camoufox（反指纹 Firefox，Juggler/Playwright） | Chromium（自维护 Patchright fork，CDP） | —（依赖 camoufox MCP） | —（MCP 无关） |
| **版本 / 成熟度** | v1.2.0，高（实战驱动，CI + 回归测试纪律） | v4.0.3，很高（工程化最优：错误码、评测、文档自动生成） | v3.4.1，中高（知识深，但文档漂移严重） | 中（结构精，captcha 垂直域独有，但依赖悬空、路径错乱） |
| **规模** | src ≈6.3k 行 + tests 1.7k 行；30 个工具 | src ≈13.2k 行 + tests 3.6k 行；24 个工具 | SKILL.md 62KB/1359 行 + 18 篇 references（≈7.4k 行）+ 4 案例 + 3 个零依赖 Node 脚本 | SKILL.md 7.5KB + 13 篇核心 refs + 10 篇 captcha 实战（≈135KB）+ 3 个零依赖 Python 脚本 + 6 个 GT4 脚本 + 15 条触发评测 |
| **一句话** | 签名型反爬/JSVMP 的观测仪器（AST 源码级插桩 + 引擎层追踪） | 真·调试器型逆向工作台（断点/暂停求值/网络取证 + 反检测工程纪律） | 「怎么做」操作手册（Phase 工作流 + JSVMP 双路径 + 环境伪装 + 案例库） | 「做到什么程度才算完」验收契约（证据链/Proof Manifest/交付分级）+ 验证码垂直域 |

**关键互补关系（融合的正当性）**：
- 两个 MCP 在**能力空间上不重叠**：B（Chromium）有真断点、暂停态求值、网络/WS 取证、文件导出沙箱；A（Firefox）有 AST 源码级插桩、JSVMP 三层探针、引擎层属性追踪、环境指纹采集。同一目标往往需要两种引擎换着打。
- 两个 Skill 在**层次上互补**：C 是工具操作层（绑定 A 的工具名），D 是验收契约层（工具无关）+ captcha 垂直知识。D 的 `iv8-web-reverse` 悬空后端引用，恰好可以由 A/B 落地。

---

## 2. 共同点（融合的地基）

1. **同一使命**：把受保护的 Web 目标还原为 **browser-free 的可重复协议工作流**（纯 Python/Node 复现签名/验证码/风控参数）。四个项目全部明确「浏览器只是证据源，不是交付物」。
2. **同一反爬分类学**：签名型（RS/Akamai，禁 Proxy hook、禁环境篡改，只允许源码级插桩）/ 行为型 / 纯混淆。C 的三分法、A 的 README 决策表、D 的 CLASS 声明互相印证。
3. **同一工作流骨架**：侦察 → 定位 → Hook/插桩 → 理解 → 离线还原 → 验证（固定向量 parity / fresh replay）。A 的场景 1-4、C 的 Phase 0-5、D 的 Phase 1-5 是同一件事的三种写法。
4. **同一历史教训**：**Session/断言/记忆管理不属于 MCP，属于 Skill/文件层**。A 在 v1.0.0 砍掉 11 个 session/assertion 工具；D 把它形式化为磁盘上的 Evidence Contract（`js_reverse_cache/tasks/<id>/`）。这是融合时最重要的架构共识。
5. **同一工程痛点**：工具数量与描述质量决定 agent 路由质量。A 从 80 个工具裁到 30；B 用 routing eval 把工具描述当被测资产锁住。C 的文档漂移（新旧工具名混用）正是缺少这种自动校验的后果。
6. **知识资产重叠**：`crypto-patterns`（C、D 各一份）、环境补丁（C 两篇 + D 一篇）、页面 Hook 模板（C 两处 + D 三段 IIFE）——可合并为共享知识库。

---

## 3. 能力重叠与去重矩阵

| 知识/能力 | C (hello) | D (trace) | A (camoufox MCP) | B (js-reverse MCP) | 融合处置 |
|---|---|---|---|---|---|
| 加密模式速查 | `crypto-patterns.md`（424 行，双语言实现）+ `crypto-identifier.js` | `crypto-patterns.md`（2.7KB，指纹+魔改 diff+JS→Python 陷阱）+ `crypto_fingerprint.py` | `verify_signer_offline` 工具 | — | **合并为一篇**：C 版为主体（实现全），D 版的魔改摘要 diff 顺序、固定输入循环并入；两个识别脚本合并为一个 CLI 子命令 |
| 环境补丁 | `environment-patch.md` + `jsdom-env-patches.md`（915 行，最深）+ `compare_env` 采集流程 | `env-patch.md`（最小补丁哲学、vm 沙箱警告） | `compare_env` 工具（采集端） | — | **合并为分级补丁库**：采集（A 工具）→ diff → 分级补丁（C 知识）→ 验证；D 的「只补被读字段」原则作为总纲 |
| 页面 Hook 模板 | `hook-techniques.md`（13 种）+ `hook-generator.js`（10 种，**与文档互相矛盾的 cookie 写法**） | `browser-hook.md`（3 段粘贴式 IIFE） | `hooks/*.js` 13 个模板 + 7 个预设（工程资产） | — | **收敛为一套 `assets/hooks/`**：A 的 JS 模板是工程实现，C 的文档是使用说明，D 的 IIFE 是最小教学版；hook-generator.js 降级为从同一模板源生成 |
| 混淆/AST 还原 | `obfuscation-guide.md` + JSVMP 两篇（深一个量级） | `ast-deobfuscation.md`（1.6KB，边界+失败模式表） | `utils/ast_rewriter.py`（esprima 实现） | — | D 的「适用边界/失败模式表」作为 C 深度文档的导读；A 的实现是唯一运行时 |
| 反模式/行为治理 | CHECK 强制复述 + 四条红线 + `common-pitfalls.md`（6 条，含 AI 辩护驳斥） | `anti-patterns.md`（10 条三段式）+ Startup Gate + Completion Contract | — | server instructions 路由引导 | **保留两层**：技术反模式（C/D 合并去重）+ 行为契约（D 的 Gate/Contract 作为统一验收层） |
| Cookie 溯源 | 案例知识 | cookie provenance 四面体 | `analyze_cookie_sources` 工具（双源归因） | Set-Cookie 时序流（cookieName 参数） | **写进统一方法论**：两种引擎两种溯源手段互为补充 |
| 网络取证 | troubleshooting | evidence.md | network_capture 系列 | NetworkCollector + 五分片文件导出（工程最强） | B 是取证主力，A 补签名型场景 |
| JSVMP | C 独有深度知识（双路径+源码插桩） | — | A 独有运行时（三层探针+AST 插桩） | — | A+C 强绑定成对，是融合后最锋利的差异化能力 |
| 验证码 | — | **D 独有**：11 家族路由表 + 10 篇实战 profile + 6 个 GT4 回归脚本 | — | — | 整体平移为垂直域模块 |
| 断点调试 | 伪断点（hook 模拟） | — | — | **B 独有**：真断点/单步/暂停态求值 | B 独有 |
| 反检测 | anti-debug（检测面清单） | browser-observe（Sequential Tool Rule） | 透明探针（签名安全档） | 三层反检测模型 + CDP 静默导航（纪律最强） | **B 的三原则 + A 的签名型禁令 + D 的串行纪律 → 一篇《检测不变量》总纲** |
| 文档↔工具一致性 | 无（纯人工，已漂移） | 无 | PLAYBOOK 已过时 | `generate-docs --check` + routing eval | **B 的机制推广为全插件 CI** |

---

## 4. 各项目评估摘要

### 4.1 camoufox-reverse-mcp（A）

**优势**：AST 插桩引擎（重叠区间消解、source-site 内容寻址映射两个 hard-won 修复）；JSVMP 三层探针（proxy/transparent/源码级）；C++ 引擎层属性追踪（JS 层不可检测）；`verify_signer_offline` 字符级偏差定位；`compare_env`；CAMOU_CONFIG Windows 分块修复；owned-launch/attach 双模式浏览器管理；对 AI 友好的错误 hint。

**短板**：无日志框架；错误处理粗（统一 `except→{"error"}`，无错误码）；模块级全局单例（`_active_routes` 等，无法多实例）；`docs/JSVMP_PLAYBOOK.md` 全篇旧工具名（**已过时，AI 按它调用必失败**）；esprima 只覆盖 ES2017；`trace_property_access` 依赖外部定制版浏览器；README 宣称 35 个工具实际注册 30（口径不一致）。

**可复用核心**：`ast_rewriter.py`/`js_rewriter.py`（零 MCP 耦合）、13 个 `hooks/*.js`（页面侧资产，引擎无关）、`evaluate_js` 健壮执行范式、`verification.py`、`cookie_analysis.py`、`schema_compat.py`、`camou_config.py`、`_playwright_patch.py`、trace 聚合纯函数。
**胶水（丢弃/适配）**：FastMCP 装配层、`trace.py` 的 C++ tracer 文件协议、`deprecation.py`/Acorn 遗留模板/空壳 `fingerprint.py`。

### 4.2 js-reverse-mcp（B）

**优势**：工程化最优——统一输出信封 + 11 错误码 + retryable；全局 Mutex/SingleFlight/超时-drain 锁安全；CdpSessionProvider（Playwright 下 CDP 会话复用的地基）；NetworkCollector 急切抓 body + 字节预算 + 世代失效；DebuggerContext（settled-promise 暂停求值、remote-object 物化）；LocalFileAccess 沙箱（O_NOFOLLOW/0600/符号链接旁路全堵）；脱敏日志；**routing eval + 文档自动生成 + presubmit 全链**；反检测三原则（零 JS 注入/零 config flag/CDP 延迟激活）是踩坑换来的不变量。

**短板**：全局 Mutex 串行化所有调用（融合后成吞吐瓶颈）；仅 Chromium、headless 被刻意禁用；依赖自维护 Patchright fork（`evaluate` 第三参主世界语义是私有行为）；`keyboard.ts` 死代码；文档行号已漂移；内存双 collector 预算逻辑重复。

**可复用核心**：第 3 节列的全部基建件 + 错误码/信封 + 能力惰性激活模式 + generate-docs/routing-eval 工程件。
**胶水**：cloak 动态加载、上游兼容 profile 路径、24 个工具的长描述文案（为自家路由调校，不可直接当通用契约）。

### 4.3 hello_js_reverse_skill（C）

**优势**：行为治理设计罕见地强（CHECK 复述、红线、含 AI 辩护驳斥的 pitfalls、降级梯度）；JSVMP 双路径方法论 + 源码插桩盲区分析；`jsdom-env-patches.md`（915 行可复用代码）；案例库带踩坑表与「可验证事实清单」；三个脚本零依赖独立可用。

**短板（融合前必须修）**：**文档漂移**——`phase-details.md` Phase 5 还是已删除的 Session/Assertion 流；`workflow-overview.md`、`troubleshooting.md`、`obfuscation-guide.md`、`demo-analysis.md`、`universal-vmp` 案例用 v0.9.0 前旧工具名；版本口径五个数并存（65/32/35/~50/~80）；`hook-generator.js` 与 `hook-techniques.md` 的 cookie Hook 写法自相矛盾（实例级 vs 原型链级）；SKILL.md 1359 行过重（对按整篇加载 SKILL.md 的 agent 是负担）；check-deps.sh 不检查 MCP 且跨平台弱；frontmatter 无 version 字段；强授权话术在通用平台上易触发安全策略（需重写为中性合规表述）。

### 4.4 trace（D）

**优势**：结构最符合 skill 最佳实践（7.5KB 路由器 + 渐进披露 + 路由表）；Evidence/Proof Manifest/Completion Contract 是全组唯一的**验收契约层**；captcha 垂直域（11 家族路由 + 10 实战 profile，GT4 文档 49.5KB 覆盖 7 种 risk_type）全组独有；3 个脚本零依赖且实测通过；自带 15 条触发评测。

**短板**：`iv8-web-reverse` 后端悬空引用（无任何工具契约，agent 无法执行 iv8 交付档位）；GT4 文档引用脚本路径错误（`scripts/gt4_replay.py` 实际在 `scripts/captcha/`）且 **两个 .js helper 根本不在包内**；4 篇 captcha 文档引用未随包发布的外部案例文件（`数美滑块.py` 等），CSDN 文档硬编码本地盘路径——需清洗；captcha 脚本无 requirements 声明；无 LICENSE/README；评测仅 15 条且无英文样本。

---

## 5. 融合方案

### 5.1 产品定位

一个 monorepo 插件项目（建议名 `jsrev` 或保留现有品牌）：
**「跨 coding agent 的 JS 逆向工具包 = 双引擎 MCP + 统一 CLI + 渐进披露 Skill 套件 + 证据工作区约定」**。

### 5.2 分层架构

```
┌─ L4 分发层 ── 各宿主 manifest（Claude Code/ZCode plugin、Cursor/Codex/OpenCode/Windsurf/Gemini 配置）
│              jsrev install <host>：生成宿主专属 MCP/skill/命令配置
├─ L3 知识层 ── skills/jsrev（主 skill：路由器 ≤300 行）
│              ├─ references/：workflow、phases、invariants（检测不变量总纲）
│              ├─ knowledge/：crypto、env-patch、hooks、obfuscation、protocol、anti-debug（C+D 合并）
│              ├─ verticals/：jsvmp（C 深度篇）、captcha（D 10 篇+脚本）、debugger（B 篇新写）
│              ├─ evidence/：evidence.md、delivery.md、report-template.md、anti-patterns（D 主体）
│              └─ cases/：C 案例库（含模板）
├─ L2 CLI ──── jsrev（Node 单入口，无 MCP 也能用的通用适配器）
│              jsrev doctor / install <host> / task init|report / crypto identify|diff
│              jsrev hook gen / sandbox run / mcp chrome|fox（= MCP 启动器）
├─ L1 MCP ──── 两个 stdio server，统一工具命名空间 + 统一输出信封 + 统一错误码
│              jsrev-browser-chrome（B：断点/网络取证/WS/导出，24 工具）
│              jsrev-browser-firefox（A：JSVMP 插桩/引擎追踪/环境采集，~30 工具）
└─ L0 内核 ── Node 内核（B 基建件） + Python 内核（A 引擎件） + 共享 assets/hooks/*.js（引擎无关）
               共享约定：js_reverse_cache/tasks/<id>/ 证据工作区（D 的 Evidence Contract）
```

**关键设计决策（推荐）**：

1. **双运行时保留，不做单进程合并**。Chromium-CDP 与 Firefox-Juggler 是两套引擎栈，合并进程不现实也无收益；真正要统一的是**工具命名空间、输出信封、错误码、hook 资产、证据约定**。B 的信封 `{ok, tool, summary, data, error{code,message,retryable}}` 向 A 推广。
2. **工具命名空间统一**：以 B 的 `action` 参数式设计为蓝本做中性工具抽象，写一份《统一工具矩阵》——每个能力一行，标注 `chrome` / `firefox` / `cli` / `manual` 四种可用途径。C 的 `mcp-tool-reference.md` 迁移表直接改造为这份矩阵的雏形（它已经是「统一接口 + action + 旧名映射」结构）。Skill 引用中性名，矩阵负责映射，换引擎不改知识层。
3. **Skill 采用 D 的骨架装 C 的肉**：主 SKILL.md 瘦身到 ≤300 行（D 的 Startup Gate + 路由表 + 完成契约），C 的 1359 行内容全部下沉 references 按需加载；CHECK 复述与红线保留但去 MCP 绑定化。C 与 D 的重复文档（crypto/env/hook）合并为 knowledge/ 单一来源。
4. **CLI 是通用适配器**：对不支持 MCP 或 skills 的宿主，CLI（shell 可调）+ AGENTS.md 片段就是降级通道；`jsrev install` 负责把配置写进各宿主（把 B README 手工四份配置 + C README 手工三份配置的重复劳动产品化）。
5. **证据工作区全链统一**：D 的 `js_reverse_cache/tasks/<task-id>/`（task.json / network.jsonl / runtime-evidence.jsonl / handoff.json / fixtures/ / report.md）成为两个 MCP 的导出默认目录约定 + CLI `jsrev task` 管理入口 + Skill 的 Completion Contract 载体。
6. **检测不变量总纲**（新写一篇，三源合一）：B 的反检测三原则 + A 的签名型禁用矩阵（Proxy hook 可被检测、闭包捕获时序坑、route 晚注册漏首屏）+ D 的 Sequential Tool Rule。Skill 和两个 MCP 的 server instructions 都引用它。

### 5.3 主流宿主接入矩阵

| 宿主 | MCP | Skills | 其他 | 接入方式 |
|---|---|---|---|---|
| Claude Code / ZCode | ✅ | ✅（plugin 打包） | slash commands、hooks、subagents | 完整插件（manifest + skills + .mcp.json + commands） |
| Codex CLI | ✅（config.toml） | ✅（~/.codex/skills） | AGENTS.md | install 写配置 |
| Cursor | ✅ | ✅（skills 目录） | rules | install 写配置 |
| OpenCode | ✅ | ✅（trace 已声明兼容） | commands | install 写配置 |
| Windsurf / VS Code Copilot / Cline | ✅ | 部分/规则替代 | workflows / rules | MCP + AGENTS.md/规则片段 |
| 任意 agent（无 MCP/skills） | — | — | shell | CLI 降级通道 + 知识即 markdown 可粘贴 |

（各宿主 skills 支持细节随版本演进，install 子命令按宿主实测为准。）

### 5.4 质量契约（融合后 CI）

1. **工具路由评测**：B 的 `evals/tool-routing.json` + `evaluate-tool-routing.ts` 推广到双 server；任何工具描述改动必须过 eval。
2. **文档一致性校验**：B 的 `generate-docs --check` 机制扩展——从两个 live server 采集真实工具 schema，校验 skill 文档中出现的每个工具名（**直接根治 C 的文档漂移**）。
3. **Skill 触发评测**：D 的 15 条 + 新增英文样本与负样本。
4. **跨平台 CI**：Windows（A 的 CAMOU_CONFIG 分块、B 的 O_NOFOLLOW 语义待实测）/ macOS / Linux × Node 20/22 × Python 3.10/3.12。

---

## 6. 分阶段路线图

**P0 修复（在各现有仓库内先做，融合的前置）**
- 修 C 的文档漂移（phase-details Phase 5、workflow-overview/troubleshooting/obfuscation 旧工具名、hook-generator cookie 写法矛盾）、统一版本口径。
- 修 D 的 GT4 路径错误 + 缺失 helper、清洗硬编码本地路径、补 requirements。
- A 的 JSVMP_PLAYBOOK 要么重写要么删除（知识已在 C 中，避免双份漂移）。
- 决定 `trace_property_access` 新旧语义、iv8 档位由谁承载（A 的 instrumentation 是最接近的现役实现）。

**P1 打包（monorepo + 可安装）**
- 建 monorepo：`mcp-chrome/`（B）、`mcp-firefox/`（A）、`cli/`、`skills/jsrev/`、`assets/hooks/`、`evals/`、`docs/`。
- `jsrev install <host>` + `jsrev doctor`（合并 C 的 check-deps.sh + A 的 check_environment，打通 MCP 检查）。
- 各宿主 manifest 与双实例（chrome+firefox）推荐配置。

**P2 统一（契约收敛）**
- A 对齐 B 的信封/错误码/日志脱敏；A 的全局单例改实例化。
- 《统一工具矩阵》+ 中性工具名映射；skill 全面改用中性名。
- C+D 文档合并去重（crypto/env/hook/anti-pattern）；主 SKILL.md 重写瘦身；授权话术中性化。
- 共享 `assets/hooks/`（A 的模板上移，B 按需引用）；证据工作区约定接入两个 MCP 的导出工具。

**P3 质量与发布**
- 三套评测上 CI；文档一致性校验全量生效；跨平台 CI。
- npm + PyPI 双发布（或 npm 包内嵌 Python 子包安装）；MCP registry 条目（B 已有 mcpName）；插件市场提交（Claude Code/ZCode marketplace）。

**P4 可选演进**
- MCP 网关（单 server 代理双引擎，按 `engine` 参数路由）——等工具矩阵稳定后再考虑；按资源粒度的锁替代全局 Mutex；skill 执行质量评测（不只触发）。

---

## 7. 风险与待决问题

| # | 风险/决策 | 说明 | 建议 |
|---|---|---|---|
| 1 | **双运行时安装摩擦**（Node+Python+两个浏览器内核） | 最大 UX 风险 | doctor 一键诊断 + 「chrome-only 轻量档」（无 Python 也能用 B + CLI）；firefox 引擎按需装 |
| 2 | 工具描述即契约 | 改描述必须同步 routing eval | 采纳 B 的 presubmit 纪律为全插件规范 |
| 3 | C 的 SKILL.md 过重 | 整篇进上下文的 agent 会被 62KB 挤爆 | P2 瘦身到 ≤300 行路由器，这是融合里收益最大的单项 |
| 4 | 品牌与许可证 | B 系 chrome-devtools-mcp 衍生（Apache-2.0，保留 Google header）；A 依赖外部定制浏览器二进制 | 保留 attribution；定制浏览器能力在矩阵中标注「需外部组件」 |
| 5 | 授权与合规表述 | C 的强话术、D 的「不做什么」边界 | 统一为中性授权门（authorized target 声明 + 禁滥用条款），保留不服务撞库/盗号的边界 |
| 6 | iv8 档位悬空 | D 的交付第 4 级无实现 | 由 A 的 instrumentation/evaluate 承载，iv8-basics.md 补成真实工具清单 |
| 7 | Windows 一致性 | A 已做分块修复；B 的 O_NOFOLLOW/O_EXCL 语义、中文路径待实测 | 列入 P3 CI 矩阵 |
| 8 | 命名空间冲突 | 双 server 各自工具名有语义重叠（navigate/evaluate/screenshot 等） | 矩阵中先标注等价关系，宿主同时挂两 server 时用 server instructions 做路由分工（B 已有 instructions 模式可复制） |

---

## 8. 结论

四个项目是同一使命的四个切片，且互补性远大于重叠：**B 提供工程底座与 Chromium 调试器，A 提供签名型/JSVMP 观测仪器与 Firefox 反指纹引擎，C 提供操作方法论与案例库，D 提供验收契约与 captcha 垂直域**。融合不需要发明新能力，核心工作是：①统一契约（信封/错误码/工具矩阵/证据工作区），②知识去重（C+D 合并、D 骨架瘦身），③把 B 已验证的工程纪律（routing eval、文档一致性校验、install 体验）推广到全局，④补上宿主分发层（CLI + install）。P0 的文档修复是硬前置——尤其 C 的旧工具名与 A 的过时 PLAYBOOK，否则融合后的 skill 会把 agent 引向不存在的工具。
