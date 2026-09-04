# chrome 引擎调试器垂直篇 — 真断点取证工作流

> lineage：**新写于 jsrev 融合项目 2026-08-30，素材为 chrome 引擎源码与文档**（`engines/chrome/src/main.ts` 的 SERVER_INSTRUCTIONS、`src/tools/debugger.ts` / `network.ts` / `websocket.ts` / `script.ts` 工具定义、`docs/anti-detection-work.md`、`docs/cdp-endpoint.md`、`README.md`）。四个源项目均无此内容，属新增知识。
>
> **触发条件**：需要真断点、单步、暂停态求值、网络/WebSocket 全量取证或 initiator 追溯（[../SKILL.md](../SKILL.md) §2 引擎路由指向 chrome 引擎时加载本文）。
>
> **适用边界**：仅限授权目标，用户须自行确保已获授权。
>
> **配套**：[jsvmp.md](jsvmp.md)（JSVMP 识别与 firefox 插桩路径）、[path-b.md](path-b.md)（环境伪装）、[../knowledge/invariants.md](../knowledge/invariants.md)（检测不变量，任何引擎操作前对照）、[../references/tool-matrix.md](../references/tool-matrix.md)（能力矩阵）。

---

## 1. 何时用 chrome 引擎

一句话分工：**chrome 引擎 = 真调试器取证面**（断点、单步、暂停态求值、网络/WS 全量取证、initiator 追溯）；**firefox 引擎 = 插桩与环境面**（JSVMP 插桩、源码级 AST tap、环境指纹采集、反指纹浏览）。路由决策见 [../SKILL.md](../SKILL.md) §2。

chrome 引擎独有且不可替代的能力（firefox 无真断点，伪断点用 hook 模拟）：

| 能力 | 工具 |
|---|---|
| 源码枚举/搜索/导出 | `list_scripts` / `search_in_sources` / `get_script_source` / `save_script_source` |
| 真断点（代码/XHR） | `set_breakpoint_on_text` / `break_on_xhr` / `list_breakpoints` / `remove_breakpoint` |
| 暂停态 | `pause_or_resume` / `step` / `get_paused_info` |
| 请求发起追溯 | `get_request_initiator` |
| 网络取证 | `list_network_requests`（列/查/导出三合一）/ `clear_network_requests` |
| WebSocket 取证 | `get_websocket_messages` |
| 运行时求值 | `evaluate_script`（页面/暂停帧/localFile 输入） |

本文所有工具名均为 chrome 引擎 24 个真实工具（v4.0.3 快照，`tools/list` 同源）。注意：**没有独立的 `get_network_request` 工具**——请求详情是 `list_network_requests` 的 `reqid` 参数模式（tool-matrix v0 静态种子中的 `get_network_request` 为陈旧名，以本文为准）。

---

## 2. 启动与接管

### 2.1 默认模式（推荐起点）

不带参数启动时：自动启动**系统 Google Chrome**（带 Web Store、扩展、sync），**有头模式写死**（`headless: false` 硬编码，不暴露 `--headless` flag——本引擎是给人看的视觉调试工具，headless 本身是 bot 信号）。默认 profile 持久化在 `~/.cache/chrome-devtools-mcp/chrome-profile`，cookies/localStorage 跨会话保留，适合"调试 → 复现 → 再调试"的长链条任务。

### 2.2 `--browserUrl`：接管既有浏览器

连接已运行的 Chrome/Edge/Chromium 的 **CDP HTTP 端点**（如 `http://127.0.0.1:9222`），MCP 自动探测 `/json/version` 拿 WebSocket debugger URL 后接管。

- **只认 CDP**：厂商私有 Local API（AdsPower `:50325`、BitBrowser `:54345`）、Bearer Token 鉴权端口一概不认。自检一行：`curl http://127.0.0.1:<port>/json/version` 返回含 `webSocketDebuggerUrl` 的 JSON 才是 CDP。
- 报 `Unexpected token 'N', "Not Found" is not valid JSON` = 端口指到了厂商管理 API 而非 CDP。
- 本地 Chrome 开调试端口：**必须先关掉所有已开的同款浏览器进程**（否则新命令被忽略），并**用专门的 `--user-data-dir`**，不要挂日常 profile。
- 指纹浏览器（AdsPower/BitBrowser）的 CDP 端口**每次启动随机变化**：先调厂商 Local API 启浏览器 → 从响应取 `debug_port` / `data.http` → 再拼 `--browserUrl`。完整脚本见 chrome 引擎 `docs/cdp-endpoint.md`。
- **`--browserUrl` 与 `--cloak` 互斥**（CLI 定义了 conflicts，二者不可同用）。

适用场景：需要目标已有的登录态/指纹环境、或接入 AdsPower 等指纹浏览器的现成环境做取证。

### 2.3 `--isolated`：一次性 profile

临时 user-data-dir，cookies/localStorage **不保留**，浏览器关闭自动清理。用于：排除持久 profile 残留状态污染（被反爬拦截时的第一排查步骤）、不想让调试痕迹落进默认 profile 的任务。

### 2.4 `--allowedRoots`：本地文件沙箱（建议始终配置）

可重复指定（`--allowedRoots /workspace --allowedRoots /tmp/captures`），约束所有本地文件读写（`save_script_source` / `outputFile` / `localFilePath`）：

- roots 在启动时**解析为真实路径**（realpath），运行期**符号链接逃逸被拒**；
- 配置后 `file:`、`view-source:file:`、`filesystem:file:` 浏览器页面**整体禁用**（防止用浏览器导航绕过目录边界——要调试本地页面只能在不配置该选项的会话里做）；
- 未配置时本地文件访问不受限，启动时打印安全警告。

所有导出文件的 `confirmOverwrite` 只在覆盖**已存在**文件时需要，新文件不需要。

### 2.5 `--cloak`：指纹补丁内核（按需）

用 CloakBrowser 定制 Chromium 替换系统 Chrome，加**源码层 C++ 指纹 patch**（canvas/WebGL/audio/GPU/字体/屏幕/WebRTC/TLS/navigator.webdriver），指纹身份按 profile 用 `<profile>/.cloak-seed` 持久化。**首次启动自动下载 ~200MB 二进制（约 30-60 秒，期间 MCP 看起来像卡住）**——提前 `npx cloakbrowser install` 预下载。代价：无 Google 服务/Web Store；与默认模式 profile 物理隔离。只在默认 Patchright 协议层 stealth 不够、被站点指纹拦截时启用。

### 2.6 `--logFile`

写 `0600` 普通文件的调试日志。详细日志用 `DEBUG=mcp:*`；**绝不要 `DEBUG=*`**——浏览器协议日志可能泄露页面、Cookie、脚本和凭据。

---

## 3. 签名定位标准配方（核心章节）

目标：从"某个请求带了签名参数"出发，定位生成签名的函数与入参。逐步骤执行，每步的真实参数语义均已从源码确认。

**前置（导航纪律）**：CDP 域在页面加载期间刻意静默（见 §6），所以标准序列是——`new_page(url)` 静默导航过风控 → 任意非导航工具调用激活 collectors → `navigate_page(type="reload")` 带采集重放。加载期间的请求/脚本/WS **不会被收集**，这是设计而非缺陷。

### Step 1 — 找到目标请求

```
list_network_requests(urlFilter="<端点路径片段>", resourceTypes=["xhr","fetch"], methods=["POST"])
```

- 不带 `reqid` 即列表/过滤模式，默认每页 20 条（`pageSize`/`pageIdx` 翻页）；
- 过滤器之间 AND，同一过滤器的多个值之间 OR（如 `methods=["GET","POST"]`）；
- `urlFilter` 是 URL 子串匹配，填端点路径/主机/查询片段；
- 记下目标请求的 **reqid**（数字 ID，不是原始 CDP requestId）。reqid 在保留期内跨导航存活，但 FIFO 驱逐或 `clear_network_requests` 后失效。

### Step 2 — 看发起栈（非暂停，先试这个）

```
get_request_initiator(requestId=<reqid>)
```

- 返回发起该请求的 JS 调用栈（含 async parent stack），每帧是 `函数名 @ url:line:col`；
- **initiator 捕获是懒激活且非回溯的**：老 reqid 可能没有栈。此时不要硬试——先 `list_network_requests` 重新激活网络能力后**复现动作**，看新 reqid；若需要运行时变量/动态 payload，改走 Step 3；
- 若栈已指出代码位置：直接跳 Step 4-5 看源码，或跳 Step 6 下断。

### Step 3 — 不够回溯就用 XHR 断点复现

```
break_on_xhr(url="<端点路径窄子串>")
```

- `url` 是**大小写敏感**的 URL 子串，只匹配**未来**的 XHR/Fetch 请求——**必须在复现动作之前设**，它不检查历史流量；
- 从 Step 1 的列表里抄一个窄端点路径（越窄越少误停）；
- **原样保留这个字符串**：它是 `list_breakpoints` / `remove_breakpoint(action="remove_xhr", url=...)` 的标识。

### Step 4 — 枚举与搜索源码

知道 URL 用枚举，知道代码文本用搜索，两者都不知道才并列扫：

```
list_scripts(filter="<URL子串>")          # 大小写不敏感的 URL 子串，只匹配外部脚本；
                                          # 不搜源码文本、不匹配无名 inline/eval 脚本
search_in_sources(query="<特征文本>", urlFilter="<bundle URL子串>")
```

`search_in_sources` 关键参数语义：

- `query`：字面文本；`isRegex=true` 时按正则解释。选**有区分度的**函数名/端点/属性名/字面量（还能复用为断点锚文本）；
- `caseSensitive`：发现阶段留 false；为下断而选精确代码文本时设 true；
- `excludeMinified` 默认 **false**——逆向时**保持默认**，相关代码常常只在压缩 bundle 里（true 会跳过超长行）；
- `maxResults` 默认 30，`maxLineLength` 默认 150（要看上下文用 `get_script_source`，别调大预览）；
- 返回 **1-based 行号** + 上下文内 scriptId；URL 是首选稳定选择器。

### Step 5 — 定点看源码

```
get_script_source(url="<脚本URL>", startLine=100, endLine=180)   # 常规多行文件
get_script_source(url="...", offset=52000, length=800)           # 压缩单行 bundle
```

- `url` 优先（精确匹配优先于子串匹配，写足够长的 URL 避免歧义）；`scriptId` 只用于无名 inline/eval 脚本，且**重载/导航/调试器目标变更后失效**；
- `startLine`/`endLine` 为**含端点的 1-based** 行号；压缩单行改用 `offset`（0-based 字符偏移）+ `length`（默认 1000）；
- 选区超 1000 字符会被判定疑似压缩代码并提示导出；
- 遇到 WASM（bytecode）时工具直接提示改用 `save_script_source` 存 `.wasm`。

### Step 6 — 下代码断点

```
set_breakpoint_on_text(text="<精确区分的代码文本>", urlFilter="<bundle URL子串>")
```

- `text`：**大小写敏感**的精确源码文本（函数声明/调用/语句片段），工具内部以 caseSensitive=true 全量搜索定位——先用 Step 4 的搜索确认文本存在再下断；
- `urlFilter`：大小写不敏感 URL 子串，排除同名文本误中其它 bundle——**比 occurrence 更稳定的消歧手段**；
- `occurrence`：1-based 第 N 处匹配（默认 1），只在看过多个搜索结果后使用；
- `condition`：可选**简单同步表达式**，为真才暂停（用于命中频繁的点位降噪；不做异步/复杂发现）；
- 无名 inline/eval 脚本**不能**用此 URL 断点；成功后返回当前 `breakpointId` 供移除，调试器会话重建后 ID 可能变——先 `list_breakpoints` 再移除。

### Step 7 — 触发并读暂停态

复现用户动作（如 `click_element(confirm=true, ...)`）命中断点后：

```
get_paused_info(frameIndex=0)
```

- 返回原因、命中断点、调用栈（`帧号. 函数名 @ url:line:col`）与作用域变量；
- `frameIndex`：0-based 帧（默认栈顶）；`maxScopeDepth` 默认 2——1 读实参/局部，2 加闭包，3+ 才读其他非全局作用域，缺值时再调大；全局作用域永不返回；
- 作用域变量每作用域最多 20 个、每值截断 200 字符，超出会提示；
- **frameIndex 与 callFrameId 只属于当前这一次暂停**，任何 step/resume 后即失效。

### Step 8 — 单步追踪

```
step(direction="into")   # 跟进调用
step(direction="over")   # 越过调用看下一条语句
step(direction="out")    # 跑完当前函数
```

- 只能从**已暂停**状态起步，不能从运行态 step；
- 每步自动返回新停点：函数名、`url:line:col`（CDP 0-based 已转 1-based）、实参 JSON 摘要（≤500 字符）、停点列前后 200 字符源码片段；
- 每步都使旧 callFrameId 失效——需要变量就对新停点重新 `get_paused_info` / `evaluate_script`。

### Step 9 — 暂停帧求值

```
evaluate_script(function="() => ({ s: secretKey, out: sign(input) })", confirm=true, frameIndex=0)
```

- 暂停时求值**总是落在所选调用帧**上（`frameIndex` 取自最新一次 `get_paused_info`），此时 `mainWorld` 被忽略；运行态求值默认隔离世界，`mainWorld=true` 才访问页面自定义全局；
- `function` 是**被调用的函数声明**（如 `() => document.title`），返回 JSON 可序列化数据；ArrayBuffer/类型数组要 `outputFile` 才能拿到精确字节；
- 行内结果上限 8192 字符，超出提示改 `outputFile`；
- `confirm=true` 属破坏性授权（见 §5），求值尽量用只读表达式；
- `localFilePath` 可传一个宿主文件进页面处理（绝对路径、拒绝 `file://`/`~`/通配符，普通 ≤5MB、暂停态 ≤512KB）——用于把抓到的样本喂进页面函数复算验证。

### Step 10 — 导出源码离线分析

```
save_script_source(url="<脚本URL>", filePath="<绝对或相对路径>.js")
```

- 存**完整**源码（大型/压缩/WASM 场景；小片段用 Step 5 的 `get_script_source`）；
- `format` 默认 true：JS/TS 扩展名经 prettier 格式化便于阅读——**格式化后行号与线上页面不一致，不得把格式化行号当断点位置**；要精确字节/原始行布局就 `format=false`；
- `.wasm` 扩展名存 bytecode；`confirmOverwrite=true` 才覆盖已存在文件；
- 导出的文件进入证据工作区，配合 §7 的 firefox 插桩或离线重建使用。

收尾：`pause_or_resume(action="resume")` 恢复执行（移除断点不会自动恢复暂停页），`remove_breakpoint(action="remove_code", breakpointId=... | action="remove_xhr", url=... | action="remove_all", confirm=true)` 清理。

---

## 4. 网络取证配方

### 4.1 `list_network_requests` 四种模式（一个工具，按参数分流）

| 模式 | 参数 | 用途 |
|---|---|---|
| 列表/过滤 | 无 `reqid` | 过滤浏览流量（`methods`/`resourceTypes`/`urlFilter`，默认 20 条/页） |
| Cookie 溯源 | `cookieName="<名字>"` | 追踪**响应 Set-Cookie** 对该 cookie 的创建/刷新/轮换/覆盖/删除，**最旧优先**返回 setter reqids——HttpOnly/Secure/SameSite cookie 也能追（页面 JS 看不到的这里看得到）；**只查响应头，不搜出站 Cookie 请求头** |
| 请求详情 | `reqid=N` | 单请求有界详情 |
| 精确导出 | `reqid=N, outputFile="...", outputPart=..., confirmOverwrite=...` | 导出精确材料；**`outputFile` 必须搭配 `reqid`**（否则报 INVALID_ARGUMENT） |

`outputPart` 语义：`"responseHeaders"`（**完整 Set-Cookie 值与属性**、重复头——cookieName 模式查到 reqid 后用它看全部属性）、`"responseBody"`（原始响应字节）、`"requestBody"`（捕获的请求字节——签名/replay 输入）、`"queryParams"`（URL 参数）、`"all"`（元数据+头+query+body 的 JSON 打包）。

**急切捕获**：chrome 引擎在请求流经时就缓存响应体，事后直接按 reqid 导出，**无需重放请求**（firefox 引擎需先 start 捕获，这是换手时的关键差异）。

捕获窗口纪律：捕获自 MCP attach 起算，**非回溯**——早前的流量要么 reload 重放、要么复现动作；捕获跨导航存活，容量 5000 条 FIFO。

### 4.2 `clear_network_requests(confirm=true)` — 清世代

在**复现动作之前**清出干净的捕获窗口。只清内存中的请求队列、响应体缓存与 initiator 映射；**不碰** cookies、HTTP 缓存、origin storage、console、WebSocket（浏览器状态复位用 `clear_site_data`）。**reqid 永不复用**——清完后新捕获从旧高水位继续编号，旧 reqid 引用一律作废。

### 4.3 `get_websocket_messages` — WS 帧取证

适用 WS/socket/实时推送消息流。**HTTP 升级请求的头走 `list_network_requests`，本工具只管帧。**

- **非回溯纪律**：WS 捕获在本工具**首次调用时**才懒激活。所以必须**先调一次 `get_websocket_messages()`（无参列连接）完成初始化，再 reload/复现**——已完成交换的帧无法找回。这是与 initiator 相同的"先开采集再触发"纪律，方向相反：initiator 是"复现后再查"，WS 是"先调再触发"；
- 无 `wsid`：列连接（`urlFilter` 子串过滤；`includePreservedConnections=true` 含最近三次导航保留的连接——socket 属于上一页面状态时用）；
- 有 `wsid`：分页列帧（`direction="sent"/"received"`；`show_content=true` 给 ≤10000 字符 payload 预览）；
- `wsid` + `analyze=true`：按 payload 模式指纹分组，返回组 ID 与样本帧号——噪声实时流里发现消息类型的第一步；随后 `groupId="A"` 看某组、`frameIndex` 看单帧；
- `frameIndex` 是**稳定单调的保留帧号**（表格里的 Idx），驱逐后可能从 >0 开始，不是页面内数组偏移。

---

## 5. 暂停态纪律与 confirm 语义

**导航后立即求值的已知边角**（e2e-loop 实测，2026-08-30）：`navigate_page` 之后立刻 `evaluate_script` 可能报 `frame.evaluate: JSHandles can be evaluated only in the context they were created!`——旧执行上下文句柄已随导航失效。处置：稍候数百毫秒重试即可恢复；写自动化脚本时对求值调用带一次重试。

**断点暂停会被风控计时。** 页面 JS 虽然冻结，但服务端/风控侧的时序基线仍在走：暂停过久、反复断续单步会被标记（SKILL.md §6、knowledge/invariants.md §3）。执行纪律：

1. 下断前想清楚"暂停后要取哪几个值"——**取证一次到位**，不要边看边想；
2. 暂停内的动作序列压缩为：`get_paused_info` → （必要时一次 `evaluate_script`）→ 必要的 1-2 步 `step` → `pause_or_resume(action="resume")`；
3. 工具调用在服务端被互斥锁串行化（一次只有一个工具在跑），暂停期间不要插入无关查询；
4. 条件断点（`condition`）用于降噪，不要用它做复杂逻辑。

**confirm=true = 用户显式授权的破坏性操作**（main.ts SERVER_INSTRUCTIONS 原文纪律：仅在用户明确授权该具体效果时才置 true，否则先向用户请求确认）。chrome 引擎里需要 confirm 的工具与效果：

| 工具 | confirm=true 授权的效果 |
|---|---|
| `evaluate_script` | 本次任意代码求值（可改页面状态、发请求、产生外部副作用） |
| `click_element` | 本次点击（可提交数据、导航、触发外部效果） |
| `clear_network_requests` | 不可逆删除当前页已捕获请求史/响应体缓存/initiator 证据 |
| `clear_site_data` | 不可逆清当前站点 cookies/存储/sessionStorage |
| `remove_breakpoint` | 按所选 action 移除断点（**不等于恢复执行**，暂停页要另发 resume） |

覆盖已存在文件的 `confirmOverwrite` 同理。取证类只读工具（列表/搜索/源码/paused info/initiator）均不需要 confirm。

---

## 6. 检测纪律摘要（详见 invariants）

chrome 引擎三条被验证过的不变量——**完整展开与失败案例见 [../knowledge/invariants.md](../knowledge/invariants.md) §1，此处只列操作含义**：

1. **零 JS 注入反检测**：不要往页面加 stealth 脚本、不要 `Object.defineProperty` 修补 navigator/screen/chrome——JS patch 必留 descriptor/Error.stack/toString 三类痕迹，弄巧成拙触发 "unusual traffic"。给浏览器"加层 stealth"是被验证过的失败路线。
2. **零 config flag hack**：不要加 `--lang`/`--window-size`/指纹类启动参数假装真实浏览器；用真实 OS 默认值，指纹需求走 `--cloak` 源码层 patch。
3. **CDP 懒激活**：导航期间不激活任何 CDP 域（`Network.enable`/`Debugger.enable` 延后到首个非导航工具调用），让风控 JS 先跑完。操作含义即 §3 前置的"先导航再刷新"三步——**取证工具看到的流量从 reload 那一拍才开始**，任何"抓首屏加载请求"的需求都必须主动 reload 一次。

headed-only（headless 写死禁用）与 profile 物理隔离是同一纪律的延伸，不单独展开。

---

## 7. 与 firefox 引擎换手点

chrome 引擎的产出是**证据**：目标函数位置（URL:line:col）、断点处实参/闭包值（已落 `outputFile`）、完整请求样本与 Set-Cookie 溯源、格式化后的完整源码。当任务需要下一步是**改运行时行为**时换手：

- **插桩**：需要在正常流量下持续观测函数入参/返回、或 JSVMP 分发循环需逐 tap 记录 → firefox 引擎 `instrumentation(action="install")` 源码级插桩 / `hook_jsvmp_interpreter(mode="transparent")`，见 [jsvmp.md](jsvmp.md)；
- **环境模拟**：算法与浏览器环境深度耦合、需在 jsdom 沙箱补环境重放 → [path-b.md](path-b.md) 六步法（入口确认那一步可直接复用本篇 Step 4 的搜索结果）；
- **换手纪律**（invariants §3）：同一时间只用一个浏览器工具家族持有 live target；切换前保存基线（页面状态、已捕获请求、断点清单、导出文件路径）并写入证据工作区 `tasks/<task-id>/`；chrome 侧收尾务必 `remove_breakpoint` + resume，避免残留断点干扰后续会话。

反向换手：firefox 插桩日志锁定了候选函数后，回到 chrome 引擎下真断点验证实参/返回值，是常见循环。双方各取所长：**chrome 看"这一刻的真实值"，firefox 看"全过程的行为流"**。
