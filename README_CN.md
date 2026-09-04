# jsrev

面向 coding agent 的 JS 逆向工具包。一个插件载荷、双引擎、可验收交付。

> 仅限授权目标。用户须自行确保对目标已获授权。不服务撞库、盗号、批量注册、规模化爬取。

## 载荷构成

| 组件 | 路径 | 用途 |
|---|---|---|
| Chrome 引擎 MCP | `engines/chrome/` | Chromium 真断点、网络/WS 取证（vendor 自 js-reverse-mcp v4.0.3，Apache-2.0，快照 `1a95d9c`） |
| Firefox 引擎 MCP | `engines/firefox/` | Camoufox 反指纹浏览、Hook/AST 插桩、JSVMP 探针（vendor 自 camoufox-reverse-mcp v1.2.0） |
| Skill | `skills/jsrev/` | 方法论路由器：反爬分型 → 引擎路由 → Core Loop → 交付阶梯 → 完成契约 |
| Hooks | `hooks/session-start.mjs` | 引擎体检（doctor-lite），结果注入会话上下文 |
| Commands | `commands/` | `/jsrev:doctor`（完整诊断）、`/jsrev:task`（证据工作区脚手架） |
| Evals | `evals/` | 触发评测 29 条（双语含合规负样本）+ 双引擎路由评测 10 条 + 校验器 |

设计文档：[fusion-analysis.md](docs/fusion-analysis.md)（源审计）· [fusion-plan.md](docs/fusion-plan.md)（缺口驱动规划）· [docs/DECISIONS.md](docs/DECISIONS.md)（决策记录）。

## 安装（ZCode / Claude Code）

1. **Chrome 引擎**（调试器 server 必需）：

   ```shell
   cd engines/chrome
   npm install
   npm run build
   ```

2. **Firefox 引擎**（插桩 server；不需要可禁用 `jsrev-firefox`）：

   ```shell
   pip install -r engines/firefox/requirements.txt
   camoufox fetch        # 下载 Camoufox 浏览器内核（约 300 MB，显式步骤）
   ```

3. **启用插件**（ZCode：本地插件装载 / 市场条目；Claude Code：从本目录安装插件）。双 MCP（`jsrev-chrome`、`jsrev-firefox`）声明于 [.mcp.json](.mcp.json)，自动从插件根启动。

4. 可选用户配置：`jsrev_home`（证据工作区根覆盖；默认项目内 `./js_reverse_cache/`）、`firefox_proxy`（传给 Camoufox 引擎的 HTTP 代理）。

5. 验证：新开会话——SessionStart hook 会报告引擎状态；跑 `/jsrev:doctor` 看完整诊断，或直接：

   ```shell
   node cli/jsrev.mjs doctor
   ```

## CLI

```shell
node cli/jsrev.mjs doctor                        # 体检 + 双引擎真实 MCP 握手（chrome 24 / firefox 36 工具）
node scripts/mcp-probe.mjs chrome-e2e            # 真实拉起浏览器：开页→CDP 求值→网络采集→截图
node scripts/mcp-probe.mjs firefox-e2e           # 真实拉起 Camoufox：launch→navigate→evaluate→close
node scripts/e2e-loop.mjs chrome|firefox         # 闭环验证：脚手架→取证→固定向量+fresh replay→证据落盘→契约自检
node cli/jsrev.mjs task my-target                # 证据工作区脚手架（tasks/my-target/）
node cli/jsrev.mjs crypto identify "<样本>"       # 密文指纹
node cli/jsrev.mjs hookgen cookie                # 原型链级 cookie hook 代码
node cli/jsrev.mjs sandbox app.js                # 零依赖 vm 沙箱（加 --extract-cookie）
node cli/jsrev.mjs proof public_proof_lab --self-test
node scripts/run-evals.mjs                       # 评测校验（触发 29 条 + 路由 10 条）
node scripts/consistency-audit.py                # 13 项一致性检查
```

全部命令零依赖（Node ≥ 20.19）。`JSREV_PYTHON` 与 `JSREV_HOME` 环境变量可覆盖 python 解释器与工作区根。

## 宿主支持分级

- **Tier-1**：ZCode、Claude Code——完整载荷（双 MCP + skill + hooks + commands）。
- **Tier-2**：Cursor / Codex / OpenCode——MCP + skills，经 `jsrev install <host>`（规划中，M4）。
- **Tier-3**：任意可跑 shell 的 agent——CLI 通道 + skill 文档（规划中）。

## 目录结构

```
jsrev/
├── .zcode-plugin/plugin.json    # ZCode manifest（首选）
├── .claude-plugin/plugin.json   # Claude Code 镜像（保持同步）
├── .mcp.json                    # 双引擎 MCP 声明
├── hooks/  commands/  skills/jsrev/
├── engines/chrome  engines/firefox
├── evals/  docs/  scripts/
```

插件长命数据写宿主提供的数据目录（`ZCODE_PLUGIN_DATA`）；任务证据永远写项目工作区，不写回插件安装根。

## 许可

- `engines/chrome/`：Apache-2.0（见 `engines/chrome/LICENSE`；衍生自 chrome-devtools-mcp，Google LLC 版权 header 保留）。
- `engines/firefox/`：按上游声明为 MIT。
- 载荷/skill 代码：本项目私有使用。

私有使用项目，不发布市场。若未来公开，先执行 `docs/DECISIONS.md` 中的合规清单。
