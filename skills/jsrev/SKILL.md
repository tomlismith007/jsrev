---
name: jsrev
description: JS reverse engineering toolkit (dual-engine). Use when the user wants to analyze how a protected web API or signature works, reproduce sign/encrypt/anti-bot parameters outside the browser (x-sign, a-bogus, acw_tc, dynamic cookies/headers), trace where a token is generated, understand JSVMP-protected or heavily obfuscated JS, hook/instrument page code, emulate browser environments in Node, or analyze/reproduce captcha protocol flows (Geetest GT3/GT4, Tencent TDC, Yidun, Shumei, Yunpian, Tianyu, CSDN, Ctrip, Baidu). 中文触发：签名还原、接口自动化、加密参数分析、JS 逆向、动态 cookie 溯源、补环境、JSVMP、验证码、风控参数、插桩。Only for authorized targets — the user must ensure they are authorized to test the target.
---

# jsrev — JS 逆向工具包（双引擎）

把受保护的 Web 目标还原为 **browser-free 的可重复协议工作流**。浏览器只是证据源，不是交付物。

## 0. Startup Gate（开工前先明确五项声明）

| 项 | 内容 |
|---|---|
| MODE | 本次任务的反爬类别（见 §2 三分法）与目标字段（哪个参数/cookie/响应要还原） |
| TOOLS | 当前会话可用的引擎：`jsrev-chrome`（Chromium 断点/取证）与 `jsrev-firefox`（Camoufox 插桩）。MCP 面板可见即可用；不可用时走 §4 降级 |
| CLASS | 目标属于签名型 / 行为型 / 纯混淆（决定检测纪律，见 §2） |
| DELIVERY | 交付档位（见 §5 五级阶梯）在开工时的预估，随证据更新 |
| SUCCESS | 固定向量验证通过 + fresh replay 成功（见 §7 完成契约），其余一律不算成功 |

## 1. 授权与边界

- 仅服务授权目标的协议分析与可复现交付；用户须自行确保已获授权。
- 不做：撞库、盗号、批量注册、规模化爬取、绕过宿主安全策略。
- 交付永远包含"什么没做完"的诚实声明（§7）。

## 2. 反爬三分法与引擎路由（先分类，再动手）

| 类别 | 特征 | 检测纪律 | 首选引擎 |
|---|---|---|---|
| **签名型**（RS/AK 等） | 参数由 JS 计算后随请求发送；有严格环境一致性校验 | **禁 Proxy hook（会被检测）、禁环境篡改**；只允许源码级插桩（AST 改写）或引擎层观测 | firefox 引擎（源码插桩 / 透明探针）+ chrome 引擎（只读取证） |
| **行为型** | 轨迹/时序/交互指纹（滑块轨迹、鼠标熵） | 可用常规 hook；重点在轨迹还原与加密参数 | firefox 引擎 |
| **纯混淆** | 无环境校验，只是代码难读 | 无特殊禁令；AST 反混淆 + 断点 | chrome 引擎（真断点最快） |

**引擎分工原则**：
- 要**断点、单步、暂停态求值、网络/WS 全量取证、initiator 追溯** → `jsrev-chrome`（Chromium，真调试器）。
- 要 **JSVMP 插桩、AST 源码级 tap、环境指纹采集、反指纹浏览、引擎层属性追踪** → `jsrev-firefox`（Camoufox）。
- 两个都可用时按场景换着打：chrome 取证 → firefox 插桩 → 离线还原（§4 Core Loop）。
- **body-only 签名判别**：若签名只依赖请求体（无环境一致性校验、无反调试迹象），chrome 只读取证 + 源码定位即可闭环，不必动 firefox 插桩；注意"只依赖 body"须实测确认——部分签名会掺入站点域名等环境因子（换 host 重算对比即可判别）。
- 两引擎各自的**完整用法、能做/不能做禁令、换手协议、降级矩阵**：[references/engine-guide.md](references/engine-guide.md)（确定引擎路由后读对应章节）。
- 确切工具名（含参数）见 [references/tool-matrix.md](references/tool-matrix.md)——skill 层只用上表的中性能力名，不写死工具名。

## 3. 能力自检（CHECK 三项，开工复述一次）

1. **CHECK-1 引擎可用性**：SessionStart 已注入体检结果；不确定就先调一个零副作用工具（如页面信息查询）确认 server 存活。chrome 引擎未构建 / firefox 缺 pip 依赖时按 `/jsrev:doctor` 的指引修复，并在 MODE 里声明降级路径。
2. **CHECK-2 经验库速查**：动手前先查本 skill 的 knowledge/、verticals/ 与案例库（§9），命中相似场景则复用其踩坑表与禁动清单，不要从零开始。
3. **CHECK-3 方案意图声明**：一句话说清"我将用哪条路径还原哪个字段、预期交付档位、判定测试是什么（能否无浏览器 Docker 跑 24 小时）"。说不清就先做 §4 的第 1-2 步。
4. **CHECK-4 工具陷阱对表**：`search_in_sources` 对压缩单行 bundle 已按出现次展开（每条带 0-based `columnNumber`，单行文件时可直接作 `get_script_source` 的 `offset`）；命中数与预期不符时用 `save_script_source` 落盘本地 grep 交叉验证。取证导出（`outputFile`）只落字节、不自动登记 jsonl——用 `jsrev evidence` 补登记（见 §7）。

## 4. Core Loop（五步循环，证据先行）

1. **证明真实请求**：先用取证能力抓到目标请求的完整样本（URL/headers/body/响应），落盘到证据工作区。没抓到样本之前不动手分析。
2. **分类移动状态**：按 §2 定类别，识别请求间动态变化的字段（哪些是时间戳、哪些是签名、哪些是服务端下发）。
3. **定位变更点**：签名型优先源码搜索 + 插桩；行为型优先 hook 追踪输入；混淆型优先真断点。每一步的观察结果写进 runtime evidence。
4. **离线重建**（沿五级阶梯，见 §5）：优先复用站点自己的代码——`jsrev webpack <chunk.js> --find <关键词> --call <模块id>` 可在 Node 沙箱引导打包 chunk 并直接取得其签名/加密函数（`--url` 须与目标同域，签名常掺入域名因子）；纯手工重写只留给小算法。逐步替换浏览器。
5. **证明可重复性**：固定向量（固定输入 → 期望输出）parity 通过 + fresh replay（新时间戳、真实流程）成功。两者都过才算闭环。

## 5. 交付阶梯（DELIVERY 五级，由低到高）

1. **pure Python/Node**：全协议离线复现（最优先目标）。
2. **Python/Node + small JS**：极小的 JS 片段（如单个原生函数）经沙箱调用。
3. **+ small WASM**：目标使用 WASM 核心时。
4. **+ 插桩执行**：离线还原不经济时，用 firefox 引擎的插桩在受控浏览器内计算参数。
5. **blocked**：明确写卡点（缺什么、试过什么、为什么不行）。

逐级向上要给出理由：为什么当前档位不够、上一档的额外成本是什么。

## 6. 检测不变量（任何引擎操作前对照）

- **chrome 引擎**：零 JS 注入反检测、零 config flag hack、CDP 能力延迟激活——这是被验证过的不变量，不要试图"加 stealth 脚本"。
- **签名型目标 + firefox 引擎**：只用透明探针/源码级插桩；Proxy 式 hook 与环境篡改默认禁用（可被检测），确要使用必须在 MODE 声明风险并经用户确认。
- **串行纪律**：同一时间只用一个浏览器工具家族持有 live target；切换引擎前保存基线（页面状态、已捕获请求、hook 状态）并记录可复现性。
- 断点暂停时间过长会被风控标记：暂停态操作要快，取证要一次到位。

## 7. 证据工作区与完成契约

**Evidence Contract** — 所有产物落 `js_reverse_cache/tasks/<task-id>/`（或 `JSREV_HOME` 指定的根）：

```
tasks/<task-id>/
├── task.json                 # 任务声明（目标、类别、交付档位）
├── network.jsonl             # 请求/响应证据（脱敏后）
├── runtime-evidence.jsonl    # hook/插桩/断点观察流水
├── handoff.json              # 阶段交接（schema 见 references/evidence-schemas.md）
├── fixtures/                 # 固定向量（input/expected/source）
└── report.md                 # 结构化报告（§7 契约自检的载体）
```

最小 schema 见 [references/evidence-schemas.md](references/evidence-schemas.md)。用 `/jsrev:task <name>` 初始化骨架。

**落盘纪律**：产物写盘一律走宿主 Write/Edit 或引擎 save 类工具（`save_script_source`、取证 `outputFile`），不要用 Bash 内联脚本写文件——宿主安全钩子会拦截并打断流程。引擎导出的文件不自动登记证据流水：用 `jsrev evidence <task> <file> [--kind network] [--note <text>]` 补登记进对应 jsonl。

**Completion Contract** — 宣称完成必须同时满足：
1. 请求契约成立：离线路径能产生与真实请求等价的参数（字段级对照）。
2. 动态字段全部来自程序生成，无硬编码、无"从内存里拿一次"。
3. helper 边界最小化（用了什么 JS、为什么不能去掉）。
4. 固定向量 parity 证明（fixtures/ 中至少 2 组，含边界值）。
5. fresh replay 成功记录（新时间戳走真实流程）。
6. 残余风险与未竟事项如实列出。

**以下一律不算完成**：HTTP 200、token 长度合理、helper 加载成功、单次看似成功、只有观察没有离线复现。

## 8. 技术红线（违反即返工）

1. 签名型目标禁 Proxy hook 与环境篡改（除非按 §6 声明并确认）。
2. cookie/签名值禁止硬编码进交付物。
3. 不跳级：没固定向量就宣布成功 = 未完成。
4. 不混用引擎假设：chrome 与 firefox 的指纹、native code 格式、行为差异要显式处理（见案例库）。
5. 交付前跑 `/jsrev:doctor` 自检（可选但推荐），确认证据工作区完整。

## 9. References 索引（按需加载）

| 文件 | 内容 |
|---|---|
| [references/tool-matrix.md](references/tool-matrix.md) | 中性能力 → 双引擎工具名映射 + 旧名迁移表（人读视图；机器版 tool-matrix.json 由脚本从 live server 实采生成，doctor 对撞做漂移检测） |
| [references/engine-guide.md](references/engine-guide.md) | **双引擎使用规范**：路由决策表、各自用法/配方、能做/不能做禁令、换手协议、降级矩阵 |
| [references/evidence-schemas.md](references/evidence-schemas.md) | task.json / network.jsonl / runtime-evidence.jsonl / handoff.json / 固定向量最小 schema |
| [knowledge/invariants.md](knowledge/invariants.md) | **检测不变量总纲**（三源合一：chrome 五原则 + firefox 签名型禁令 + 串行纪律）——引擎操作前必读 |
| [knowledge/crypto.md](knowledge/crypto.md) | 加密模式识别与还原：固定输入循环纪律 + MD5/HMAC/AES/DES/RSA/Base64/XOR 双语言实现 |
| [knowledge/env-patch.md](knowledge/env-patch.md) + [env-patch-jsdom.md](knowledge/env-patch-jsdom.md) | 最小补环境总纲 + jsdom 15 类补丁深度篇 |
| [knowledge/hooks.md](knowledge/hooks.md) | 13 种页面 Hook（cookie 只用原型链级写法；`jsrev hookgen` 可生成） |
| [knowledge/obfuscation.md](knowledge/obfuscation.md) / [anti-debug.md](knowledge/anti-debug.md) | 混淆识别与 AST 反混淆 / 7 类反调试检测与对策 |
| [knowledge/anti-patterns.md](knowledge/anti-patterns.md) | 12 条三段式反模式（Temptation/Correct move/Self-check） |
| [knowledge/protocol-analysis.md](knowledge/protocol-analysis.md) / [troubleshooting.md](knowledge/troubleshooting.md) | TLS/h2 协议层对抗 + 六步排查与签名对比链 |
| [knowledge/workflow-contracts.md](knowledge/workflow-contracts.md) | 交付契约（交付档位/Proof Manifest/固定向量/报告模板/iv8 降级说明） |
| [knowledge/experience-rules.md](knowledge/experience-rules.md) | 30 条经验法则 + 错误处理降级梯度 |
| [knowledge/public-proof.md](knowledge/public-proof.md) | 公开证明工具（`jsrev proof` 三脚本） |
| [verticals/jsvmp.md](verticals/jsvmp.md) | JSVMP 完整方法论：识别 → 双路径决策 → 源码插桩盲区 → 健康诊断 → 陷阱 |
| [verticals/path-a.md](verticals/path-a.md) / [path-b.md](verticals/path-b.md) | 路径 A：hook 四板斧 / 路径 B：补环境六步法 |
| [verticals/debugger.md](verticals/debugger.md) | chrome 引擎真断点调试配方（签名定位 10 步 + 网络取证） |
| [verticals/captcha/](verticals/captcha/captcha-routing.md) | 验证码域：11 家族路由 + 10 篇实战 profile + 6 个回归脚本 |
| [cases/](cases/README.md) | 4 个实战案例（踩坑表/禁动清单/UA 分支矩阵，旧工具名已按迁移表映射） |
| `scripts/` | 3 个零依赖 Python 证明脚本（crypto_fingerprint / protocol_diff / public_proof_lab） |
| `cli/`（`jsrev` 命令行） | doctor / task / **evidence 登记** / crypto identify / hookgen / sandbox / **webpack chunk 离线引导**（§4 第 4 步的脚手架） / proof / handshake |

> 来源：knowledge/ 与 verticals/ 为四项目知识的蒸馏合并版（来源 lineage 见各文件头，覆盖对照见 docs/knowledge-coverage.md）；jsvmp、captcha、debugger 为垂直域深读篇，进阶任务再加载。
