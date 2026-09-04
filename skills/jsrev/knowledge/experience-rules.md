# 经验法则（识别选择 / 定位插桩 / Hook 环境 / 协议优先 + 降级梯度）

> lineage：蒸馏自 hello_js_reverse_skill/references/experience-rules-full.md（30 条编号法则全部保留，按任务口径覆盖其核心 22 条），已去 MCP 绑定化改写。
> CHECK 相关内容一律指向主 skill（SKILL.md §3）的 CHECK 三项：CHECK-1 引擎可用性 / CHECK-2 经验库速查 / CHECK-3 方案意图声明。
> 工具名以 references/tool-matrix.md 现役清单为准。仅用于已授权目标的协议分析。

## 一、识别与选择

### 规则 1：反爬类型识别是 Phase 0 的 Phase 0

不加任何 hook 先导航，观察 redirect 链 / initial_status / 加载的 JS 特征，按三分法（签名型/行为型/纯混淆）判定类型。**用错档的工具不是效率差，是根本跑不通。**

```text
[firefox] navigate（不带任何 hook）→ 读 initial_status / final_status / redirect 链
[chrome]  new_page（静默导航）→ 后续取证看请求与脚本特征
→ 按 SKILL.md §2 三分法判定类型，再定引擎路由
```

### 规则 2：JSVMP 双路径决策

识别到 JSVMP 先判断走路径 A（算法追踪）还是路径 B（环境伪装）。签名型只有一条路：`instrumentation(action="install", mode="ast")` 源码级插桩不动环境，是唯一能同时"观察 VMP"和"让挑战通过"的手段；`hook_jsvmp_interpreter(mode="transparent")` 是其签名安全备选，源码插桩失败再退。

### 规则 3：Cookie 归因优先于 setter hook

分析动态 cookie 第一步永远是 `analyze_cookie_sources()`，它区分三种模式：纯 JS 写入 / 纯 HTTP Set-Cookie / JS 算 token + 服务端带回来。RS/Akamai 最常见的第三种模式下，单纯 hook `document.cookie` setter 什么都抓不到。

### 规则 4：导航时装 hook 的正确定位

首屏挑战页（RS 412、Akamai 首包）必须**导航前**装好 hook（行为型可用）；签名型永远不要在导航时装运行时 hook——只用导航前注册的源码级插桩（见 [invariants.md](invariants.md) §2.3）。

### 规则 5：变体指纹优先匹配

同一 SDK 体系存在多个变体（单签名 vs 双签名、`bdms.paths` vs `cacheOpts`）时，CHECK-2 速查匹配阶段优先检测 `cacheOpts` 与 `X-Gnarly` 区分变体。

## 二、定位与插桩

### 规则 6：initiator 是黄金路径

看到加密参数 → 拿请求 ID → `get_request_initiator` → 直达签名函数，省去大量搜索。

### 规则 7：预设 hook 一键到位

不要手写常见 hook；`inject_hook_preset` 预设覆盖 xhr / fetch / crypto / websocket / debugger_bypass / cookie / runtime_probe。

### 规则 8：源码级插桩优先于运行时 hook（VM 自包含场景）

RS 5/6、Akamai sensor_data、webmssdk 这类"算法全部在 opcode dispatch 循环内"的 VMP，运行时探针仍然看不到 switch/case 内部。

```text
[firefox] instrumentation(action="install", url_pattern="**/<VMP文件>", mode="ast", tag="vmp1")
          → 唯一能打开黑箱的手段
[firefox] instrumentation(action="log", tag_filter="vmp1", type_filter="tap_get", limit=200)
          → hot_keys 指纹学习法 30 秒告诉你 VMP 读了哪些环境属性
```

### 规则 9：带 hook 重载取代裸 reload

装完 hook 想让它先于页面 JS 跑，裸 `reload` 不能保证顺序；`instrumentation(action="reload")` 一步到位（默认清日志，拿到干净快照）。

### 规则 10：定位大文件用指定脚本搜索

JSVMP 文件通常 200KB+：firefox 用 `search_code(keyword, script_url=url)` 在指定脚本内搜索并取前后上下文；chrome 用源码枚举 + `search_in_sources`。

### 规则 11：`compare_env` 是补环境的起点

先在受控浏览器采集环境基准，再分批细采（`compare_env` 不覆盖 Function.toString / Symbol.toStringTag / DOM 布局），与 jsdom 逐项 diff。

### 规则 12：双签名场景双通道都要 hook

某些平台的 JSVMP 同时修改 `XMLHttpRequest.prototype.open` 和 `window.fetch`，只 hook 一个通道会丢另一半签名。

```text
[firefox] inject_hook_preset(preset="xhr",   persistent=true)
[firefox] inject_hook_preset(preset="fetch", persistent=true)
→ 两个通道都要 hook
```

### 规则 13：服务端侧 AST 让插桩在挑战页可用

AST 解析在服务端做、不在页面内跑，RS 412 挑战页也能插桩。若插桩 `last_mode_used` 长期是 `regex (fallback)`，说明目标语法太新。

### 规则 14：CSP 可能阻断 AST 插桩

严格 CSP 可能阻止改写代码执行；统一接口没有 `csp_bypass` 参数——运行时健康检查失败就停止该插桩，降级到更保守的观测方式。

### 规则 15：导航默认记录完整响应链

完整 redirect 链对签名型 412→200 判断更可靠；换引擎时先确认等价能力是否开启，不要假设两边默认一致。

## 三、Hook 与环境伪装踩坑

### 规则 16：环境伪装优先于算法追踪

如果 JSVMP 只是一个"签名黑箱"且能在 jsdom 中加载执行，优先路径 B（采集 → 对比 → 补丁），比追踪字节码执行快 10 倍。

### 规则 17：Function.prototype.toString 是 jsdom 环境伪装第一杀手

jsdom 所有 DOM 方法的 `toString()` 会暴露实际 JS 代码，必须三层防御：WeakSet + 实例级覆写 + 源码模式正则。

### 规则 18：环境对比要分批采集

单次求值代码太长会报错，分 4-5 批：navigator / screen+window / document+performance+toString / DOM+Canvas+WebGL+Audio。

### 规则 19：环境补丁必须在 VMP 脚本加载前完成

XHR hook 的安装顺序决定能否截获最终 URL。

### 规则 20：服务端静默拒绝是环境检测失败的信号

HTTP 200 + 空 body（不报错）说明签名格式正确但环境指纹不匹配——此时改环境，不要改算法。

### 规则 21：双引擎 native code 格式不同

Camoufox 基于 Firefox 内核，`Function.prototype.toString` 对原生函数的返回格式与 Chrome 不同；jsdom 的 markNative 必须匹配采集基准浏览器的格式（对应主 skill §8 红线 4：不混用引擎假设）。

```text
Chrome:  "function name() { [native code] }"
Firefox: "function name() {\n    [native code]\n}"
```

### 规则 22：`cacheOpts` 是新版 SDK 初始化必传项

旧版只需 `bdms.paths`，新版必须同时传 `cacheOpts`；缺失会导致业务路径未注册、拦截器不触发。

### 规则 23：环境伪装前先确认签名函数入口

开始环境采集之前，先用源码搜索确认 JSVMP 的签名入口类型：单通道 XHR / 双通道 XHR+fetch / 导出函数 / cacheOpts 初始化。

## 四、协议优先

### 规则 24：先做最小补环境，不要上来就开浏览器

协议优先第一步：能用 Node `crypto` 不用 `vm` 沙箱；能用 `vm` 不用 jsdom；能用 jsdom 不用浏览器。浏览器只是证据源，不是交付物。

### 规则 25：TLS 指纹是终极壁垒

算法全对但仍失败时考虑 TLS 指纹：Node 用 `got-scraping` 模拟 Firefox/Chrome 指纹，Python 用 `curl_cffi`。

### 规则 26：签名不一致时逐环节对比

排查链路（逐项对比脚本值 vs 浏览器值）：1 原始输入参数 → 2 参数排序/拼接串 → 3 时间戳（秒 vs 毫秒）→ 4 随机串（长度/字符集）→ 5 密钥/盐值 → 6 中间摘要 → 7 最终密文（hex/base64/自定义），找到**第一个**偏差点。

### 规则 27：预热请求不是装饰

`/api2` 类请求在运行时注入关键变量；跳过预热可能导致签名缺少必要的动态密钥。

### 规则 28：Node vm 沙箱 ≠ 浏览器

有些调试干扰机制只在非浏览器环境触发。vm 沙箱中可能遇到：`window`/`document`/`navigator` 未定义、定时器行为不同。

### 规则 29：降级梯度必须逐级走

每级至少尝试一次并记录失败原因；想放弃时先回查案例库与 [anti-patterns.md](anti-patterns.md)。完整梯度见 §五。

### 规则 30：case 文件价值随实战次数指数增长

首站 case 可能粗糙；二次分析发现 80% 仍成立、20% 变了，就把变化追加进 case 的"变体章节"；三五次后 case 覆盖该站主要变体谱系，复用价值极高。case 的"可验证事实清单"段列 5-15 条最小事实（如"X-Bogus 长度 28""webdriver === false"），同站升级时逐条核对找出"哪些变了"就是当天的工作范围。case 存案例库/任务工作区文件层。

## 五、错误处理降级梯度

插桩/观测失败时**逐级**下降，禁止跨梯度直接到"用浏览器兜底"（见 [anti-patterns.md](anti-patterns.md) 条目 4）：

```text
梯度 0  查经验库/案例库与任务 handoff.json —— 本站/本 SDK 是否已有已验证方案，先复用再动手
梯度 1  换插桩模式：instrumentation mode="ast" → mode="regex"（长期 regex fallback = 语法太新）
梯度 2  换运行时观测：hook_jsvmp_interpreter mode="transparent"（签名型安全备选）
        ※ mode="proxy" 仅行为型可用——签名型越级使用属违规，不是降级
梯度 3  点对点 hook_function，针对具体签名函数
梯度 4  路径 B 变体：vm 沙箱 / jsdom 全量加载 / 既有 Node 补环境方案
梯度 5  合法出口：如实写报告——交付档位记 blocked、落 handoff.json、向用户说明已试路径与卡点
```

每级至少尝试一次并记录失败原因。梯度 5 不是失败：比"假装成功"更体面（主 skill §7——只有观察没有离线复现不算完成；blocked 但如实声明算诚实交付）。

## 附：来源对照（原编号 → 本篇）

| 原编号 | 去向 |
|---|---|
| #1/#25 | 合并进规则 3（Cookie 归因） |
| #2 | 规则 27（预热请求） |
| #3 | 规则 28（vm 沙箱） |
| #5 | 规则 24（最小补环境） |
| #6/#36 | 合并进规则 25（TLS 指纹） |
| #9 | 规则 6（initiator 黄金路径） |
| #10 | 规则 7（预设 hook） |
| #11/#29/#30 | 合并进规则 2（JSVMP 双路径） |
| #13 | 规则 26（逐环节对比） |
| #16 | 规则 10（指定脚本搜索） |
| #17 | 规则 11（compare_env 起点） |
| #18 | 规则 16（环境伪装优先） |
| #19 | 规则 17（toString 第一杀手） |
| #20 | 规则 18（分批采集） |
| #21 | 规则 19（补丁先于加载） |
| #22 | 规则 20（静默拒绝信号） |
| #23/#24 | 合并进规则 8（源码级插桩 + hot_keys） |
| #26/#30 | 合并进规则 4（导航时装 hook 定位） |
| #27 | 规则 9（带 hook 重载） |
| #28 | 规则 1（类型识别） |
| #32 | 规则 13（服务端侧 AST） |
| #33 | 规则 12（双通道 hook） |
| #34 | 规则 22（cacheOpts） |
| #35 | 规则 21（native code 格式） |
| #37 | 规则 14（CSP） |
| #38 | 规则 23（签名入口确认） |
| #39 | 规则 15（响应链） |
| #40 | 规则 5（变体指纹） |
| #43/#44 | 合并进规则 29 与 §五（降级梯度） |
| #45/#46 | 合并进规则 30（case 文件）；session/assertion 机制相关条目已删除 |
