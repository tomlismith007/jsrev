# 装机门禁报告（Install Readiness Review）

> 日期：2026-08-30 · 性质：实际安装前的最终门禁（用户要求：整体规划审查 + 全量审查监控 + 评估事件 + 查漏补缺之后，才实际安装）。
> 结论：**READY —— 有条件放行**。条件与 runbook 见 §5/§6。
> **安装结果（当日追加）：已安装成功。** 过程：UI 首次安装报 `Plugin source is invalid or unsupported: path`（类型名不存在）→ 读宿主源码 `resources/glm/zcode.cjs` 确认合法类型为 `directory/github/git/url/git-subdir` → 双份 marketplace.json 改为 `{source:"directory", path:<仓库绝对路径>}` → 因 CLI 无 install 命令，按宿主安装器记录结构执行 Option B 直接注册（快照 16,211 文件入 cache + installed_plugins 追加 + enabledPlugins 启用，注册文件备份于 `plugins/backup-20260830/`）→ `zcode plugins list` 识别 `jsrev@jsrev-local [enabled]`（skills 1 / commands 根 1 / hooks 1 / mcp 双引擎）→ **cache 快照自足性验证：chrome 24 工具、firefox 36 工具握手双 PASS**。剩余：新会话激活 hook/skill/MCP（快照语义）+ 宿主内 T1-lite 终验清单（§6）。

## 1. 全量验证电池（门禁当日实测）

| 项 | 结果 |
|---|---|
| 一致性审计（13 项：双 manifest/37 文件链接/.mcp.json 入口/schema-vs-CLI 对撞/显示名统一/hooks+commands/功能性旧引用/矩阵完备 60 工具/旧名隔离/实采矩阵对撞/代理链路/规范工具名） | **全 PASS** |
| 评测校验器（触发 29 条双语含合规负样本 + 路由 10 条） | **全 PASS** |
| jsrev doctor（9 项：node/python/依赖/chrome 握手/firefox 握手/camoufox 内核/legacy 退役/工作区/tool-matrix 漂移） | **9/9** |
| 闭环验证 chrome（脚手架→取证→固定向量+fresh replay→证据→契约自检） | **PASS** |
| 闭环验证 firefox（Camoufox launch→navigate 200→evaluate→cookies→close） | **PASS** |
| 无代理运行 firefox（clash 依赖性排除） | **PASS** |
| 漂移检测负向测试（注入假工具名被拦） | **PASS** |

## 2. 规划对账（fusion-plan v2.1）

### 2.1 验收锚点 T1-T7

| 锚点 | 状态 | 依据 |
|---|---|---|
| T1 一次安装 | **待终验**（本报告 §6 即终验步骤） | 装载机制已摸清（§5）；载荷自包含；doctor 就绪 |
| T2 正确触发 | **结构就绪**（skill 路由 + 评测 29+10 条）；live 打分留 M3 | run-evals validate 全过 |
| T3 契约一致 | **达成**（机器矩阵 live 实采 + doctor 漂移检测 + 负向测试通过；GB-3 信封对齐除外） | tool-matrix.json + doctor 9/9 |
| T4 可验收交付 | **达成**（schema + CLI 脚手架 + 双引擎闭环证据落盘实证） | e2e-loop 双 PASS |
| T5 本地多宿主可达 | **部分**（ZCode 路径摸清待装；Tier-2 安装器 M4） | §5 |
| T6 合规自洽（自用级） | **达成**（中性授权 + LICENSE 留存 + 边界声明；C 规避话术零带入——grep 0 命中） | consistency G + 话术扫描 |
| T7 可维护 | **达成**（审计 13 项 + 评测 + doctor + 闭环全部脚本化、可重复） | scripts/ 四件套 |

### 2.2 缺口对账（35 项）

- **已关闭 27**：GA-1/2/5/6/7、GB-1/2/4(部分→5/6)、GC-1/2/3/4/5/6/7/8/9/10、GD-1/1.1/5、GE-1/2/3、GF-3(脚本化)、GF-4(材料就绪)、GA-8、GE-4、D7
- **有意关闭**：GA-8（不发布市场）、GE-4（自用不裁决）
- **未关闭 6（均不阻塞安装）**：
  1. **GA-3 本地装载终验** —— 本报告 §6 就是终验
  2. **GA-4 Tier-2 安装器** —— M4
  3. **GB-3 A 信封/错误码对齐** —— 单独一轮代码手术
  4. **GC-8 live 打分** —— M3（需模型会话）
  5. **GF-2 三平台 CI 矩阵** —— 无远端 CI 前以本地脚本替代
  6. **GF-4 评测进 CI** —— 脚本就绪，等 git/CI 通道
- **暂缓登记 2**：GA-7 载荷裁剪（实测 2.75MB 无压力）、templates/ 平移

### 2.3 红线与决策门

- 18 条红线：**无违反**。本批新增代码全部为打包/验证/文档性质（红线 5 feature freeze 下的合规活动）；hooks 仅 SessionStart（红线 7）；数据边界未破（红线 17）。
- D1-D7：全部按拍板执行，无漂移。

## 3. 事件评估（详见 [INCIDENTS.md](INCIDENTS.md)）

全程登记 **18 个事件 + 5 个未决**。关键结论：
- 三类高频根因：①双引擎接口语义差异（I14/I15）→ 已由单一会话层 + engine-guide 收敛；②人工维护清单（I12/I13）→ 已由 live 生成 + 漂移检测根治；③环境差异（I9/I10/I16）→ 已由启动器/脚本设计吸收。
- 验证体系的每一次"抓到 bug"都发生在负向测试或闭环里——证明这套电池不是形式主义。
- 唯一挂账风险：git 提交被安全扫描拦截（U1）——不影响本地使用，只影响版本管理。

## 4. 查漏补缺（本轮补齐）

1. `marketplace.json` 创建（镜像官方 schema，本地 path source）——装载 Option A 的前提件；
2. README_CN 补 CLI 章节（与 README 对齐）；
3. PROJECT-GUIDE 树补 engine-guide.md / tool-matrix.json / 新脚本行；
4. 载荷预算实测 **2.75MB**（engines 1.9M + skills 732K + 其余 ~130K，不含 node_modules/build）——远低于任何宿主限制；
5. example-plugin checklist 对表：除 marketplace.json（本轮已补）与 name==dir（检查脚本自身 bug，实际目录名 `jsrev` 正确）外全 OK。

## 5. 装载机制摸底（ZCode 本地插件系统）

实测发现 `~/.zcode/cli/plugins/` 体系：`known_marketplaces.json` → `marketplaces/`（directory 源市场会被宿主**整仓快照拷贝**到此处）→ `installed_plugins.json`（installPath 指向 `cache/<marketplace>/<plugin>/<version>`）→ `cli/config.json` 的 `plugins.enabledPlugins`（键 `plugin@marketplace`）+ `mcp.servers`。

**插件 source 类型（从宿主源码 `resources/glm/zcode.cjs` 分发逻辑实读）**：`directory`（本地目录）/ `github`（repo）/ `git`（url）/ `url`（type=zip 需 sha256，或 git）/ `git-subdir` / 纯字符串路径（相对 marketplace 根或绝对路径）；`path`/`npm`/`pip` 为非法类型——**首次安装报 "Plugin source is invalid or unsupported: path" 即因类型名写错，正确名是 `directory`**。

**装载路径（已修正）**：
- `marketplace.json` 插件条目 source = `{"source": "directory", "path": "."}`（本地开发时曾用绝对路径——相对值按宿主进程 CWD 解析不可靠）；仓库根与宿主缓存副本（`~/.zcode/cli/plugins/marketplaces/jsrev-local/marketplace.json`）**两份都已改**。
- 用户已在 UI 注册 `jsrev-local` marketplace（宿主自动规范化为 directory 源并整仓快照）——**重试安装即可**。

## 6. 安装 Runbook（T1-lite 终验步骤）

1. **预清理**：确认 `cli/config.json` 的旧 `js-reverse` MCP 条目（disabled）——装载成功后建议删除，避免双轨。
2. **装载**：按 §5 Option A → 失败则 Option B（动注册文件前先备份三份 json）。
3. **启用**：`config.json.plugins.enabledPlugins` 出现 `"jsrev@jsrev-local": true`；新开会话（hooks 快照语义）。
4. **终验清单**：
   - [ ] 新会话 SessionStart 注入 jsrev 体检上下文（"all engines ready"）
   - [ ] Settings→MCP 可见 plugin-bundled 的 `jsrev-chrome`/`jsrev-firefox`（24/36 工具）
   - [ ] skill 触发：输入"帮我看看这个接口的 sign 怎么来的"→ 路由到 jsrev skill
   - [ ] `/jsrev:doctor` 在宿主内跑通（9/9）
   - [ ] `/jsrev:task` 建工作区 → 双引擎各跑一次真实取证 → 证据落 `tasks/<id>/`
   - [ ] 旧 hello skill 无触发竞争（已退役，负向确认）
5. **回滚**：Option B 的三份 json 备份还原 + 移除 cache 目录；Option A 移除 marketplace 即可。

## 7. 门禁判定

**放行安装**。未关闭的 6 项缺口均为增量能力（Tier-2/信封/live 打分/CI 矩阵），不影响"装得上、触发得了、跑得通"的 T1-lite 目标；已知环境事实（云同步目录时序、locale、代理下载路径）均已有设计性免疫。
