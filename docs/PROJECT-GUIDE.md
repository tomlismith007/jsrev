# jsrev 项目导读（Project Guide）

> 更新：2026-08-30 · 本文件是整个 monorepo 的地图。30 秒版本：**双引擎 MCP 提供观测原语，skill 提供方法论与验收契约，CLI 提供体检与脚手架，证据落 tasks/<id>/。**

## 0. 目录树（含注释）

```
jsrev/
├── .zcode-plugin/plugin.json        # ZCode 插件 manifest（首选；userConfig: jsrev_home / firefox_proxy）
├── .claude-plugin/plugin.json       # Claude Code 兼容镜像（内容须与上一致，CI 校验）
├── .mcp.json                        # 双引擎 MCP 声明：jsrev-chrome（node, build 产物）+ jsrev-firefox（python, 启动器）
├── .gitignore                       # node_modules/build/证据工作区/.mimosa 均不入库
│
├── skills/jsrev/                    # 【知识层】主 skill —— agent 触发后的方法论与契约（SKILL.md 128 行路由器）
│   ├── SKILL.md                     #   §0 Startup Gate → §2 反爬分型/引擎路由 → §4 Core Loop → §5 交付阶梯 → §6 检测不变量摘要 → §7 证据/完成契约 → §9 索引
│   ├── references/
│   │   ├── tool-matrix.md           #   人读视图 + 旧名迁移表（机器版 tool-matrix.json 由脚本实采生成）
│   │   ├── tool-matrix.json         #   ★ live 实采机器矩阵（generate-tool-matrix.mjs 生成；doctor 对撞做漂移检测）
│   │   ├── engine-guide.md          #   ★ 双引擎使用规范（路由决策/配方/能做不能做/换手协议/降级矩阵）
│   │   └── evidence-schemas.md      #   task.json / network.jsonl / runtime-evidence.jsonl / handoff.json / 固定向量最小 schema
│   ├── knowledge/                   #   通用方法论（13 篇，全库唯一来源）
│   │   ├── invariants.md            #   ★ 检测不变量总纲（三源合一，引擎操作前必读）
│   │   ├── crypto.md                #   加密模式识别与还原（固定输入循环 + 双语言实现）
│   │   ├── env-patch.md             #   补环境总纲（入场条件 / vm 沙箱警告 / 最小补丁循环）
│   │   ├── env-patch-jsdom.md       #   jsdom 15 类补丁深度篇（901 行代码资产）
│   │   ├── hooks.md                 #   13 种页面 Hook（cookie 只用原型链级）
│   │   ├── obfuscation.md           #   混淆识别 + AST 反混淆（边界/失败模式表导读）
│   │   ├── anti-debug.md            #   7 类反调试检测与对策
│   │   ├── anti-patterns.md         #   12 条三段式反模式（Temptation/Correct move/Self-check + 实战驳斥）
│   │   ├── protocol-analysis.md     #   TLS 指纹 / HTTP/2 / Header 校验 + 诊断流程树
│   │   ├── troubleshooting.md       #   六步排查 + 签名七环节对比链 + 错误速查表
│   │   ├── workflow-contracts.md    #   交付契约展开（交付档位/Proof Manifest/报告模板/iv8 降级裁决）
│   │   ├── experience-rules.md      #   30 条经验法则 + 错误处理降级梯度
│   │   └── public-proof.md          #   公开证明工具（对应 scripts/ 三脚本）
│   ├── verticals/                   #   垂直域深读篇（进阶任务按需加载）
│   │   ├── jsvmp.md                 #   JSVMP 完整方法论（识别→双路径→盲区→健康诊断→陷阱）
│   │   ├── path-a.md                #   路径 A：hook 四板斧 + 降级梯度
│   │   ├── path-b.md                #   路径 B：补环境六步法 + 环境差异分级
│   │   ├── debugger.md              #   chrome 引擎真断点配方（签名定位 10 步 + 网络取证；参数语义均有 file:line 证据）
│   │   └── captcha/                 #   验证码域：11 家族路由 + 10 实战 profile + scripts/ 6 个回归脚本
│   ├── cases/                       #   4 个实战案例（踩坑表/禁动清单/UA 分支矩阵；旧工具名已按迁移表映射）
│   └── scripts/                     #   3 个零依赖 Python 证明脚本（crypto_fingerprint / protocol_diff / public_proof_lab）
│
├── engines/
│   ├── chrome/                      # 【引擎 A】js-reverse-mcp v4.0.3 快照（1a95d9c）vendor，Apache-2.0
│   │   ├── src/                     #   13.2k 行 TS：真断点 DebuggerContext / 字节预算 NetworkCollector / LocalFileAccess 沙箱 / 脱敏日志
│   │   ├── build/src/index.js       #   ← .mcp.json 指向的入口（npm install && npm run build 生成）
│   │   ├── docs/anti-detection-work.md  # 反检测五原则原文（knowledge/invariants.md 的第一来源）
│   │   └── tests/ scripts/ evals/   #   引擎自带测试 / 文档生成 / 30 条路由评测（自有 CI 资产）
│   └── firefox/                     # 【引擎 B】camoufox-reverse-mcp v1.2.0 vendor（MIT）
│       ├── src/camoufox_reverse_mcp/    # 5.1k 行 Python：AST 插桩（ast_rewriter 重叠区间消解）/ JSVMP 探针 / 引擎层 trace
│       ├── launch_server.py         #   ← .mcp.json 指向的入口（sys.path 注入 + 预 import camoufox 防 asyncio 死锁）
│       ├── requirements.txt         #   pip 依赖（mcp/camoufox[geoip]/playwright/esprima）
│       └── src/.../hooks/*.js       #   13 个页面 hook 模板（4 层 JSVMP 探针 + 透明探针）
│
├── cli/                             # 【CLI】零依赖 Node（D3=Node）
│   ├── jsrev.mjs                    #   子命令：doctor / task / crypto / hookgen / sandbox / proof / handshake
│   ├── lib/handshake.mjs            #   MCP stdio 会话层（createSession/mcpHandshake——全项目唯一 MCP 客户端实现）
│   └── vendor/                      #   蒸馏自 C 的 3 个脚本（crypto-identifier / hook-generator[已修复4缺陷] / sandbox-runner）
│
├── hooks/
│   ├── hooks.json                   # SessionStart 自动加载（结构对齐官方 example-plugin 模版）
│   └── session-start.mjs            # doctor-lite：二进制/依赖探测 → additionalContext 注入（5s 预算，静默降级）
│
├── commands/
│   ├── doctor.md                    # /jsrev:doctor → 调 CLI doctor 并解读
│   └── task.md                      # /jsrev:task → 建 tasks/<id>/ 脚手架并填 task.json
│
├── scripts/
│   ├── mcp-probe.mjs                # MCP 功能探针：audit（schema 审计）/ call（任意工具调用）/ chrome-e2e / firefox-e2e
│   ├── e2e-loop.mjs                 # ★ 闭环验证：CLI 脚手架→引擎取证→固定向量+fresh replay→证据落盘→契约自检（双引擎）
│   ├── generate-tool-matrix.mjs     # ★ GB-1：从双 live server 实采生成 tool-matrix.json（引擎变更后重跑）
│   ├── run-evals.mjs                # ★ GC-8：评测校验器（validate 模式 CI 可跑；live 打分留 M3）
│   ├── consistency-audit.py         # ★ 13 项一致性检查（manifest/链接/入口/schema对撞/显示名/旧名隔离/矩阵完备/代理链路）
│   └── validate.py                  # （待接 zcode 市场校验脚本）
│
├── evals/
│   ├── trigger-evals.json           # skill 触发评测 29 条（18 正 + 11 负，双语，含合规负样本）
│   ├── engine-routing.json          # 双引擎分工路由评测 10 条（chrome 3 / firefox 6 / none 1）
│   └── trigger-evals.seed.json      # D 项目原始 15 条（历史种子，已被 trigger-evals.json 取代）
│
├── docs/
│   ├── DECISIONS.md                 # D1-D7 决策记录 + 快照 shas + 安全扫描 triage 计划
│   ├── knowledge-coverage.md        # ★ 四项目知识 → jsrev 的 100% 覆盖对照表（每份源文件的去向）
│   └── PROJECT-GUIDE.md             # 本文件
│
├── README.md / README_CN.md         # 安装与使用（双语）
└── marketplace.json                 # （暂缺——自用不发布；若上市场需按模版 checklist 添加）
```

> 契约层状态（M2）：`skills/jsrev/references/tool-matrix.json` 为 live 实采的机器矩阵（doctor 每次对撞做漂移检测，负向测试已验证能拦）；`references/engine-guide.md` 为双引擎使用规范（路由决策/配方/禁令/换手/降级，参数经 schema 实测核对）。

## 1. 按角色的阅读路径

**新会话的 agent**：`SKILL.md`（触发后自动加载）→ 按 §9 索引按需加载 → 动手前 `knowledge/invariants.md` → 案例 `cases/` 查相似场景。
**想理解双引擎分工的人**：`SKILL.md` §2 → `references/tool-matrix.md` → `verticals/debugger.md`（chrome 侧）+ `verticals/jsvmp.md` §2（firefox 侧）。
**维护者**：`docs/DECISIONS.md`（为什么）→ `docs/knowledge-coverage.md`（知识从哪来）→ `docs/PROJECT-GUIDE.md`（本文件）→ `docs/fusion-plan.md` / `docs/plugin-blueprint.md`（上层规划，已收录仓库内）。
**排查插件本身的问题**：`node cli/jsrev.mjs doctor` → `node scripts/mcp-probe.mjs audit` → 本文件对应组件注释。

## 2. 命令速查

```shell
node cli/jsrev.mjs doctor                        # 体检 + 双引擎真实 MCP 握手（chrome 24 / firefox 36 工具）
node scripts/mcp-probe.mjs chrome-e2e            # 真实拉起浏览器：开页→CDP 求值→网络采集→截图
node scripts/mcp-probe.mjs audit                 # 双引擎全量工具 schema 审计
node scripts/mcp-probe.mjs call firefox check_environment '{}'
node cli/jsrev.mjs task <name>                   # 证据工作区脚手架
node cli/jsrev.mjs crypto identify "<密文>"       # 密文指纹
node cli/jsrev.mjs hookgen cookie                # 原型链级 cookie hook 代码
```

## 3. 数据边界（再强调）

- 任务证据 → **项目内** `./js_reverse_cache/tasks/<id>/`（`JSREV_HOME` / userConfig `jsrev_home` 覆盖）
- 插件长命数据 → 宿主 `ZCODE_PLUGIN_DATA`
- 两者都**永不写回插件安装根**；敏感常量仅存在于 captcha 知识内（自用，D7）

## 4. 已知待办（按里程碑）

- M2 剩余：GB-3 A 引擎信封/错误码对齐（第一批导出类工具，单独一轮代码手术）。
- M3：评测 live 打分（需模型会话）；案例可验证事实清单回填。
- M4：Tier-2 安装器（Cursor/Codex/OpenCode）；双 manifest CI diff 上远端；载荷裁剪（当前 2.75MB 无压力）。
- 已完成勿再列：tool-matrix live 生成（GB-1）、doctor 漂移检测（GB-2，9 项 9/9）、触发评测扩容（GC-8，29+10 条）、双引擎使用规范（engine-guide.md）。
- 随时：`camoufox fetch`（已完成 152.0.4-beta.29）；旧 hello skill 退役（已完成）。
