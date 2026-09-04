# 事件复盘登记表（Incident Log）

> 范围：jsrev 融合全程（M0→M2 + 三轮审查）。用途：评估事件——每个事件必须留下「处置」与「沉淀」，同类事件不得二次踩坑。

| # | 事件 | 根因 | 处置 | 沉淀（进了哪里） |
|---|---|---|---|---|
| I1 | 并发代理 5 个蒸馏任务 3 个被并发上限挤掉 | 用户并发额度限制 | 改为最多 2 并发排队执行，全部补跑完成 | 流程：多代理批次 ≤2 |
| I2 | robocopy 中文路径 rc=16 拷贝失败 | robocopy 对中文/UNC 参数处理 | 改 git bash 选择性 cp | — |
| I3 | Bash cp 拷贝源码被 Mimosa hook 拦截 | hook 视 Bash 写源码为绕过扫描 | 改走 Read+Write 合规通道 | 通道纪律：源码移动用 Read+Write |
| I4 | git commit（trace 备份与 jsrev 初始提交）被 Mimosa 强制拦截 | 工作区扫描发现 16 high（全部为逆向工具领域固有模式，且存在于 vendor 之前的原仓） | 暂缓提交；triage 方案落 DECISIONS.md；trace 用 tar 归档兜底 | 待办：用户拍板 triage 后补提交 |
| I5 | cli/vendor 脚本按 ESM 解析报 `require is not defined` | cli/package.json 误写 `"type": "module"` | 删除该字段（.mjs 按扩展名本就是 ESM） | 新建 package.json 不加 type 除非确需 |
| I6 | `jsrev crypto identify` 把子命令名当密文、`hookgen cookie` 不识别 | CLI 包装层与 vendor 参数协议不匹配 | 包装层剥子命令/翻译 `--type=`；vendor 解析器升级为兼容两种形式 | 包装器必须做集成测试（当时漏了首跑） |
| I7 | hookgen `--target x` 分离传参 FILTER 变空串 | vendor 只解析 `--key=value` 连写形式 | 解析器升级兼容分离形式；注入防护实测（含单引号） | 同上 |
| I8 | 重写会话层后 `p.resolve is not a function` | pending 条目存 `{res,rej}` 而泵调 `p.resolve` | 统一为 `{resolve,reject}`；以 doctor 握手做回归 | 重写比修改风险更高——回归电池必须先跑 |
| I9 | cloud 同步桌面目录「删除后 existsSync 仍 true」 | 同步盘删除延迟/墓碑 | e2e-loop 改用时间戳唯一 task id；CLI 拒绝覆盖证据的行为被确认为正确 | 测试不要与 FS 时序对抗，改设计绕开 |
| I10 | Camoufox 拒绝 `LANG=C.UTF-8`（Invalid locale: 'C'） | 最小 shell 环境的 locale 传入指纹系统 | 启动器 `_sanitize_locale()` 清洗为 en_US.UTF-8；firefox-e2e 验证 | GD-1.1（DECISIONS） |
| I11 | 导航后立即 evaluate_script 报 stale context | 上游执行上下文句柄随导航失效 | 重试即恢复；写入 debugger.md §5 | 循环验证才能暴露的集成边角 |
| I12 | tool-matrix 种子给 chrome 写了不存在的 `get_network_request` | 人工种子凭记忆写清单 | 勘误；催生 H1 完备性对撞 + live 生成矩阵（GB-1） | 根治：人不再手写工具名 |
| I13 | `intercept_request` 漏出工具矩阵 | 人工种子不全 | H1 对撞抓到后补全 | 同上 |
| I14 | firefox evaluate_js 传函数返回 null | A 引擎吃表达式不吃函数 | e2e 改表达式；错误由自检「固定向量」项拦截 | 双引擎参数语义差异进 engine-guide §3.5 |
| I15 | firefox 工具返回 dict 无 structuredContent | FastMCP 文本内容 vs B 自定义 outputSchema | 会话层兜底解析文本 JSON；全部调用方受益 | 单点会话层修一处全体受益 |
| I16 | camoufox fetch GitHub 直连读超时 | 网络路径问题 | 检测本机 7897 代理端口 → 走代理下载成功 | doctor 提示语补充"下载可走代理，运行不需要" |
| I17 | doctor 漂移检测读矩阵报 `readFileSync is not defined` / 对比对象未取 name | 新增检查的导入与类型疏漏 | 修导入 + `map(t => t.name)`；负向测试（注入假工具名被拦）确认机制有效 | 新检查必须跑正负两个用例 |
| I18 | 一致性审计自身两处误报（链接扫进代码块 / hooks 路径双拼） | 审计脚本粗糙 | 剔代码围栏、修路径拼接 | 审计脚本自身的 FAIL 也要先自查 |

## 装机后首任务复盘（2026-08-30，QQ音乐 sign/榜单闭环）

| # | 事件 | 根因 | 处置 | 沉淀（进了哪里） |
|---|---|---|---|---|
| I19 | `search_in_sources` 对压缩单行 bundle 每脚本只回首个命中（totalMatches=1），定位 `_getSecuritySign` 定义时误判"不在 vendor.chunk"，绕行 4-5 次调用 | CDP `Debugger.searchInContent` 按行返回，minified 整文件一行即折叠 | v4.0.4：`DebuggerContext` 逐出现次展开（0-based `columnNumber` + 命中居中窗口 + 行内命中上限 200），`columnNumber` 可直接作 `get_script_source` 的 `offset` | SKILL §3 CHECK-4 陷阱对表 + tool-matrix 备注 |
| I20 | doctor 从插件根跑时 workspace 校验的是 cache 目录的 `js_reverse_cache`，与 task 实际使用的工作区不一致 | commands/doctor.md 写"from the plugin root"，与 task 的 `$JSREV_HOME‖CWD` 语义冲突 | doctor.md/task.md 改为"项目根 + 插件内绝对路径调用" | 同一根解析纪律：`JSREV_HOME‖CWD/js_reverse_cache`，两命令共用 |
| I21 | task.json 的 `delivery_target` 枚举为 python 系（pure-python|py+js…），Node 任务写不出合法值 | CLI 骨架沿袭旧 Python 命名，与 SKILL §5 语言中性阶梯脱节 | 枚举改 `pure|+js|+wasm|+instrumented|blocked`（CLI + evidence-schemas 双同步） | 枚举命名跟随阶梯文档，语言中性 |
| I22 | 引擎导出（`list_network_requests outputFile`）只落字节，不自动登记 network.jsonl，需手工补引用行 | 引擎导出路径无证据流水感知 | 本轮新增 CLI `jsrev evidence <task> <file> [--kind] [--note]` 补登记；引擎侧"返回现成 jsonl 行"列为 U6 | 证据文件落盘与登记分离，登记走 CLI 统一通道 |
| I23 | webpack chunk 离线引导无脚手架，QQ 任务手搓 mini-webpack（vm+假 require） | CLI 只有通用补环境 sandbox-runner，无 chunk 引导探针 | 新增 `cli/vendor/webpack-boot.js` + `jsrev webpack`（`--find/--call/--export/--args/--stub/--url/--show`），以 QQ vendor.min.js 实测：一步定位模块 412 并取得 sign 函数 | §4 第 4 步离线重建优先复用站点 chunk（SKILL §4/§9） |
| I24 | webpack-boot 首测 `sign("test")` 与页面不符（example.com 环境）——QQ 音乐 sign 掺入**站点域名**因子，原报告"仅 body"表述不完整 | 混淆 VM 对 host 有入签；路径/UA/cookie/时间戳不参与 | 三组对照定性（y.qq.com 两路径同值、example.com 不同值）；`qq_toplist.mjs` 固定 y.qq.com location 被确认为必要条件；task 报告事实 3/9 已修正 | "body-only"判别必须换 host 重算实测（SKILL §2 新增判别行） |
| I25 | Bash 内联脚本写 .js 产物再次被 Mimosa 拦截（I3 重演，含 cp 镜像源码/build 产物） | hook 对 Bash 写源码/生成码一律视为绕过扫描 | 全部改走 Write/Edit（同串 Edit 镜像三方副本）+ `tsc --outDir` 直出产物 | I3 沉淀升级：镜像同步用"同串 Edit"，生成产物用编译器 outDir 直出，不与钩子对抗 |

## 未决事件（不阻塞安装，但挂账）

| # | 事项 | 状态 |
|---|---|---|
| U1 | Mimosa 16 high triage → git 首次提交 | 等用户拍板（DECISIONS.md 有逐条定性） |
| U2 | `~/.zcode/cli/config.json` 残留旧 `js-reverse` 独立 MCP（disabled） | 建议插件装载成功后删除该条目，避免双轨混淆 |
| U3 | GB-3 A 引擎信封/错误码对齐（第一批导出类工具） | M2 剩余项，代码手术单独一轮 |
| U4 | C templates/ 1,613 行脚手架暂缓平移 | 按需从原仓取用 |
| U5 | 评测 live 打分模式（需模型会话） | M3 |
| U6 | 引擎导出工具直接返回现成 jsonl 登记行（I22 的引擎侧终解） | 下一轮引擎手术与 U3 同批 |
