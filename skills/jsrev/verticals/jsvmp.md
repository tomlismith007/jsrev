# JSVMP 双路径方法论（识别 → 决策 → Hook 路径 / 源码插桩路径 → 还原）

> lineage：蒸馏合并自 hello_js_reverse_skill `references/jsvmp-analysis.md`（v3.4.1）与 `references/jsvmp-source-instrumentation.md`（第四板斧专项 + 健康诊断），2026-08-30 平移至 jsrev skill verticals/。工具名按 [../references/tool-matrix.md](../references/tool-matrix.md) 迁移表清零，已下线机制改写为现工作流；过程状态一律落证据工作区 `tasks/<task-id>/`（[../SKILL.md](../SKILL.md) §7）。
> **适用边界**：仅限授权目标，用户须自行确保已获授权。
> **配套**：[path-a.md](path-a.md)（四板斧操作细则 + 失败降级梯度）、[path-b.md](path-b.md)（jsdom 环境伪装六步法）、[../knowledge/invariants.md](../knowledge/invariants.md)（检测不变量，任何引擎操作前对照）。

---

## 1. JSVMP 是什么

JSVMP（JavaScript Virtual Machine Protection）把原始 JS 源码编译为自定义字节码，运行时由内嵌解释器逐条执行：原始逻辑不再以 JS AST 形式存在（传统反混淆手段无法还原）；代码以「字节码数组 + 解释器循环」形式运行；常见于 RS、JY、某数等商业级反爬方案。

**核心原则：不反编译字节码。用行为追踪（Hook / 插桩 / 日志分析 / 源码级插桩四板斧）从 I/O 两端夹逼 + 中间层观察，定位签名逻辑。**

---

## 2. 引擎分工与检测纪律（动手前必读）

**JSVMP 分析优先 firefox 引擎**：`hook_jsvmp_interpreter`（运行时探针，**proxy / transparent 双模式**——proxy 全量可见但可被检测；transparent 只替换原型 getter，签名型首选）+ `instrumentation`（action=install / log / stop / reload / status，HTTP 层源码级插桩，对每个 `obj[key]` 与 `fn(args)` 插 tap，捕获 VM 内部 switch/case 调度——RS 5/6、Akamai sensor_data、webmssdk、obfuscator.io 这类"VM 自包含"场景的通用武器）。

**chrome 引擎（真断点）仅作辅助取证**：`set_breakpoint_on_text` 在分发函数上下断、`break_on_xhr` 抓签名请求发出的调用栈、`get_paused_info` 看暂停态作用域。断点暂停时间过长会被风控标记——暂停态操作要快，取证一次到位。

**检测不变量**（完整版见 [../knowledge/invariants.md](../knowledge/invariants.md)，违规最轻触发 "unusual traffic"，最重整条链被标记、证据作废）：

1. 签名型目标：proxy 模式 hook 与环境篡改默认禁用（可被检测）；只允许源码级插桩或 transparent 透明探针。
2. 时序：hook / 插桩必须**先于导航注册**。同步加载的 SDK（如 webmssdk）在启动时通过闭包捕获原生引用，导航之后才装 hook → 永远不触发且看起来"一切正常"。补救 = 带探针 reload 重来。
3. 串行纪律：同一时间只用一个浏览器工具家族持有 live target；切换引擎前保存基线（页面状态、已捕获请求、hook 状态）。

| 手段 | 可见残留 | 签名型可用 |
|---|---|---|
| proxy 模式 hook | Proxy 对象 + `__mcp_*` 全局标记 | 否 |
| transparent 透明探针 | getter 函数对象身份（函数身份比对类检测理论上可察觉） | 是（运行时观测首选） |
| instrumentation 源码级改写 | 改写后的源码本身（源码哈希/长度类完整性校验可发现） | 是（插桩首选） |
| chrome 只读取证 + 真断点 | CDP 延迟激活前不可见；暂停时长会被标记 | 是（取证面，操作要快） |

---

## 3. 识别 JSVMP

### 3.1 文件特征

| 特征 | 描述 |
|------|------|
| 文件大小 | 200KB+ 的单文件，通常 500KB~2MB |
| 变量命名 | 完全无意义：单字母（`a`, `b`, `c`）或 `_0x` 前缀 |
| 超大数组 | 包含数千个数字元素的数组（字节码） |
| 解释器循环 | `while(true) { switch(opcode) { case 0: ... case 1: ... } }` |
| 栈操作 | 频繁出现 `push`、`pop`、`shift` 操作 |
| API 劫持 | 重写 `XMLHttpRequest`、`fetch`、`document.cookie` 等原生 API |

### 3.2 代码模式示例

```javascript
// 典型的 JSVMP 解释器结构
var _0x1234 = [3, 15, 7, 22, ...]; // 字节码数组
var _0x5678 = [];                   // 操作栈
var _0xabcd = 0;                    // 指令指针

function _0xefgh() {
  while (true) {
    var _0x9999 = _0x1234[_0xabcd++];
    switch (_0x9999) {
      case 0: _0x5678.push(_0x1234[_0xabcd++]); break;  // PUSH
      case 1: var a = _0x5678.pop(), b = _0x5678.pop(); _0x5678.push(a + b); break; // ADD
      case 2: /* ... */ break;
      // 数十到数百个 case
    }
  }
}
```

### 3.3 确认流程（推荐顺序）

```
1. scripts → 找异常大的 JS 文件（100KB+），记下 url
2. search_code(keyword="switch", script_url=<大 JS 的 url>, context_chars=500)
   → candidates: [{fn_name, case_count, char_range, preview}]；case_count > 50 基本确认是 VMP 解释器，记下 fn_name / char_range
3. 交叉验证：search_code(keyword="case 0:|case 1:|case 2:", script_url=...) → 看分发表密度
4. 按 char_range 读分发体源码（scripts 枚举 + search_code 定位片段），确认 while(true)+switch+push/pop 结构
```

兜底（大文件搜索超时）：用更精确的关键词分次搜索（`while.*true`、连续 case 标号），不要对 380KB+ 文件用宽泛关键词——会返回大量无关结果。

**字符串数组判读**（常见误判点）：直接从源码提取的字符串数组若全是单字母乱码，说明字符串被运行时动态解密——静态提取无效，必须依赖运行时插桩日志（第四板斧）拿真实字符串。

---

## 4. 前置判断：先识别 JSVMP 所在反爬类型（再选路径）

在选路径 A / B 之前，先判断 JSVMP 的反爬类型：

```
navigate(url) 不加任何 hook，观察 redirect_chain
│
├─ 反复 412 后才到 200 → 签名型 JSVMP（RS/Akamai）
│   └─ 走下方"签名型专属路径"
│
├─ 直接 200 但主请求链带签名参数 → 行为型 JSVMP（短视频平台/JY）
│   └─ 按四板斧（路径 A）与路径 B 决策树选择
│
└─ 直接 200 无签名参数 → 非 JSVMP 或 VMP 已被跳过
    └─ 回常规混淆分析（../knowledge/obfuscation.md）
```

### 签名型 JSVMP 专属路径

签名型与常规路径 A / B 决策树**不适用**，因为：路径 A 前三板斧（Hook/插桩/日志）会改变环境、破坏签名；路径 B 全量 jsdom 伪装成本高。

```
1. instrumentation(action="install", mode="ast", tag="...")    ← 第四板斧
2. instrumentation(action="reload")    让插桩后的 VMP 跑完挑战
3. instrumentation(action="log", tag_filter=..., type_filter="tap_get")
4. 基于 hot_keys 补最小环境，在 jsdom 或纯 Python 侧独立跑
   （此时补环境粒度远小于路径 B 全量：只补 hot_keys 显示的属性）
```

源码级插桩失败才回落：

```
A. hook_jsvmp_interpreter(mode="transparent")：仅原型 getter 替换，对签名型大多数情况安全（残留仅 getter 函数对象身份，见 invariants §2.4）；极严格反爬仍能识别 getter 身份变化 → 只能走路径 B 全量伪装
B. 路径 B 完整 jsdom 环境伪装（六步法，见 path-b.md）—— 最重但最稳的兜底
```

---

## 5. 四板斧总览

### 5.1 关系图

```
                ┌── 第一板斧 Hook 出入口 ────────────────┐
                │  inject_hook_preset(xhr|fetch|crypto|   │
                │    cookie|websocket|runtime_probe|      │
                │    debugger_bypass)                     │
                │  hook_function(..., mode="intercept")   │
                │  analyze_cookie_sources                 │
                └───────────┬─────────────────────────────┘
                            │
              夹逼 I/O ──→ ┌─┴─┐ ──→ 推断签名公式
                            │VMP│
              中间层 ──→  ┌─┘   └─┐ ──→ 追踪执行链路
                         │
  ┌── 第二板斧 插桩解释器 ──────────┐   ┌── 第四板斧 源码级插桩 ─────────┐
  │ search_code(keyword="switch")    │   │ instrumentation(action="install")│
  │ hook_function(mode="trace")      │   │ instrumentation(action="log")    │
  │ hook_jsvmp_interpreter           │   │ → summary.hot_keys               │
  │   (mode="proxy", trackProps)     │   │ → summary.hot_methods            │
  └──────────────┬───────────────────┘   │ → summary.hot_functions          │
                 ↓                        └───────────────┬──────────────────┘
        ┌── 第三板斧 日志分析 ───────────────────────────┴──────────────────┐
        │  控制台日志 + instrumentation(action="log") + chrome 断点取证（辅助）│
        │  反向追踪法（从签名值 → 明文）                                       │
        │  多次请求对比法（找变化因子）                                        │
        └────────────────────────────────────────────────────────────────────┘
```

### 5.2 板斧选择矩阵

| VMP 特征 | 推荐板斧组合 |
|---------|-------------|
| 签名通过 CryptoJS / atob / MD5 等可 hook API 走 | 第一 + 第三（hot API hook + 日志反推） |
| VMP 通过 `Function.apply/call` 调子函数 | 第二 + 第三（`hook_jsvmp_interpreter` 多路径 + 日志） |
| VMP 自包含，算法全在 switch/case 内（RS 5/6、Akamai、webmssdk、obfuscator.io） | **第四板斧首选**，配合第一板斧做 I/O 边界 |
| VMP 深度绑定浏览器环境（compare_env 差异大 + 签名随环境变） | 路径 B 环境伪装（[path-b.md](path-b.md)），配第四板斧 `hot_keys` 定位指纹集 |

操作细则与失败降级梯度见 [path-a.md](path-a.md)；案例骨架见 [../cases/universal-vmp-source-instrumentation.md](../cases/universal-vmp-source-instrumentation.md)。

---

## 6. 黄金 8 步（推荐主流程，70%+ RS/Akamai/webmssdk 场景直接搞定）

```
Step 1 — 启动 + 网络捕获
  network_capture(action="start")          # firefox 必须先 start 才有请求体
  launch_browser(headless=false)           # 有头调试，看浏览器行为

Step 2 — 第一次导航定位 VMP 脚本 URL
  navigate(url="https://target.com/", wait_until="load")
  list_network_requests(resource_type="script")
  → 找 size 最大的 JS（通常 100KB+，名字像 sdenv-*.js / webmssdk.es5.js / akam/xxx.js），记下 url 下称 <VMP_URL>

Step 3 — 确认是 VMP（而不是普通混淆）
  search_code(keyword="switch", script_url=<VMP_URL>, context_chars=500)
  → case_count > 50 基本确认；记下 fn_name 和 char_range

Step 4 — 装源码级插桩（核心）
  instrumentation(action="install", url_pattern="**/<VMP 文件>",
                  mode="ast", tag="vmp1",
                  rewrite_member_access=True, rewrite_calls=True,
                  max_rewrites=5000)
  # glob 用 **/ 前缀匹配所有 CDN hash 变种；tag 用于一次分析多个 VMP 时区分

Step 5 — 装兜底 hook（与源码插桩互补）
  inject_hook_preset(preset="cookie", persistent=True)   # 原型链级 cookie hook
  inject_hook_preset(preset="xhr", persistent=True)      # 请求出口
  inject_hook_preset(preset="fetch", persistent=True)    # 请求出口
  inject_hook_preset(preset="crypto", persistent=True)   # btoa/atob/JSON.stringify
  hook_jsvmp_interpreter(script_url=<VMP basename>,       # 多路径运行时探针
                         track_calls=True, track_reflect=True, track_props=True)
  inject_hook_preset(preset="debugger_bypass")            # 防 VMP 的 debugger 陷阱

Step 6 — 带探针 reload，让所有探针先于 VMP 生效 + 清日志
  instrumentation(action="reload")
  → 看 final_status：200 正常 / 412 RS 挑战页未过（等 challenge）/ 403 Akamai 拦截（查指纹或 UA）
  ⚠️ 首屏挑战页本步不可省：晚注册的探针抓不到首屏挑战流量（时序纪律，invariants §2.3）

Step 7 — 触发业务操作
  click / type_text / evaluate_js（翻页、搜索、提交等）
  → VMP 在这一步生成签名并发起请求

Step 8 — 读日志 + 归因
  instrumentation(action="log", tag_filter="vmp1", type_filter="tap_get", limit=300)
  → hot_keys / hot_methods / hot_functions 三个 summary（详解见 §8）
  analyze_cookie_sources()   # 归因最终 cookie 来源（HTTP Set-Cookie vs JS 写入）
```

快速路径解决不了再进入 §7 手动三板斧流程。

---

## 7. 前三板斧：Hook 出入口 / 插桩解释器 / 日志分析

### 7.1 第一板斧：Hook 出入口（确定 I/O 边界）

目标：不看 VM 内部实现，只关心"什么进去了"和"什么出来了"。

**出口 — 签名值去了哪里**

```
inject_hook_preset(preset="xhr", persistent=True)     # 持久化拦截 XHR（跨导航不丢失）
inject_hook_preset(preset="fetch", persistent=True)
hook_function(function_path="Document.prototype.cookie",
              hook_code="console.log('[COOKIE_SET]', arguments[0], new Error().stack)",
              position="before", non_overridable=True)  # 拦截 Cookie 写入（防覆盖）
hook_function(className="XMLHttpRequest", methodName="send",
              mode="intercept", non_overridable=True)   # 冻结 XHR.send 防止 VM 覆盖 Hook
reload()                                               # hook 后 reload 触发生效
get_console_logs                                       # 收取签名值与调用栈
```

关键信息提取：签名参数名（`sign`、`m`、`_signature`）、格式（长度/字符集/编码）、出现位置（URL params / Body / Header / Cookie）。

**入口 — 明文从哪里来**

```
inject_hook_preset(preset="crypto", persistent=True)   # btoa/atob/JSON.stringify/parse
hook_function(function_path="String.fromCharCode",
              hook_code="if(arguments.length > 1) console.log('[fromCharCode]', Array.from(arguments).map(Number), String.fromCharCode(...arguments))",
              position="before")
# JSVMP 高频使用 fromCharCode 构造字符串
```

CryptoJS 等加密库入口用 `hook_function` 包装记录 I/O（示例代码见 [path-a.md](path-a.md) §三）。

**I/O 关联分析**：出口 `sign=a1b2c3...`（32 位 hex → 疑似 MD5）+ 入口 MD5 输入 `"page=1&ts=1680000000&key=secret123"` → 关联结论 `sign = MD5("page=" + page + "&ts=" + timestamp + "&key=" + secret_key)`。

### 7.2 第二板斧：插桩解释器（追踪执行链路）

适用：出入口 Hook 无法直接关联时（例如 VM 使用自实现的 MD5 而非 CryptoJS）。

**定位解释器核心函数**

```
search_code(keyword="while.*true")                              # 解释器主循环
search_code(keyword="case 0:|case 1:|case 2:", script_url=N)    # opcode 分发表
判断标准：函数体超过 500 行；包含 20+ 个 case 分支；有数组索引递增（指令指针移动）
```

**分层插桩策略（由粗到细，逐步缩小范围）**

- **第一轮 — 分发器级别（粗粒度）**：`hook_function(function_path="<解释器分发函数>", mode="trace", log_args=true, log_return=true, max_captures=500, persistent=True)`。观察每次调用的参数模式，找签名值首次出现的调用序号，缩小时间窗口。⚠️ 必须设 `max_captures`——高频函数每秒数千次调用会日志爆炸。
- **第二轮 — 子函数级别（中粒度）**：从第一轮日志识别被频繁调用的 3-5 个核心子函数，逐个 `hook_function(mode="trace", log_args=true, log_return=true, log_stack=true, max_captures=50)`，再触发请求分析子函数输入输出。
- **第三轮 — 字符串操作级别（细粒度）**：hook `String.prototype.charAt / charCodeAt / substring / concat` + `Array.prototype.join`。追踪字符串如何逐步拼接；`join('')` 通常是最终拼接点。

**关键变量监控**

```
hook_jsvmp_interpreter(mode="proxy", trackProps=True, target_expression="疑似签名容器对象")
# proxy 级属性访问追踪；⚠️ 仅限行为型/纯混淆目标（签名型禁用，见 §2）
```

手动监控脚本（导航后用 `evaluate_js` 注入，只对之后的写入生效；首屏即生成签名的目标改用源码级插桩 / transparent 探针，见 invariants §2.2）：

```javascript
(function() {
  // 方法1：监控全局变量写入
  const watched = ['sign', 'm', '_signature', 'token'];
  const origDefineProperty = Object.defineProperty;
  watched.forEach(key => {
    let val;
    try {
      origDefineProperty(window, key, {
        get() { return val; },
        set(v) {
          console.log(`[GLOBAL_SET] window.${key} =`, v);
          console.trace();
          val = v;
        },
        configurable: true
      });
    } catch(e) {}
  });

  // 方法2：监控对象属性赋值
  const _origAssign = Object.assign;
  Object.assign = function() {
    const result = _origAssign.apply(this, arguments);
    for (let i = 1; i < arguments.length; i++) {
      const src = arguments[i];
      if (src && typeof src === 'object') {
        Object.keys(src).forEach(k => {
          if (watched.includes(k.toLowerCase())) {
            console.log(`[ASSIGN] ${k} =`, src[k]);
            console.trace();
          }
        });
      }
    }
    return result;
  };
})();
```

环境基准：`compare_env` 采集完整浏览器环境（navigator/screen/canvas/WebGL/Audio/timing），供后续补环境对照。

### 7.3 第三板斧：日志分析（从海量数据提取签名链路）

**采集渠道**（全部逐条落盘 `tasks/<task-id>/runtime-evidence.jsonl`）：

```
get_console_logs                                  # hook 输出（hook_code / trace 捕获）
instrumentation(action="log", tag_filter=...)     # 插桩 tap 记录（§8 的三个 summary）
evaluate_js("JSON.stringify((window.__mcp_vmp_log||[]).slice(0,50))")   # 页面内缓冲抽查
```

chrome 引擎辅助：真断点暂停在签名函数处直接看作用域与调用栈——比日志直接，但受暂停时长纪律约束（invariants §3）。

**过滤策略**

| 过滤维度 | 方法 | 说明 |
|---------|------|------|
| 关键词过滤 | 搜索签名值片段 | 在日志中搜索已知签名值的前 8 位 |
| 时间窗口过滤 | 只看请求前 1-2 秒 | 签名通常在请求发送前即时生成 |
| 类型过滤 | 只看字符串参数 | 数值型操作大多是 VM 内部调度 |
| 长度过滤 | 关注长度 > 8 的字符串 | 排除短字符串噪声 |
| 变化过滤 | 对比多次请求日志 | 每次都变的是动态参数，不变的是密钥 |

**反向追踪法（核心技巧）**——从已知签名值反推到原始明文：

```
步骤 1：搜索签名值前几位 → [trace#247] return "a1b2c3d4e5f6..."
步骤 2：查看该次调用的输入 → [trace#247] args: ["page=1&ts=1680000000&key=secret123"]  ← 签名函数的输入明文
步骤 3：继续追踪输入来源
  → [trace#245] return "page=1&ts=1680000000&key=secret123"
  → [trace#245] args: ["page=1", "ts=1680000000", "key=secret123"]  ← 参数拼接函数
步骤 4：确认各参数来源
  → "page=1" 用户输入；"ts=..." Date.now()/1000；"key=..." 硬编码密钥
结论：sign = MD5("page=" + page + "&ts=" + Math.floor(Date.now()/1000) + "&key=secret123")
```

**多次请求对比法**：

```
多次请求对比：
请求 1: sign=aaa111, ts=1680000000, page=1
请求 2: sign=bbb222, ts=1680000005, page=2
请求 3: sign=ccc333, ts=1680000010, page=1
- page 相同但 sign 不同（请求1 vs 请求3）→ ts 参与签名
- ts 不同且 sign 不同 → ts 是变化因子之一
结论：sign 至少由 page + ts 共同决定
```

**算法指纹识别**（I/O 特征反推算法类型）：

| 输出特征 | 可能算法 |
|---------|---------|
| 32 位 hex | MD5 |
| 40 位 hex | SHA-1 |
| 64 位 hex | SHA-256 |
| 44 位 Base64（含 `=` 填充） | HMAC-SHA256 + Base64 |
| 24/32/44 位 Base64 | AES 加密（CBC/ECB） |
| 输出长度随输入变化 | 非固定哈希，可能是加密或自定义编码 |
| 输出包含特殊分隔符 | 自定义拼接格式 |

## 8. 第四板斧：源码级插桩（VM 看自己）

> 前三板斧诊断"VM 看外界 / 外界看 VM"；本板斧诊断"VM 看自己"。行为型可用全部四斧；签名型**只用本板斧**（+ transparent 探针）。

### 8.1 传统 hook 的盲区

`hook_jsvmp_interpreter` 即使是多路径版本（apply/call/bind + Reflect/Proxy + timing/random），也只能看到 VMP 路由到**可 hook JS API** 的部分。自包含 VMP 的典型结构：

```js
// 典型的自包含 VMP 字节码分发循环
function _vm(bytecode) {
  var stack = [], pc = 0, env = window;
  while (pc < bytecode.length) {
    var op = bytecode[pc++];
    switch (op) {
      case 1: stack.push(env[bytecode[pc++]]); break;    // ← GET：env[key] 直接访问，不经过 apply/Reflect
      case 2: var k = stack.pop(), o = stack.pop(); stack.push(o[k]); break;  // ← 对象属性读取
      case 3: var args = stack.splice(-bytecode[pc++]);
              var fn = stack.pop(); stack.push(fn.apply(null, args)); break;  // ← 这种才被 apply hook 看到
      case 4: stack.push(bytecode[pc++] + stack.pop()); break;                // ← 纯字符串拼接，hook 完全抓不到
      // ... 数十到数百个 case
    }
  }
}
```

- `case 1` 直接访问 `env[key]`：proxy 模式能看到（若 env 被 Proxy），但嵌套多层后 Proxy 链会断；
- `case 2` 读任意对象的任意属性——hook 不可能覆盖所有对象；
- `case 4` 纯内存字符串拼接——任何 hook 都看不到。

结果：签名所需的关键中间值在 dispatch 循环内部全部丢失，传统 hook 日志只有零散 API 调用，拼不出算法——这正是第四板斧存在的理由。

### 8.2 原理

`instrumentation(action="install")` 在 HTTP 层拦截目标脚本，在抵达浏览器前把源码改写为等价的"带 tap 版本"，改写后的源码**继续正常执行**：

```js
// 改写前
stack.push(env[key]);
// 改写后（regex 模式）
stack.push(__mcp_tap_get(env, key, 'vmp1'));

// 改写前
fn.apply(null, args);
// 改写后（AST 模式）
__mcp_tap_call(fn, null, [args[0], args[1], ...], 'vmp1');
```

`__mcp_tap_get` / `__mcp_tap_call` / `__mcp_tap_method` 把每次交互记录到 `window.__mcp_vmp_log`：

- **tap_get** 读取属性 `{type, tag, key, objType, value(preview)}`；**tap_method** 记录 `obj.method(args)` 调用 `{type, tag, objType, method, argc, arg0, ret}`；
- **tap_call** 记录 `fn(args)` 直接调用 `{type, tag, name, argc, arg0, ret}`；**tap_call_err** 记录调用抛错 `{type, tag, name, err}`。

### 8.3 两种改写模式：regex vs AST

| 情况 | 选 | 原因 |
|------|-----|-----|
| 首次分析某个 VMP | **AST** | `hot_methods` + `hot_functions` 能快速画出 VMP 行为画像 |
| 只需快速观察 bracket member access | regex | 改写轻、无需 AST |
| VMP 文件 > 5 MB | regex | AST 改写内存开销大 |
| 关心 VMP 调了哪些方法 | **AST** | regex 不生成 tap_method / tap_call |
| 关心 VMP 读了哪些属性 | 任一 | 两种模式都生成 tap_get |

- `mode="ast"`（默认推荐）：MCP 侧 esprima 解析，**不依赖页面 CDN，挑战页可用**；同时改写 member access 与 call；esprima 解析失败自动回落 regex（`fallback_on_error=True`）。
- `mode="regex"`：纯正则匹配 `<identifier>[<expr>]`，零依赖、大文件安全；覆盖率约 80% member access，对模板字符串/正则字面量/嵌套方括号可能误改写，不生成 call tap。

> `last_mode_used` 只说明改写走了哪条路径，**不代表改写产物已在浏览器成功执行**——必须做 §8.5 健康检查。

### 8.4 AST 模式健康诊断

`instrumentation(action="status")` 的 `active_patterns[i].last_mode_used` 判定：

| `last_mode_used` | 含义 | 动作 |
|---|---|---|
| `"ast"` | 解析成功并完成 AST 改写 | 继续做运行时健康检查 |
| `"regex"` | 显式指定了 `mode="regex"` | 正常，继续 |
| `"regex (fallback)"` | 指定了 ast 但 esprima 解析失败，自动回落 | **警告**，见下 |

`"regex (fallback)"` 持续出现时：

1. `get_console_logs` 里搜 `[INSTRUMENT] AST parse failed`，看具体报错；
2. ES2022+ 的 private field / static block / top-level await 等新语法 → 手动 `mode="regex"`（~80% 覆盖）或改用 transparent 探针兜底；
3. `SyntaxError: Unexpected token` 开头 → 可能 JS 带 BOM 或非标准前缀，把脚本源码取到本地检查首 100 字节（源码片段用 `scripts` / `search_code` 读出）。

### 8.5 改写产物运行时健康检查

`files_rewritten > 0` 只证明 MCP 生成并下发了改写文本，**不证明浏览器成功解析执行**。每次 reload 后：

```
instrumentation(action="status")
evaluate_js(expression="(() => ({
  tapInstalled: window.__mcp_tap_installed === true,
  logReady: Array.isArray(window.__mcp_vmp_log)
}))()")
instrumentation(action="log", tag_filter="vmp1", limit=10)
```

判定：

- `files_rewritten > 0` 且 `tapInstalled=false`：优先怀疑改写产物语法损坏或执行前异常（常见于嵌套 CallExpression / MemberExpression / NewExpression）。先停原 AST route，再按 `ast → regex → transparent` 梯度重装；不要反复增大 `max_rewrites` 下发同一份失败产物。
- `tapInstalled=true` 但日志为空：runtime 已执行，继续检查 VMP 是否触发、tag/filter 是否正确，不要归因于语法错误。

### 8.6 进阶技巧

**多 VMP 场景**：

```
instrumentation(action="install", url_pattern="**/webmssdk.es5.js", mode="ast", tag="webmssdk")
instrumentation(action="install", url_pattern="**/a_bogus.js", mode="ast", tag="bogus")
instrumentation(action="log", tag_filter="webmssdk", type_filter="tap_get")   # 分别读
instrumentation(action="log", tag_filter="bogus", type_filter="tap_get")
instrumentation(action="log", tag_filter="vmp1", key_filter="webdriver")      # key_filter 锁定属性
instrumentation(action="log", tag_filter="vmp1", key_filter="MD5")            # key_filter 锁定方法
```

**route 管理**：

```
instrumentation(action="status")                                   # 查看激活 route
instrumentation(action="stop", url_pattern="**/sdenv-*.js")        # 停单个
instrumentation(action="stop")                                     # 全部停止
```

**与 runtime_probe 预设互补**（探针覆盖浏览器原生 API，插桩覆盖 VM 源码内部，两路叠加）：

```
inject_hook_preset(preset="runtime_probe", persistent=True)
instrumentation(action="install", url_pattern="**/sdenv-*.js", mode="ast", tag="vmp1")
instrumentation(action="reload")
触发操作
# 两路都读
instrumentation(action="log", tag_filter="vmp1", limit=300)   # VM 内部 obj[key] / fn(args)
get_console_logs                                              # 探针输出：xhr_send / canvas_toDataURL 等
```

## 9. 常见 JSVMP 变体及应对

### 变体 1：VM 劫持 XHR/Fetch

**特征**：VM 重写了 `XMLHttpRequest` 或 `fetch`，请求在 VM 内部完成，外部 JS 层 hook 抓不到。

**应对**：

```
- hook_function(function_path="XMLHttpRequest.prototype.send", mode="intercept", ...)
  → hook 更底层接口；在 VM 重写之前生效（hook 先于导航注册的时序纪律）
- 或网络层兜底（协议层捕获，不依赖 JS 层 hook）：
  network_capture(action="start") → list_network_requests → get_network_request（完整请求详情）
```

### 变体 2：VM 动态生成加密函数

**特征**：算法不是硬编码在字节码里，而是运行时经 `eval` / `new Function` 动态构造。

**应对**：

```
inject_hook_preset(preset="crypto")   # 含 eval/Function hook
hook_function(function_path="Function",
              hook_code="console.log('[new Function]', arguments[arguments.length-1].substring(0,200))",
              position="before")
# 从 hook 日志提取动态生成的函数源码
```

### 变体 3：多层 VM 嵌套

**特征**：外层 VM 解密出内层 VM 的字节码，再由内层 VM 执行签名逻辑。

**应对**：

```
- 不要试图理解嵌套关系；依然从 I/O 两端入手，hook 最终出口和最初入口
- hook_function(mode="trace") 的 max_captures 提到 1000+；用时间戳过滤法缩小日志范围
```

### 变体 4：VM + WASM 混合

**特征**：VM 负责流程控制，核心加密调用 WASM 导出函数。

**应对**：

```
search_code(keyword="WebAssembly|wasm|instantiate")
```

hook WASM 导出函数（⚠️ 必须在页面 WASM 实例化**之前**注入——时序纪律同 §2；晚于实例化只能走源码级插桩）：

```javascript
evaluate_js(expression=`
  const origInstantiate = WebAssembly.instantiate;
  WebAssembly.instantiate = async function() {
    const result = await origInstantiate.apply(this, arguments);
    const exports = result.instance?.exports || result.exports;
    Object.keys(exports).forEach(name => {
      if (typeof exports[name] === 'function') {
        const orig = exports[name];
        exports[name] = function() {
          console.log('[WASM]', name, 'args:', Array.from(arguments));
          const ret = orig.apply(this, arguments);
          console.log('[WASM]', name, 'return:', ret);
          return ret;
        };
      }
    });
    return result;
  };
`)
```

确认 WASM 函数 I/O 后，下载 .wasm 文件用 Node.js 直接加载调用（对应交付阶梯第 3 级，SKILL.md §5）。

## 10. 还原策略决策

**关键：`hot_keys` / `hot_methods` 是所有决策的共同输入——没看这三个 summary 之前不要选策略。** 即使最后选了路径 B，`hot_keys` 也能把"要对齐什么环境"从几十项人工 diff 降为 20 项精确对齐。

```
JSVMP 签名还原决策树：

第 0 步：先看 hot_methods（第四板斧 summary）
  ├─ 含 CryptoJS.MD5 / SubtleCrypto.digest / HMAC / btoa
  │   → 标准加密，继续第 1 步
  └─ 全是自定义 fn 名，几乎没有 CryptoJS/Subtle
      → VMP 自实现加密，直接跳第 3 步（沙箱运行完整 VM）

第 1 步：标准算法分支
  ├─ 能从 hot_methods + 调用栈反推出明文拼接顺序？
  │   ├─ YES → 纯算法还原（Node.js crypto / Python hashlib+pycryptodome）
  │   └─ NO（明文来自 VM 内部）→ 第 2 步

第 2 步：能提取独立的签名函数？
  ├─ YES → 沙箱执行（Node.js vm / Python execjs）
  │   · 提取函数及其依赖；按 hot_keys 对齐最小环境变量
  └─ NO → 第 3 步

第 3 步：VMP 劫持了整个请求链路 + hot_keys 显示大量环境读取？
  ├─ YES → 路径 B（jsdom 环境伪装，见 path-b.md）
  │   · hot_keys 直接告诉你要对齐哪些环境属性
  │   · analyze_cookie_sources 确认 cookie 是否来自 HTTP Set-Cookie
  └─ NO（jsdom 加载失败 / VMP 有 CDN 反射检测）→ 第 4 步

第 4 步：加载完整 VM（仅调用签名入口）
  · 下载完整 JS 文件 → Node.js vm 中加载 → 按 hot_keys 补最小浏览器环境 → 调签名函数

第 5 步：实在无法脱离浏览器
  → firefox 引擎插桩执行受控取值（交付阶梯第 4 级），明确记录降级理由
```

**hot_methods × 环境属性 × cookie 来源 → 策略速查**：

| hot_methods 特征 | hot_keys 环境属性数 | cookie 来源（analyze_cookie_sources） | 策略 |
|-----------------|---------------------|--------------------------------------|------|
| 含 CryptoJS.MD5 / SubtleCrypto.digest / HMAC | 少（< 10） | 全部 js_document_cookie | 纯算法还原（crypto/hashlib） |
| 含 CryptoJS 但环境读取多 | 中（10-30） | 混合或 js_document_cookie | 提取 JS 签名函数 + vm/execjs 沙箱 |
| 全是自定义 fn 名，无可识别加密 | 多（30+） | 任意 | 路径 B：jsdom 环境伪装（[path-b.md](path-b.md)） |
| 全是自定义 fn 名 | 中-多 | 主要 http_set_cookie | 路径 B + 重点关注发 token 的 POST 接口 |

离线实现后：固定向量 parity 不一致时用 `verify_signer_offline` 做字符级首偏差定位（工具矩阵），把偏差收敛到具体拼接/编码环节。

## 11. 实战检查清单

**第一板斧 — Hook 出入口**：
- [ ] `search_code(keyword="switch", script_url=..., context_chars=500)` 确认是 VMP（case_count > 50）
- [ ] `inject_hook_preset("xhr", persistent=True)` + `("fetch", persistent=True)` 捕获请求出口
- [ ] `inject_hook_preset("cookie", persistent=True)` 原型链级 cookie hook
- [ ] `analyze_cookie_sources` 归因最终 cookie（HTTP vs JS）
- [ ] `inject_hook_preset("crypto", persistent=True)` 捕获加密原语入口（btoa/atob/CryptoJS/MD5/SHA）
- [ ] hook String.fromCharCode（JSVMP 高频信号）
- [ ] `hook_function(..., mode="intercept", non_overridable=True)` 防止 VMP 覆盖 hook

**第二板斧 — 插桩解释器**：
- [ ] `hook_jsvmp_interpreter(script_url=<VMP basename>)` 多路径探针（apply/call/bind + Reflect/Proxy）
- [ ] 分层 `hook_function(mode="trace")`（粗 → 中 → 细，`max_captures` 限制日志量）
- [ ] `hook_jsvmp_interpreter(mode="proxy", trackProps=True, targets=["navigator.*", "screen.*", ...])` 监控签名容器（仅行为型/纯混淆）
- [ ] `compare_env` 采集环境基准

**第三板斧 — 日志分析**：
- [ ] 控制台日志 + `instrumentation(action="log")` 全渠道收取，落盘 `tasks/<task-id>/runtime-evidence.jsonl`
- [ ] 反向追踪法，找到签名值首次出现的位置
- [ ] 多次请求对比，确认变化因子和固定因子

**第四板斧 — 源码级插桩**：
- [ ] `instrumentation(action="install", url_pattern=..., mode="ast"|"regex", tag=...)` 装好
- [ ] `instrumentation(action="reload")` 让插桩先于 VMP 生效
- [ ] `instrumentation(action="status")` + `tapInstalled` 运行时健康检查（§8.5）
- [ ] 读 `instrumentation(action="log")` 三个 summary：`hot_keys` / `hot_methods` / `hot_functions`
- [ ] `hot_keys` 给出 VMP 读取的环境指纹集（top 30）
- [ ] `hot_methods` 给出 VMP 调用的方法（ObjectType.methodName 格式）
- [ ] `instrumentation(action="stop")` 完工清理

**环境/时序**：
- [ ] 首屏挑战页：探针先于导航注册，或带插桩 reload 重来（invariants §2.2/§2.3）
- [ ] debugger 陷阱：`inject_hook_preset("debugger_bypass")`（详见 [../knowledge/anti-debug.md](../knowledge/anti-debug.md)）

**还原与验证**：
- [ ] 根据 hot_methods 判断算法类型，选还原策略（§10）
- [ ] 固定向量 parity + fresh replay（SKILL.md §7 完成契约）
- [ ] 端到端验证（连续 5+ 次请求稳定）

---

## 12. 陷阱速查

**Q1：`files_rewritten=0`，没改写到**：`url_pattern` 没命中（用 `list_network_requests` 确认实际 URL，glob 要 `**/` 前缀）；VMP 走了缓存（强制 `instrumentation(action="reload")` 或清缓存）；route 注册太晚（插桩必须在 `navigate` / reload **之前**注册）。

**Q2：AST 模式报 `parse_error`**：esprima 不支持的语法 → 降级 `mode="regex"`；或先用 `scripts` / `search_code` 把可疑语法片段读出来人工检查，再决定局部 patch。

**Q3：改写后页面崩溃**：① `files_rewritten > 0` 但 runtime 标记不存在——嵌套节点改写产物解析失败，停 AST route 降级 regex/transparent；② VMP 对源码做完整性校验——regex 轻改写、只改 member access；③ tag 变量名冲突——换 `tag` 重试；④ 改写后代码过大——调小 `max_rewrites`。

**Q4：hot_keys 没出现预期的环境指纹**：① VMP 还没真正执行——加大 `wait_until="networkidle"` 或 `wait_for` 元素后再读日志；② 改写或执行没成功——先看 `files_rewritten`，再查 `window.__mcp_tap_installed`；③ tag 搞混——核对 `tag_filter`。

**Q5：日志爆炸到上限**：`instrumentation(action="log", ..., clear=True)` 读完即清；收紧 `url_pattern` 只插桩必要的一个脚本；第一次跑用 `limit=300`，看 top hot_keys 就够。

---

> 深入阅读：[path-a.md](path-a.md)（板斧操作细则 + 降级梯度）、[path-b.md](path-b.md)（环境伪装）、[../knowledge/invariants.md](../knowledge/invariants.md)（检测不变量）、案例 [../cases/universal-vmp-source-instrumentation.md](../cases/universal-vmp-source-instrumentation.md)、[../cases/jsvmp-ruishu6-cookie-412-sdenv.md](../cases/jsvmp-ruishu6-cookie-412-sdenv.md)。
