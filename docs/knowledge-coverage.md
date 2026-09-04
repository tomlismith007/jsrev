# 知识融合覆盖对照表（四项目 → jsrev skill）

> 生成：2026-08-30 · 用途：验证"四个项目的知识真正融合蒸馏"。每一份源知识文件都必须有去向：**合并蒸馏**（有 jsrev 落点）或**有意取代**（被更好的形态替代，注明理由）。行数为源文件实测行数。

## C：hello_js_reverse_skill（references 18 篇 / cases 6 / scripts 4 / templates 5）

| 源文件 | 行数 | 去向 | 形态 |
|---|---|---|---|
| references/crypto-patterns.md | 424 | knowledge/crypto.md（与 D 版合并：D 纪律为 §0 总纲，C 实现为主体） | 合并蒸馏 |
| references/environment-patch.md | 401 | knowledge/env-patch.md（与 D 版合并：D 入场条件/vm 警告为总纲） | 合并蒸馏 |
| references/jsdom-env-patches.md | 915 | knowledge/env-patch-jsdom.md（15 类补丁代码全保留，叙述压缩） | 合并蒸馏 |
| references/hook-techniques.md | 519 | knowledge/hooks.md（与 D browser-hook 合并；**cookie 只保留原型链级**，实例级废弃并注明根因） | 合并蒸馏 |
| references/jsvmp-analysis.md | 641 | verticals/jsvmp.md（与源码插桩篇合并为完整双路径方法论） | 合并蒸馏 |
| references/jsvmp-source-instrumentation.md | 424 | verticals/jsvmp.md | 合并蒸馏 |
| references/path-a-four-tools.md | 434 | verticals/path-a.md | 合并蒸馏 |
| references/path-b-env-emulation.md | 579 | verticals/path-b.md（jsdom-env-patches 死引用已改指 jsrev 路径） | 合并蒸馏 |
| references/obfuscation-guide.md | 198 | knowledge/obfuscation.md（D 适用边界/失败模式表作导读） | 合并蒸馏 |
| references/anti-debug.md | 341 | knowledge/anti-debug.md（新增引擎/类别边界节） | 合并蒸馏 |
| references/common-pitfalls.md | 271 | knowledge/anti-patterns.md（与 D 10 条去重合并为 12 条三段式） | 合并蒸馏 |
| references/experience-rules-full.md | 332 | knowledge/experience-rules.md（30 条全收 + 原编号对照；session 系 4 条删除） | 合并蒸馏 |
| references/protocol-analysis.md | 273 | knowledge/protocol-analysis.md（代理池代码按范围边界裁剪） | 合并蒸馏 |
| references/troubleshooting.md | 233 | knowledge/troubleshooting.md（工具速查表按迁移表全量重建） | 合并蒸馏 |
| references/workflow-overview.md | 182 | SKILL.md §4 Core Loop + §5 交付阶梯（骨架形态） | 有意取代 |
| references/phase-details.md | 589 | SKILL.md（Startup Gate/Contract 骨架）+ references/evidence-schemas.md（v2.9 遗留漂移文档，session/assertion 机制已死） | 有意取代 |
| references/mcp-cookbook.md | 623 | references/tool-matrix.md（能力矩阵）+ 各 verticals 配方（camoufox 工具操作手册，工具名三层漂移，按能力重组） | 有意取代 |
| references/mcp-tool-reference.md | 289 | references/tool-matrix.md（同上；迁移表吸收其旧名映射职能） | 有意取代 |
| cases/（4 案例 + README + _template） | 1,840 | cases/（整篇迁移，旧工具名按迁移表机械替换；README 重写、_template 保留可验证事实清单） | 合并蒸馏 |
| scripts/crypto-identifier.js | 291 | cli/vendor/crypto-identifier.js → `jsrev crypto identify` | 合并蒸馏 |
| scripts/hook-generator.js | 346 | cli/vendor/hook-generator.js（**修复**：cookie 原型链、target 注入防护、Function Proxy、stealth 出组合包） | 合并蒸馏 |
| scripts/sandbox-runner.js | 359 | cli/vendor/sandbox-runner.js → `jsrev sandbox` | 合并蒸馏 |
| scripts/check-deps.sh | 116 | cli/jsrev.mjs `doctor`（Node 重写：补 MCP 握手、跨平台） | 合并蒸馏 |
| templates/（5 个项目模板 1,613 行） | 1,613 | 未平移（脚手架模板，按需从原仓取用；融合期 feature freeze） | 暂缓（登记） |

## D：trace（references 13 篇 + captcha 10 篇 / scripts 9 / evals 1）

| 源文件 | 行数 | 去向 | 形态 |
|---|---|---|---|
| SKILL.md（124 行契约骨架） | 124 | skills/jsrev/SKILL.md（Startup Gate / Core Loop / Evidence Contract / Completion Contract） | 合并蒸馏 |
| references/workflow.md | 54 | knowledge/workflow-contracts.md（handoff.json schema） | 合并蒸馏 |
| references/delivery.md | 45 | knowledge/workflow-contracts.md（5 档 + Proof Manifest + Acceptance Rules） | 合并蒸馏 |
| references/evidence.md | 43 | knowledge/workflow-contracts.md + references/evidence-schemas.md（固定向量 schema） | 合并蒸馏 |
| references/report-template.md | 80 | knowledge/workflow-contracts.md（报告 5 段模板） | 合并蒸馏 |
| references/iv8-basics.md | 37 | knowledge/workflow-contracts.md §6（**iv8 降级**：无内置后端，由 firefox 引擎 instrumentation 承载或记 blocked） | 合并蒸馏 |
| references/anti-patterns.md | 83 | knowledge/anti-patterns.md（10 条为主体与 C 6 条去重） | 合并蒸馏 |
| references/ast-deobfuscation.md | 48 | knowledge/obfuscation.md（边界/失败模式表作导读） | 合并蒸馏 |
| references/env-patch.md | 42 | knowledge/env-patch.md（总纲）+ env-patch-jsdom.md | 合并蒸馏 |
| references/browser-hook.md | 64 | knowledge/hooks.md（fetch/XHR 观察器为带栈变体；cookie 观察器按原型链裁决废弃） | 合并蒸馏 |
| references/browser-observe.md | 32 | knowledge/invariants.md（Sequential Tool Rule） | 合并蒸馏 |
| references/captcha-routing.md | 43 | verticals/captcha/captcha-routing.md（中文化重写 + 依赖总表 + 降级说明） | 合并蒸馏 |
| references/captcha/（10 篇 profile） | 2,837 | verticals/captcha/（路径修复核对、外部引用标注、敏感常量原样保留 D7） | 合并蒸馏 |
| references/public-proof-tools.md | 22 | knowledge/public-proof.md | 合并蒸馏 |
| references/crypto-patterns.md | 59 | knowledge/crypto.md（§0 纪律总纲） | 合并蒸馏 |
| scripts/crypto_fingerprint.py 等 3 个 | 244 | skills/jsrev/scripts/ → `jsrev proof` | 合并蒸馏 |
| scripts/captcha/ 6 个 GT4 | 2,551 | verticals/captcha/scripts/（2 个 Node-helper 脚本标注"开箱不可运行"降级） | 合并蒸馏 |
| evals/trigger-evals.json | 62 | evals/trigger-evals.seed.json（15 条种子，M3 扩容至 ≥25） | 合并蒸馏 |

## A：camoufox-reverse-mcp（引擎 + 工程件）

| 源 | 去向 | 形态 |
|---|---|---|
| src/camoufox_reverse_mcp（5,075 行 Python + 1,216 行 hooks JS） | engines/firefox/（vendor + launch_server.py 启动器 + requirements.txt） | vendor |
| 休眠工具 analyze_cookie_sources | server.py 补一行 import 激活（36 工具） | 修复 |
| docs/JSVMP_PLAYBOOK.md（130 行，全篇旧名） | 不迁移（GD-5：知识已在 C，双份必漂移） | 有意丢弃 |
| compare_env / instrumentation / 透明探针等方法学 | knowledge/invariants.md + verticals/jsvmp.md（作为纪律来源被引用） | 合并蒸馏 |

## B：js-reverse-mcp（引擎 + 工程件）

| 源 | 去向 | 形态 |
|---|---|---|
| src/（13,192 行 TS，24 工具） | engines/chrome/（快照 1a95d9c，keyboard.ts 剔除） | vendor |
| docs/anti-detection-work.md 五原则 | knowledge/invariants.md（总纲第一源） | 合并蒸馏 |
| SERVER_INSTRUCTIONS 路由纪律 | verticals/debugger.md（新写篇的权威素材） | 合并蒸馏 |
| evals/tool-routing.json 结构（30 条） | evals/（结构复用，语料按双引擎分工重写——M3） | 结构继承 |
| scripts/generate-docs --check 机制 | GF-1 文档一致性 CI 的蓝本（M2） | 结构继承 |

## 交叉核验记录

- 全库旧工具名 grep（22 个旧名，排除迁移表本身）：**0 命中**（2026-08-30 复核）
- 违规话术 grep（拒绝即失职/全力协助/safety filter）：**0 命中**
- 案例库 1,840 行、captcha 域 2,837 行、jsdom 深度篇 915 行的可执行代码与踩坑表：逐代理汇报确认保留
- 未平移登记：C 的 templates/（1,613 行脚手架，按需取用）；其余源知识 100% 有去向
