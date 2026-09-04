# jsrev 决策记录（M0）

> 日期：2026-08-30 · 依据：[fusion-plan.md](fusion-plan.md) v2.1（缺口驱动规划）+ [plugin-blueprint.md](plugin-blueprint.md)（模版分析）

## 已拍板决策

| # | 决策 | 结论 |
|---|---|---|
| D1 | B（js-reverse-mcp）处置 | **vendor 快照，个人二次开发**。不联系上游、不同步上游、vendor 后自由修改。目录内保留 Apache-2.0 原文件。 |
| D2 | 品牌与包名 | **`jsrev`**（kebab-case，= 插件目录名）；引擎保留原包名（chrome 引擎 npm 名暂沿用，发布时再定）。 |
| D3 | CLI 语言 | **Node**。 |
| D4 | 宿主优先级 | **ZCode + Claude Code 同时做**（双 manifest 边际成本≈0）。 |
| D5 | 证据工作区根 | **项目内 `./js_reverse_cache/` 默认**，`JSREV_HOME`（userConfig `jsrev_home`）整体覆盖。 |
| D6 | 载荷默认引擎集 | **双引擎 enabled** + server instructions 分工；瘦身档 = 用户在 MCP 面板禁用 firefox server。 |
| D7 | captcha 敏感常量 | **自用不发布，原样保留**；若未来公开需先三级裁决。 |

## 快照与冻结记录

| 项 | 状态 |
|---|---|
| B 快照 | `1a95d9c`（`v4.0.3-5-g1a95d9c`，2026-08-25），vendor 时剔除 `src/utils/keyboard.ts` 死代码 |
| A 冻结 | 原 repo tag `pre-fusion-freeze`（HEAD 92c822f，v1.2.0） |
| C 冻结 | 原 repo tag `pre-fusion-freeze` |
| trace 备份 | 原目录无 VCS；已建 `trace-backup-20260830.tar.gz` 归档；git commit 被安全扫描拦截（见下）待补 |

## M1 内已落地的裁决

| 项 | 裁决 |
|---|---|
| GD-1 A 的启动方式 | **vendor 源码 + `launch_server.py` 启动器**（`sys.path` 注入 + 预 import camoufox 防 asyncio 死锁），无需 pip 安装 A 本体；依赖经 `engines/firefox/requirements.txt` 安装。`JSREV_PROXY` 环境变量透传为 `--proxy`。 |
| GD-1.1 locale 清洗（e2e 发现） | 最小 shell 环境 `LANG=C.UTF-8` 会被 Camoufox 拒绝（`Invalid locale: 'C'`）——launch_server 启动前把无效 locale 清洗为 `en_US.UTF-8`。经 firefox-e2e 验证：launch → locale "en-US" → navigate example.com HTTP 200 → evaluate_js 返回页面标题 → close 无残留。 |
| GC-10 A 休眠工具 | **激活 `analyze_cookie_sources`**：vendored `server.py` 补一行模块导入（该工具实现完整，此前仅因未被导入而休眠）。 |
| GD-5 A 过时文档 | `docs/JSVMP_PLAYBOOK.md` 未迁移（全篇旧工具名 + 引用未注册工具，知识已在 C）。 |

## 安全扫描 triage 待办（阻塞 git commit）

Mimosa 工作区扫描在 commit 前报 16 high / 9 low。**全部命中均为逆向工具固有的领域模式**（JS 求值沙箱、子进程测试 runner、脚本搜索读取、示例加密模板），且全部存在于 vendor 之前的原始仓库（`js-reverse-mcp/scripts/run-tests.ts`、`camoufox-reverse-mcp/tools/jsvmp.py`、`hello_js_reverse_skill/scripts/sandbox-runner.js` 等），非融合引入。处置建议：

1. 逐条复核确认属"产品本体行为"而非可修复漏洞；
2. 以 Mimosa 的 triage/基线机制登记为 accepted-by-design；
3. 之后补 trace 的 git 备份 commit 与 jsrev monorepo 的初始 commit。

在 triage 完成前，本仓库暂无 git 提交（文件均已落盘，无丢失风险）。
