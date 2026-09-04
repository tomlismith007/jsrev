# JS 逆向插件融合规划 v2.1（缺口驱动 · 模版修正版 · 自用拍板）

> 定位：本文不回答"现在有什么"（见 [fusion-analysis.md](fusion-analysis.md)，模版能力面见 [plugin-blueprint.md](plugin-blueprint.md)），只回答五个问题：**缺什么、要做什么、怎么做、什么不能做、边界是什么**。
> 方法：先定义目标状态（验收锚点），再从目标倒推缺口。缺口 ≠ 存量代码的毛病，而是**目标态需要但当前不存在的东西**。
>
> **v2 相对 v1 的四个策略转变**：
> 1. **分发重心反转**：v1 以 CLI（install/doctor）为分发核心；v2 确定「插件载荷本身 = 分发」（双 manifest 模版原生覆盖 ZCode + Claude Code），CLI 降级为 Tier-2 宿主的配置生成器。
> 2. **知识层"重建而非迁移"**：交付的 skill 是**新建**的（C/D 文档是原料不是成品），漂移在合并时由生成的工具矩阵机械过滤——v1 中最大的工作量（人工修 C 的 18 篇漂移文档）被取消。
> 3. **D1 反转并已拍板**：B 由"先 npm 依赖"改为**直接 vendor 快照**——载荷自包含、离线可用、版本锁定、**可自由二次开发；个人使用，不联系上游、不同步上游**。
> 4. **合规按"个人使用"重新定级**：C 存在 "avoid LLM safety filter" 意图的 commit 实锤；自用不发布，市场级合规（NOTICE 结构 / 边界三处声明 / 敏感常量裁决）随之消解，仅保留"丢弃规避式表述 + 保留授权前提声明"的最小改写。

---

## 0. 目标状态定义（一切缺口的度量基准）

融合完成 = 以下 7 条验收锚点全部成立：

| # | 锚点 | 内容 |
|---|---|---|
| T1 | **一次安装** | ZCode / Claude Code：启用插件即完成 MCP 挂载 + skill 安装 + hooks 注册，SessionStart 注入环境体检结果；`/jsrev:doctor` 能说清缺什么（Node / Python / Chrome / Camoufox / pip 包）并给可执行指引。Tier-2 宿主：`jsrev install <host>` 一条命令生成配置。 |
| T2 | **正确触发** | "帮我看看这个接口的 sign 怎么来的" → skill 触发 → 判定反爬类型 → 路由到正确引擎（chrome 断点取证 vs firefox 插桩）与中性能力名 → 映射到真实工具。触发与路由质量有评测集保障。 |
| T3 | **契约一致** | 双 MCP 信封/错误码/超时语义一致；skill 只引中性能力名，`tool-matrix.json` 由脚本从 live server 采集生成；CI 校验交付文档中出现的每个工具名真实存在。 |
| T4 | **可验收交付** | 所有产物落 `tasks/<id>/`（task.json / network.jsonl / runtime-evidence.jsonl / handoff.json / fixtures/ / report.md，前三个补最小 schema）；完成契约明确"什么算完、什么明确不算完"。 |
| T5 | **本地多宿主可达** | 同一载荷在本机各宿主可用：ZCode 本地装载 + Claude Code 插件加载 + Tier-2 宿主 `jsrev install`；版本策略成文（插件 manifest 版本 ↔ 引擎快照锁定）。**个人使用，不发布市场/registry/npm/PyPI**。 |
| T6 | **合规自洽（自用级）** | 保留"authorized target 前提"的实用授权声明，无"规避过滤器"式表述；各引擎目录保留原 LICENSE 文件（自用无分发义务）。 |
| T7 | **可维护** | 单 monorepo CI：触发评测 + 双引擎分工路由评测 + 文档一致性校验 + 跨平台矩阵（Win/macOS/Linux）+ 双 manifest 一致性 diff；知识单一来源。 |

---

## 1. 缺什么（Gap 登记表）

按"目标态需要但不存在"登记。疼级：★★★ 阻塞目标态 / ★★ 显著削弱 / ★ 可延后。**标注 ✅ 的为本次拍板后已消解的项，保留登记仅为追溯。**

### G-A 分发层（目标态 T1/T5，缺口最大）

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GA-1 | **插件载荷骨架**：双 manifest、`.mcp.json`（双引擎声明）、hooks/、commands/、skills/ 全部不存在 | 按 example-plugin 标准路径落位；manifest 用 `userConfig` 暴露 `jsrev_home` / `python_path` / `proxy`；`.mcp.json` 双 stdio server + `${ZCODE_PLUGIN_ROOT}` 自包含启动 | T1 | ★★★ |
| GA-2 | **vendor 机制**：B 快照进 `engines/chrome/` | M0 打上游快照 tag → 快照入库（剔除 keyboard.ts 死代码与赞助文案）→ 目录内保留 Apache-2.0 原文件。**已拍板：个人二次开发，不联系上游、不同步上游，vendor 后可自由修改** | T1/T5 | ★★★ |
| GA-3 | **本地安装路径实测**：zcode 本地装载方式（本地目录 / 本地 marketplace.json 注册）、Claude Code 插件加载 | 双宿主从本地目录启用即用；双语 README 降为可选 | T5 | ★★ |
| GA-4 | **Tier-2 安装器**：Cursor/Codex/OpenCode 的配置生成 | `jsrev install <host>`：写 mcp 配置 + 拷 skills；不做深度定制 | T1 | ★★ |
| GA-5 | **内核获取指引**：插件不能下载内核，但目标态要求 doctor 说清"缺什么、怎么补" | doctor 检测 + 输出 `camoufox fetch` / Chrome 渠道的可执行修复指引（不内置下载器——红线 13） | T1 | ★★ |
| GA-6 | **版本策略**：插件版本与双引擎版本的锁定关系 | 成文：B=快照锁定（升级=换快照，自用无同步义务）；A=pip 版本区间；skill 独立版本 | T5 | ★★ |
| GA-7 | **载荷预算**：什么进插件包、什么留 monorepo | build 产物 + skills + hooks + commands 进包；tests/evals/开发文档留库 | T7 | ★ |
| GA-8 | ~~市场发布链~~ **✅ 已消解**：不发布市场 | 无需动作 | — | — |

### G-B 契约层（目标态 T3/T4，漂移与混乱的根因）

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GB-1 | **中性工具矩阵**：skill 与双 MCP 之间没有契约层 | 生成式 `tool-matrix.json`：能力 → {chrome 工具 / firefox 工具 / CLI 命令 / 手工路径}；含 C 旧工具名 → 现名的迁移映射（用于案例机械过滤） | T2/T3 | ★★★ |
| GB-2 | **能力清单协议**：skill/doctor 无法感知 server 实际工具集 | doctor 对双 server 做 tools/list 握手，校验矩阵版本，不匹配即告警 | T1/T3 | ★★★ |
| GB-3 | **信封/错误码统一**：A 裸 dict + `{"error"}`，无错误码 | A 分两批对齐 B 的 `{ok,tool,summary,data,error{code,message,retryable}}` + 11 错误码：第一批导出/分析类，第二批全量 | T3 | ★★ |
| GB-4 | **证据工作区落地**：`tasks/<id>/` 只是 D 的文档约定，双 server 与 CLI 都不遵守 | `JSREV_HOME` env（userConfig 注入，空 = 项目内 `./js_reverse_cache/`）+ task.json/network.jsonl/runtime-evidence.jsonl 最小 schema（D 只给了 handoff.json 的 schema）+ 导出类工具默认落工作区 + `/jsrev:task` 脚手架命令 | T4 | ★★ |
| GB-5 | **双 server 共存路由**：同挂约 59 个工具定义，navigate/evaluate 等同名类工具 | 双 server instructions 写明分工（签名型/JSVMP → firefox；断点/网络取证 → chrome）；瘦身档 = 用户在 MCP 面板禁用 firefox（模版 `enabled` 机制，零代码） | T2 | ★★ |
| GB-6 | **SessionStart doctor-lite**：hooks 里"毫秒级环境体检 + 注入上下文"不存在 | node/python/双内核二进制探测（不做 MCP 握手，5s 预算），失败静默降级；输出缺失项修复指引 | T1 | ★★ |

### G-C 知识层（目标态 T2/T4，交付质量的本体）

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GC-1 | **主 SKILL.md**：≤300 行路由器不存在（C 62KB 过重、D 精瘦但无工具操作层、无引擎分工） | D 的骨架（Startup Gate 五项声明 + Core Loop 五级阶梯 + Completion Contract）+ C 的方法论指针 + 反爬三分法路由 + 中性能力名；C 的 CHECK 复述保留但去 MCP 绑定 | T2 | ★★★ |
| GC-2 | **授权门改写**（自用级）：C 原话术带 "avoid LLM safety filter" 意图 | 保留实用的授权前提声明（authorized target 假设），丢弃"规避过滤器"式表述与对应 commit 痕迹；边界声明收敛为 skill + README 两处 | T6 | ★★ |
| GC-3 | **知识单一来源**：crypto ×2、env-patch ×3、hook 模板 ×4 处重复 | knowledge/ 合并：以 C 版为主体、D 版纪律为总纲、A 模板为工程实现；cookie hook 以原型链写法为准裁决 | T2/T7 | ★★ |
| GC-4 | **debugger 垂直篇**：没人教 B 的真断点/暂停求值/单步工作流 | 新写（素材 = B 的 server instructions + docs），chrome 引擎的路由入口 | T2 | ★★ |
| GC-5 | **检测不变量总纲**：三源分散 | 合写一篇：B 三原则 + A 签名型禁用矩阵 + D 串行纪律；skill 与双 server instructions 共同引用 | T2/T3 | ★★ |
| GC-6 | **captcha 垂直域达可用标准**：路径错 20+ 处、2 脚本缺 helper 不可运行、依赖未声明（含 cv2/scipy/Node） | 清洗平移：路径修复、helper 找回或降级说明、requirements 补齐；站点常量**原样保留**（自用，D7 关闭） | T2 | ★★ |
| GC-7 | **案例迁移过滤器**：C 四案例是最有价值资产但内嵌旧工具名 | 用 GB-1 的旧→新映射做**机械替换 + 人工抽查**（案例是 AI 精读文件，错误直接导致调用失败）；D 的 captcha profile 外部引用标注"外部参考、不随包发布" | T2 | ★★ |
| GC-8 | **触发/路由评测集**：D 15 条无英文无负样本扩展；双引擎分工路由评测不存在 | 触发评测扩到 ≥25 条（正/负/双语）；新写 10 条双引擎分工路由评测（B 的 eval 结构复用、语料重写——B 原 30 条语料与其工具强耦合不可直接用） | T2/T7 | ★★ |
| GC-9 | **iv8 档位裁决**：交付第 4 级无执行后端（双层悬空） | 由 A 的 instrumentation/evaluate 承载并改写 iv8-basics.md 为真实工具清单，或从交付阶梯中降级移除 | T4 | ★★ |
| GC-10 | **休眠工具裁决**：A 的 analyze_cookie_sources 已实现未注册 | 注册激活（一行 import）或删除；cookie 溯源方法论依赖它 | T3 | ★ |

### G-D 引擎层（目标态 T1/T3，融合期最小修复）

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GD-1 | **A 的载荷化启动**：pip 依赖 + camoufox 内核前提无声明、无降级路径 | userConfig python_path 启动 + doctor 检测 + "缺依赖时的可读错误"；决策：uvx 直发还是要求 pip install（M1 实测定） | T1 | ★★ |
| GD-2 | **A 的日志与脱敏**：零 logging | 对齐 B 的 logger 模式（键级 + URL 级脱敏） | T3 | ★ |
| GD-3 | **A 的全局单例**：BrowserManager、_active_routes 跨模块私有引用 | 实例化收敛（多实例/网关的前置，融合期只做收敛不加功能） | T7 | ★ |
| GD-4 | **Windows 一致性实测**：B 的 O_NOFOLLOW/O_EXCL 语义、中文路径；A 已有分块修复 | 进 CI 矩阵实测修复 | T7 | ★★ |
| GD-5 | **A 的过时文档处置**：JSVMP_PLAYBOOK 全篇旧名且引用未注册工具 | 删除（知识已在 C，双份必漂移） | T7 | ★ |

### G-E 权利与治理

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GE-1 | **许可文件收尾**（自用级降级）：A 无 LICENSE 文件；C/D 无许可 | 目录内保留各自 LICENSE 原文件即可（自用无分发义务）；若未来公开再补 NOTICE 结构 | T6 | ★ |
| GE-2 | **trace 单点丢失**：无 .git 无远端 | 立即推远端备份，再动迁移 | T7 | ★★★ |
| GE-3 | **退役机制**：用户机器已装旧 hello skill（`~/.agents/skills` 等），与新 skill 触发竞争 | doctor/SessionStart 检测旧副本并提示退役；README 写明冲突症状 | T1/T2 | ★ |
| GE-4 | ~~敏感内容裁决~~ **✅ 已消解**：个人使用不公开发布，captcha 文档常量按原样保留（D7 关闭） | 无需动作 | — | — |

### G-F 质量运维（目标态 T7，防回归的基建）

| Gap | 缺的是什么 | 建成什么样 | 锚点 | 疼级 |
|---|---|---|---|---|
| GF-1 | **文档一致性 CI**：B 的 --check 只护 tool-reference 与 README，不护行号/知识文档 | 从双 live server 采集 → 校验交付文档中每个工具名/行号引用；拦截故意注错 | T3/T7 | ★★★ |
| GF-2 | **跨平台矩阵**：三平台 × Node 20/22 × Python 3.10/3.12 | CI 矩阵 + GD-4 清单 | T7 | ★★ |
| GF-3 | **双 manifest 同步校验**：.zcode-plugin 与 .claude-plugin 人肉同步必漂 | CI diff 校验 | T7 | ★ |
| GF-4 | **评测三套上 CI**：触发 / 双引擎分工路由 / 文档一致性 | presubmit 组合（对标 B 的 presubmit 链） | T7 | ★★ |

---

## 2. 哪些不能做（红线，违反任何一条即方案不成立）

### 架构红线

1. **不合并运行时**。不把 A 移植成 Node、不把 B 移植成 Python、不做单进程双引擎。融合的是契约与分发，不是进程。
2. **MCP 不承载工作流/记忆/会话状态**。A 已为此删过 11 个工具并有反向断言测试；状态一律落证据工作区。"把 session 加回来"的提议不做。
3. **不在 chrome 引擎做任何 JS 注入反检测**。B 的三原则（零 JS 注入 / 零 config flag / CDP 延迟激活）是踩坑换来的不变量，任何 browser 层改动先对照 anti-detection 五原则。共享 hooks 资产只属于 firefox 引擎与 Node 沙箱场景——"全引擎共享 hook 库"这个直觉是错的。
4. **v1 不通过改名统一工具名**。中性命名只是 skill 层的虚拟命名空间（GB-1 映射表），server 层保持原生名。
5. **融合期 feature freeze**。不趁机加新工具、新引擎能力、subagents、PreToolUse 拦截器。融合是重构与打包，不是功能开发。（vendor 后 B 可自由修改，但修改放在融合完成之后按需做。）
6. **v1 不做 MCP 网关**。工具矩阵稳定前，"单 server 代理双引擎"是过早抽象。
7. **hooks 不是功能扩展点**。v1 仅 SessionStart doctor-lite；不做 PreToolUse 拦截/注入（hooks 快照语义使排障成本高，且违反红线 5）。

### 合规红线（自用纪律）

8. **不交付"即插即用绕过"**。captcha 脚本保持"绑定官方 Demo key 的回归模板"性质。
9. **不收录生产站点成品破解配置**；站点常量按原样自用，但若未来公开必须先做三级裁决。
10. **不带入"规避安全过滤"式表述**。C 那句 commit 意图及其配套话术零带入；自用版保留"authorized target 假设"的实用授权声明（把边界说清楚，不是把话术改成过审）。
11. **不承诺 undetectable / 不可检测**。
12. **默认无遥测**。
13. **不静默下载浏览器内核**。install/doctor 只指引，显式列出将下载什么、装到哪。

### 工程红线

14. **SKILL.md 预算 ≤300 行 / ~15KB**。硬预算，超了就下沉 references。
15. **不做全宿主深度适配**。Tier-1/2 到"生成配置可用"为止。
16. **不把 Windows 当 POSIX**。路径/编码/符号链接/O_NOFOLLOW 全进 CI 矩阵。
17. **数据存放分离**：任务证据 → 项目内 `js_reverse_cache/`（JSREV_HOME 覆盖）；插件长命数据 → `ZCODE_PLUGIN_DATA`；**永不写回插件安装根**。
18. **不人工修 C 的漂移文档再迁移**。交付 skill 是重建的，漂移由生成矩阵在合并时机械过滤；人工只做案例抽查。这一条禁止的是"花两周改 18 篇旧文档"的伪工作。

---

## 3. 边界是什么

### 3.1 范围边界

| In scope | Out of scope |
|---|---|
| 授权目标站的签名/验证码/风控协议分析与 browser-free 复现 | 规模化爬虫框架、分布式抓取、代理池管理 |
| 双引擎观测（chrome 断点取证 + firefox 插桩）与统一 skill 方法论 | 泛用浏览器自动化（宿主已有 browser-use 类插件） |
| 证据工作区、验收契约、报告模板 | 项目管理、看板等逆向之外的工具 |
| Tier-1/2 配置生成 + CLI 降级通道 | 每宿主深度定制、自建宿主 |
| 本地多宿主装载（zcode / Claude Code / Tier-2） | 市场/registry/npm/PyPI 公开发布 |
| captcha 教学回归模板（Demo key，自用） | 针对生产站点开箱即用的破解配置 |
| 反检测 = 让调试链路能到达目标 | 反检测 = 隐匿自动化做规避 |

### 3.2 架构职责边界（每层只做一件事）

- **L0 引擎**（chrome/firefox）：只提供观测与取证原语，不懂工作流，不存状态。
- **L1 契约**（矩阵/信封/错误码/握手）：唯一的命名空间翻译层；skill 不见原生工具名，server 不懂方法论。
- **L2 知识**（skills/）：只引中性能力名 + 文件层约定；方法论、案例、验收契约都在这层。
- **L3 载荷**（manifest/.mcp.json/hooks/commands）：只负责"被宿主安装"，不含业务逻辑；hooks 只做体检注入。
- **L4 CLI**：Tier-2 配置生成 + task 脚手架 + 独立小工具（crypto/hook-gen）；不是分发核心，不是第二个 agent。

### 3.3 数据边界

| 数据 | 位置 | 禁止 |
|---|---|---|
| 任务证据（tasks/<id>/） | 项目内 `./js_reverse_cache/`，`JSREV_HOME` 可整体改根 | 写进插件安装根 |
| 插件自身缓存/日志 | `ZCODE_PLUGIN_DATA` | 写进安装根 |
| 用户密钥/代理 | manifest `userConfig`（`sensitive` 标记） | 硬编码进 skill/hooks/工具描述 |
| 站点特定常量 | 原样保留在 captcha 知识内（自用不发布，D7 已关闭） | 若未来公开，先做三级裁决 |

### 3.4 宿主分级边界

- **Tier-1**（ZCode / Claude Code）：完整能力（双 MCP + skill + hooks + commands），模版原生承载，M1 验收在此。
- **Tier-2**（Cursor / Codex / OpenCode）：MCP + skills，`jsrev install` 生成配置，社区级实测。
- **Tier-3**（Windsurf / Cline / Gemini CLI / 任意 agent）：MCP + AGENTS.md/规则片段 + CLI 通道，不承诺 skill 触发。

### 3.5 合规底线（一句话版）

只服务"对授权目标做协议分析与可复现交付"；拒绝撞库、盗号、批量注册、规模化爬取；不营销"不可检测"；交付物永远带"什么没做完"的诚实声明（D 的 Completion Contract 语义）。

---

## 4. 怎么做（执行策略、决策门、里程碑）

### 4.1 执行策略（五原则）

1. **垂直切片优先**：M1 就打通"两个宿主、装得上、触发得了、chrome 引擎跑通一次真实取证"，再横向铺知识与宿主。
2. **生成式契约对抗漂移**：工具矩阵、工具参考、映射表全部从 live server 采集生成；人只写方法论，不写工具名清单。C 的三层漂移证明人工修文档是死路。
3. **重建而非迁移**：交付 skill 新建，C/D 文档为原料；唯一整篇迁移的是案例库，用映射过滤 + 抽查。
4. **快照 vendor（已拍板）**：B 按上游 tag 快照入库，不同步上游、可自由二次开发；A 以 pip 依赖形态进载荷（版本区间锁定）。
5. **先备份后动刀**：trace 推远端、各仓打冻结 tag，才开迁。

### 4.2 决策门（全部已拍板，2026-08-30）

| # | 决策 | 选项 | 结论 |
|---|---|---|---|
| D1 | **B 的处置** | a) vendor 快照；b) npm 依赖；c) 先 b 后 a | **✅ a，个人二次开发**。不联系上游、不做上游同步，vendor 后可自由修改；Apache-2.0 原文件保留。融合期内守红线 5 |
| D2 | **品牌与包名** | 沿用现有名 vs 新名 | **✅ `jsrev`**（kebab-case、= 插件目录名）；引擎保留原包名 |
| D3 | **CLI 语言** | Node vs Python | **✅ Node** |
| D4 | **宿主优先级** | 选一个 Tier-1 切片 | **✅ ZCode + Claude Code 同时做** |
| D5 | **证据工作区根** | 项目内 vs 全局 | **✅ 项目内默认 + `JSREV_HOME`/userConfig 覆盖** |
| D6 | **载荷默认引擎集** | 双 enabled vs 只 chrome | **✅ 双 enabled + instructions 分工**；瘦身档 = 用户禁用 firefox server |
| D7 | **captcha 敏感常量** | 全部公开 / 三级裁决 | **✅ 自用不发布，常量原样保留** |

### 4.3 里程碑（每段有硬验收）

**M0 决策 + 护栏（~0.5 周）**
- 拍板剩余决策（D2-D6）；trace 推远端；各仓打冻结 tag；B 打 vendor 快照 tag。
- 验收：决策记录成文；无单点丢失风险。

**M1 插件载荷垂直切片（2~3 周）——最高风险阶段**
- monorepo 骨架 + GA-1 载荷（双 manifest / .mcp.json / hooks doctor-lite / commands 最小版）+ GA-2 vendor B + GD-1 A 启动路径实测（uvx vs pip 二选一）。
- 主 SKILL.md v0（GC-1：D 骨架 + C 核心循环，中性能力名，矩阵先用静态占位）。
- 验收 = T1-lite：ZCode 与 Claude Code 各自从零启用插件 → 双 MCP 声明成功、chrome 引擎完成一次导航+断点+网络取证、skill 触发并正确路由；SessionStart 注入体检结果；firefox 缺依赖时可读报错。

**M2 契约层（2 周）**
- GB-1 矩阵生成器 + GB-2 握手校验 + GB-3 A 信封第一批 + GB-4 证据工作区（schema + env + /jsrev:task）+ GB-5 双 server instructions + GB-6 doctor-lite 完善。
- 验收 = T3 前半：CI 文档一致性校验上线并拦住一次故意注错；任务产物落 `tasks/<id>/`。

**M3 知识层（2~3 周）**
- GC-3 知识合并、GC-4 debugger 篇、GC-5 检测不变量总纲、GC-6 captcha 清洗、GC-7 案例映射迁移、GC-8 评测扩容、GC-9/GC-10 裁决落地、GC-2 授权改写终稿。
- 验收 = T2：触发评测 ≥25 条全绿；双引擎分工路由评测 10 条全绿；T4 完成契约自检通过一次真实交付。

**M4 分发硬化（2 周）**
- GA-3 本地装载路径实测（zcode 本地装载 + Claude Code）、GA-4 Tier-2 安装器、GA-6 版本策略、GF-2/3 CI 矩阵与 manifest 校验、GE-3 退役检测、GA-7 载荷预算。
- 验收 = T1 全量：Tier-2 至少一宿主一条命令装完；三平台 CI 绿。

**M5 收口（1 周）**
- 本地各宿主终验（T5）；T6 收尾（LICENSE 留存、两处边界声明、GE-1）；对照 §6 Done 清单逐项勾。
- 验收 = T5/T6/T7 成立，Done 清单全绿。

**M4+（明确不做，留给未来）**：MCP 网关、按资源分锁、skill 执行质量评测、i18n、subagents、PreToolUse 防护、A 多实例、公开发布。

### 4.4 迁移机制

- 自有仓（A/C）：`git subtree` 保留历史进 monorepo；C 的知识按 GC-3/GC-7 过滤后进 skills/（不是整仓平移）。
- B：快照 tag 引入 `engines/chrome/`，目录内保留原 LICENSE；剔除死代码与赞助内容；此后按自用需求自由修改。
- trace：先备份，契约文档整篇迁移（它们就是目标形态），captcha 按 GC-6 清洗。

### 4.5 执行进度（2026-08-30）

- **M0 完成**：D1-D7 全部拍板；A/C 原仓 tag `pre-fusion-freeze`；trace 归档备份 `trace-backup-20260830.tar.gz`（git commit 被工作区安全扫描拦截，triage 计划见 jsrev/docs/DECISIONS.md）；B 快照 `1a95d9c`（v4.0.3-5-g1a95d9c）。
- **M1 载荷落地（jsrev/ monorepo）**：双 manifest + .mcp.json（双引擎）+ hooks doctor-lite + commands + SKILL.md + references + README 双语；引擎验证 chrome build+CLI、firefox 36 工具（GC-10 落地）。
- **M2 契约层完成**：GB-1 工具矩阵 live 生成（`scripts/generate-tool-matrix.mjs` → tool-matrix.json，27KB 含全量 description/required/properties）；**GB-2 doctor 漂移检测上线并过负向测试**（注入假工具名 → 立即 DRIFT 报警；doctor 现为 9 项检查 9/9）；GB-5 firefox instructions 写入路由分工；GF-1 前置（矩阵对撞）已进一致性审计 H 组。
- **知识层（GC 系列提前完成主体）**：knowledge 14 篇 / verticals 4+11 篇 / cases 6 篇 / 脚本 9 个全部蒸馏落位（覆盖对照 docs/knowledge-coverage.md）；`references/engine-guide.md` 双引擎使用规范（路由决策/配方/禁令/换手/降级，参数经 schema 实测核对）。
- **GC-8 评测**：触发评测 29 条（18 正 + 11 负，双语，含合规负样本）+ 双引擎分工路由评测 10 条 + 校验器 `scripts/run-evals.mjs`（validate 全过；live 打分模式留 M3）。
- **循环验证设施**：`scripts/e2e-loop.mjs`（双引擎闭环：CLI→取证→固定向量+fresh replay→证据落盘→契约自检，双 PASS）、`scripts/mcp-probe.mjs`（schema 审计/工具调用/端到端）、`scripts/consistency-audit.py`（13 项一致性检查）。
- **环境事实**：camoufox 内核已下载（152.0.4-beta.29）；旧 hello skill 已退役出扫描根；启动器 locale 清洗（GD-1.1）。
- **M1/M2 剩余**：ZCode / Claude Code 双宿主实际装载实测（T1-lite 终验）；GB-3 A 信封对齐（第一批）；live 打分评测。
- **M1 剩余（原列）**：ZCode / Claude Code 双宿主实际装载 + 一次真实取证往返（T1-lite 验收）。

---

## 5. 风险登记表

| # | 风险 | 影响 | 缓解 |
|---|---|---|---|
| R1 | 双运行时安装摩擦（Node+Python+双内核） | T1 失败，最大 UX 风险 | doctor 指引 + chrome-only 可用档（禁用 firefox server）+ 显式下载清单 |
| R2 | 双 server 同挂上下文成本（~59 工具定义） | token 预算、路由混淆 | instructions 分工 + 瘦身档 + 10 条分工路由评测 |
| R3 | ~~vendor 后上游漂移~~ **已消解**（D1：不同步上游，自用无此负担） | — | 无 |
| R4 | 迁移期打断现有工作流 | 用户日常逆向受损 | 旧仓冻结归档不删除；旧 skill 保留至 M5 才提示退役 |
| R5 | 知识合并引入事实回归 | skill 误导 agent | 案例映射 + 可验证事实清单抽查锚点 + 文档一致性 CI |
| R6 | 合规误用风险（自用，风险低但存在） | 宿主策略拦截 | 授权声明改写 + 红线 8-13 作为自用纪律 |
| R7 | 融合周期过长失焦 | 半途而废 | feature freeze + M1 末即有可用载荷 + 每里程碑硬验收 |
| R8 | Windows 边角 | T7 矩阵红 | 三平台必跑 + GD-4 清单化 |
| R9 | 载荷体积超预期 | 安装/装载受阻 | GA-7 预算 + build 产物入包、测试/评测留库 |
| R10 | 双 manifest 漂移 | 一宿主坏 | GF-3 CI diff |

---

## 6. 最终验收清单（Done 定义）

- [ ] T1：ZCode 与 Claude Code 全新环境启用即用；doctor 说清缺失项并给可执行指引；Tier-2 至少一宿主一条命令装完
- [ ] T2：触发评测 ≥25 条（含英文与负样本）全绿；双引擎分工路由评测 10 条全绿
- [ ] T3：skill 零裸工具名引用；矩阵由 live server 生成；CI 文档一致性上线；双 MCP 信封/错误码一致
- [ ] T4：一次真实逆向端到端产物落 `tasks/<id>/`（含最小 schema）且通过完成契约自检
- [ ] T5：本机各宿主（ZCode / Claude Code / Tier-2 至少一个）从本地载荷可达；版本策略成文
- [ ] T6：授权声明改写完成（无"规避过滤器"式表述）；各引擎目录 LICENSE 原文件留存
- [ ] T7：monorepo CI（触发/路由/文档一致性 + 三平台矩阵 + manifest diff）全绿；旧仓冻结 tag 归档；trace 有远端
