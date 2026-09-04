# 路径 A：算法追踪 — 四板斧完整方法论

> lineage：蒸馏自 hello_js_reverse_skill `references/path-a-four-tools.md`（v3.4.1），2026-08-30 平移至 jsrev skill verticals/。工具名按 [../references/tool-matrix.md](../references/tool-matrix.md) 迁移表清零，过程状态一律落证据工作区 `tasks/<task-id>/`。
> **触发条件**：已完成反爬三分法分类（[../SKILL.md](../SKILL.md) §2）且目标不是签名型专属场景，选定路径 A（Hook / 插桩追踪算法）。
> **适用边界**：仅限授权目标，用户须自行确保已获授权。
> **配套**：[jsvmp.md](jsvmp.md)（识别/决策总纲 + 源码级插桩专项 + 健康诊断）、[path-b.md](path-b.md)（降级兜底）、[../knowledge/invariants.md](../knowledge/invariants.md)。

---

## 一、总览与适用性

核心方法论：**从 I/O 两端夹逼 + 中间层插桩 + 源码级全量 tap**。

- 第一/二/三板斧：诊断"VM 看外界"（入口）和"外界看 VM"（出口）——适合签名经 CryptoJS/atob/MD5 等可 hook 原语走的 VMP。
- 第四板斧：诊断"VM 看自己"——适合算法全部封装在字节码分发循环 `switch(opcode) { case N: obj[key](args); ... }` 里的场景。

### 四板斧概览表

| 板斧 | 名称 | 工具 | 擅长 | 不擅长 | 适用反爬类型 |
|------|------|------|------|--------|-------------|
| 第一斧 | Hook I/O | `inject_hook_preset(xhr/fetch/crypto/cookie)` + `hook_function(..., mode="intercept", non_overridable=True)` | 请求链路劫持、动态 Cookie、加密原语入口 | VM 内部自实现的 MD5/AES | 行为型 ✅ / 纯混淆 ✅ / 签名型 ❌ |
| 第二斧 | 插桩解释器 | `hook_function(mode="trace")` + `hook_jsvmp_interpreter(mode="proxy", trackProps=True)` | 能识别分发函数名时的调用链追踪 | 匿名 IIFE 包裹 + 高频日志爆炸 | 行为型 ✅ / 纯混淆 ✅ / 签名型 ❌ |
| 第三斧 | 日志分析 | 控制台日志 + `instrumentation(action="log")` + 反向追踪 | 已能捕获签名值 I/O 时反推公式 | 签名完全不出 VM 的黑箱模式 | 所有类型 ✅（纯被动分析，无副作用） |
| 第四斧 | 源码级插桩 | `instrumentation(action="install"/"log")` | VM 内部调度、"全部在 opcode dispatch 循环里发生"的场景；`hot_keys` 直接暴露环境指纹集 | 极限大文件（5MB+）开销高；改写后必须验证 runtime 已执行 | 所有类型 ✅，**签名型首选** |

### 按反爬类型的适用性

| 反爬类型 | 可用板斧 | 说明 |
|----------|----------|------|
| **签名型**（RS / Akamai / Shape） | **仅第四斧**（+ transparent 探针） | 前三板斧会改变环境、破坏签名。源码级插桩不动运行时环境，是唯一通用解 |
| **行为型**（短视频平台 / JY） | **全部四斧** | 不校验浏览器原生性，所有工具可用 |
| **纯混淆**（obfuscator.io / 自研 VMP） | **全部四斧** | 只是代码难读，不检测观察者 |

引擎分工：板斧一至四都在 **firefox 引擎**上执行（`hook_jsvmp_interpreter` proxy/transparent 双模式 + `instrumentation` 源码级插桩）；chrome 引擎真断点仅作辅助取证（暂停态看调用栈/作用域，操作要快）。

---

## 二、快速 8 步（70%+ RS/Akamai/webmssdk 场景先试这个）

```
步骤 1：确认是否 VMP
  search_code(keyword="switch", script_url="<VMP脚本URL>", context_chars=500)
  → case_count > 50 基本确认是 VMP

步骤 2：一键装通用探针
  hook_jsvmp_interpreter(script_url=<VMP basename>)
  → 自动覆盖 apply/call/bind + Reflect/Proxy 全局对象 + timing/random

步骤 3：装出口 Hook
  inject_hook_preset("cookie", persistent=True) + inject_hook_preset("xhr", persistent=True)

步骤 4：装源码级插桩（核心）
  instrumentation(action="install", url_pattern="**/<VMP 文件>", mode="ast", tag="vmp1")
  （AST 在 MCP 侧解析，不依赖页面联网，挑战页可用）

步骤 5：让所有探针先于 VMP 生效
  instrumentation(action="reload")   → 清日志，获得干净快照

步骤 6：触发目标操作
  evaluate_js / click / type_text → 翻页、搜索、登录等

步骤 7：读 hot_keys（30 秒定位环境指纹集）
  instrumentation(action="log", tag_filter="vmp1", type_filter="tap_get", limit=300)
  → 看 hot_keys / hot_methods / hot_functions 三个 summary

步骤 8：交叉印证
  get_console_logs（hook 输出） + analyze_cookie_sources()
```

无法解决时再走下方手动四板斧流程。

---

## 三、第一板斧：Hook I/O（确定 I/O 边界）

目标：确定 JSVMP 的输入（读了什么环境值、接收了什么参数）和输出（生成了什么签名、写了什么 Cookie）。

**步骤 0：一键装多路径探针（推荐先试）**

```
hook_jsvmp_interpreter(script_url=<VMP basename>)
```

**步骤 1：Hook 出口 — 请求与 Cookie**

```
inject_hook_preset("xhr", persistent=True)     # XHR 请求出口
inject_hook_preset("fetch", persistent=True)   # fetch 请求出口
inject_hook_preset("cookie", persistent=True)  # 原型链级 cookie hook

hook_function("XMLHttpRequest.prototype.open", mode="intercept", non_overridable=True)
→ 冻结 XHR.open 防止页面 JS 覆盖 Hook

analyze_cookie_sources()
→ 辨识每个 Cookie 是 HTTP Set-Cookie / JS document.cookie / 混合写入
```

**步骤 2：Hook 入口 — 加密原语**

```
inject_hook_preset("crypto")
→ 自动捕获 btoa/atob/JSON.stringify I/O

hook_function(
  function_path="String.fromCharCode",
  hook_code="console.log('[MCP] fromCharCode:', JSON.stringify([...arguments]))",
  position="before"
)
→ 捕获字符编码操作（JSVMP 高频信号）
```

CryptoJS 等加密库入口的手工包装示例：

```javascript
const _origMD5 = window.CryptoJS?.MD5;
if (_origMD5) {
  window.CryptoJS.MD5 = function() {
    console.log('[CryptoJS.MD5] input:', arguments[0]?.toString());
    const result = _origMD5.apply(this, arguments);
    console.log('[CryptoJS.MD5] output:', result.toString());
    return result;
  };
}
```

**步骤 3：关联出入口数据**

```
出口捕获到的签名值（如 sign=abc123）
+ 入口捕获到的加密原语调用（如 MD5("timestamp+key")）
→ 关联两者，推断签名公式
```

---

## 四、第二板斧：插桩解释器（追踪执行链路）

**步骤 4：定位字节码分发函数**

```
search_code(keyword="switch", script_url="<VMP脚本URL>", context_chars=500)
→ 定位 case_count > 20 的 switch；case_count > 50 基本确认是 VMP 解释器
```

**步骤 5：分层追踪函数调用（粗 → 中 → 细）**

```
# 粗粒度：追踪解释器主函数
hook_function(function_path="<解释器主函数>", mode="trace",
              log_args=True, log_return=True, log_stack=False, max_captures=100)
# 中粒度：追踪子 handler
hook_function(function_path="<子handler函数>", mode="trace",
              log_args=True, log_return=True, log_stack=True, max_captures=50)
# 细粒度：追踪特定加密函数
hook_function(function_path="<加密函数路径>", mode="trace",
              log_args=True, log_return=True, log_stack=True, max_captures=30)
⚠️ 必须设置 max_captures 限制日志量，高频调用函数（每秒数千次）会爆炸
```

**步骤 6：监控签名容器 + 采集环境基准**

```
hook_jsvmp_interpreter(mode="proxy", trackProps=True)
→ 监控 navigator.*/screen.*/document.cookie 等签名容器的属性读取
⚠️ proxy 模式仅限行为型/纯混淆目标（签名型禁用，invariants §2.1）

compare_env()
→ 采集浏览器环境基准数据（navigator/screen/canvas/WebGL/Audio/timing）
```

---

## 五、第三板斧：日志分析（从海量数据提取签名链路）

**步骤 7：多维度日志采集**（落盘 `tasks/<task-id>/runtime-evidence.jsonl`）

```
get_console_logs                                  # hook 输出（hook_code / trace 捕获）
instrumentation(action="log", tag_filter=...)     # 插桩 tap 记录与三个 summary
```

**步骤 8：反向追踪法**——效率最高的海量日志分析方法：

```
1. 从已知签名值（如 sign=abc123）出发
2. 在所有日志中搜索该值首次出现的位置
3. 从该位置反向追踪：该值由哪个函数生成？输入是什么？输入又来自哪里？
4. 逐层追踪直到找到原始明文输入
```

**步骤 9：验证提取的算法**

```
evaluate_js("提取的签名函数(已知输入)")
→ 对比输出与实际请求中的签名值；一致则算法提取成功
```

---

## 六、第四板斧：源码级插桩（签名型唯一通用解）

目标：在 HTTP 层改写 VMP 源码，对每个 `obj[key]` 读取和 `fn(args)` 调用插入 tap，不改变运行时环境。

**为什么需要**：RS 5/6、Akamai sensor_data v2/v3、webmssdk 的算法全部内联在 opcode dispatch 循环内，`hook_jsvmp_interpreter` 看不到 `opcode_table[code]` 调度（盲区分析见 [jsvmp.md](jsvmp.md) §8.1）。

**步骤 10：安装源码级插桩**

```
instrumentation(
  action="install",
  url_pattern="**/<VMP 文件>",
  mode="ast",              # 默认推荐：MCP 侧 esprima，挑战页可用
  tag="vmp1",
  rewrite_member_access=True,
  rewrite_calls=True
)
# esprima 解析失败自动 fallback 到 regex（fallback_on_error=True）
```

**步骤 11：让插桩先于 VMP 生效**

```
instrumentation(action="reload")
→ 清空页面内 tap 缓冲，获得干净的一次执行捕获

⚠️ 签名型反爬：不要清 cookie！第一次挑战拿到的 cookie 要留下
```

**步骤 12：验证改写产物实际执行**

```
instrumentation(action="status")
evaluate_js(expression="(() => ({
  tapInstalled: window.__mcp_tap_installed === true,
  logReady: Array.isArray(window.__mcp_vmp_log)
}))()")

判定：
- files_rewritten > 0 且 tapInstalled=false
  → 改写文本已下发但浏览器未执行；优先怀疑嵌套 AST 节点改写损坏
- tapInstalled=true 且日志为空
  → runtime 已执行；继续检查触发动作和 tag_filter
```

**步骤 13：读取插桩日志（指纹学习的金矿）**

```
# hot_keys：VMP 读取了哪些属性，按频次倒排
instrumentation(action="log", tag_filter="vmp1", type_filter="tap_get", limit=200)
→ 典型 RS 输出：{"userAgent":120, "plugins":98, "webdriver":77, "cookie":43, ...}
→ 这就是 VMP 参与签名哈希的完整环境指纹集

# hot_methods：VMP 调用了哪些方法（ObjectType.methodName 格式）
instrumentation(action="log", tag_filter="vmp1", type_filter="tap_method", limit=200)
→ 能否看到 MD5/AES/HMAC 是"算法是否用标准加密"的核心判据

# hot_functions：VMP 调用了哪些函数
instrumentation(action="log", tag_filter="vmp1", type_filter="tap_call", limit=200)
→ 看有没有 btoa/atob/encodeURIComponent 等熟识函数
```

**步骤 14：完工清理**

```
instrumentation(action="stop", url_pattern="**/<VMP 文件>")   # 关闭源码级 route
remove_hooks()                                                 # 需要时清 hook
```

---

## 七、失败模式与降级

### 常见失败模式

| 失败表现 | 可能原因 | 应对 |
|----------|----------|------|
| `files_rewritten > 0` 但 `__mcp_tap_installed=false` | 改写产物未解析/未执行，常见于嵌套 call/member/new 链 | 停止 AST route，按 regex → transparent 降级 |
| runtime 已安装但 `instrumentation(action="log")` 返回空 | VMP 未触发 / tag_filter 不匹配 | 重新触发业务动作并检查 tag_filter |
| `hot_keys` 只有 < 5 个属性 | regex 模式覆盖率不足 | 切换 mode="ast" 或增大 context_chars |
| 签名值始终不一致 | 环境指纹参与哈希但未补齐 | 根据 hot_keys 逐项补齐环境 |
| `navigate` 反复 412 | 观察者效应——Hook 破坏了签名 | 移除所有 hook，改用源码级插桩 |
| AST 模式持续 fallback 到 regex | esprima 无法解析目标语法 | 接受 regex 80% 覆盖率，或退到 transparent 模式 |

### 降级梯度（必须逐级走）

```
L1: instrumentation(action="install", mode="ast")
  → status + runtime 标记健康检查失败
L2: instrumentation(action="install", mode="regex")
  → 覆盖率不足
L3: hook_jsvmp_interpreter(mode="transparent")
  → 日志太少
L4: hook_jsvmp_interpreter(mode="proxy")    ← 仅行为型/纯混淆可用！
  → 破坏签名
L5: 路径 B（jsdom 环境伪装，见 path-b.md）
  → 也失败
L6: 向用户说明情况，建议插桩执行档位或 sdenv 方案
```

**关键规则**：

- L1→L2→L3 是标准降级路径，每级必须尝试；
- L3→L4 仅对行为型反爬开放，签名型必须走 L3→L5；
- 到达 L6 前必须在 case 记录完整降级路径；
- **禁止从 L1 直接跳到 L6**。

---

## 八、还原策略选择

四板斧完成后，根据收集到的信息选策略（`hot_keys` / `hot_methods` 是共同输入，决策树详见 [jsvmp.md](jsvmp.md) §10）：

| 情况 | 策略 | 实现方式 |
|------|------|---------|
| 签名使用标准算法（MD5/HMAC/AES），hook 日志能看到对应 API 调用 | 纯算法还原 | Node.js `crypto` / Python `hashlib` + `pycryptodome` |
| 签名逻辑是标准算法但拼接规则复杂 | 还原拼接逻辑 + 标准算法 | 提取拼接顺序和格式，手动实现 |
| 签名逻辑完全定制化，但 `hot_keys` 清晰暴露输入域 | 提取最小 JS 片段执行 | Node.js `vm` 沙箱 / Python `execjs` |
| VM 劫持了整个请求链路，cookie 主要来自 HTTP Set-Cookie | 纯算法还原不现实 | 转路径 B：jsdom 环境伪装 |
| VM 算法全部内联在 dispatch 循环，源码插桩也无法还原 | 加载完整 VM + 最小环境 | 转路径 B：优先 jsdom 运行原始脚本 |

```
路径 A-1 — hot_methods 里出现 CryptoJS.MD5 / SubtleCrypto.digest
  → 纯算法还原

路径 A-2 — hot_methods 里全是自定义 fn 名
  → 提取 VMP 子片段 + Node.js vm 沙箱运行

路径 B — hot_keys 环境指纹很多（navigator/screen/webgl 40+）
         + analyze_cookie_sources 显示 cookie 来自 HTTP Set-Cookie
  → jsdom 环境伪装（见 path-b.md）
```

---

## 九、JSVMP 核心经验（路径 A 专项）

1. **VM 解释器本身不是目标，签名函数的 I/O 才是目标**——不要试图反编译字节码。
2. **先 Hook 出口确定"要什么"，再 Hook 入口确定"给了什么"**——出口驱动分析。
3. **`hook_function(mode="trace")` 对高频调用函数日志量可能爆炸**——必须设 `max_captures`。
4. **海量 trace 数据用反向追踪法本地过滤**，效率最高。
5. **`mode="regex"` 对带模板字符串、正则字面量的代码可能误改写**——AST 有语法感知，但改写后仍必须验证产物已执行。
6. **前三板斧对签名型反爬不可用**——hook `Function.prototype.apply` 会改变 toString 原生性；Proxy 在 navigator 上会被检测。
7. **源码直提的字符串数组全是单字母乱码 = 字符串被动态解密**——静态提取无效，改用运行时插桩日志。
8. **宽泛关键词在超大文件（380KB+）会返回大量无关结果**——用 `search_code(keyword, script_url=...)` 配合更精确关键词。
9. **插桩 route 按 URL 缓存改写结果**——同一 url_pattern 重复 install 前先 `instrumentation(action="stop")` 旧 route。

---

> 深入阅读：[jsvmp.md](jsvmp.md)（识别/决策/健康诊断/陷阱）、[path-b.md](path-b.md)（降级兜底）、案例 [../cases/universal-vmp-source-instrumentation.md](../cases/universal-vmp-source-instrumentation.md)。
