# 检测不变量（Detection Invariants）

> lineage：三源合一——chrome 引擎 `engines/chrome/docs/anti-detection-work.md` 五原则 + firefox 引擎 `hook_jsvmp_interpreter`/`jsvmp_hook.js`/`jsvmp_transparent_hook.js` 的签名型禁令与残留痕迹 + trace `browser-observe.md` 串行纪律。
> 本文件是 SKILL.md §6 检测不变量的展开版，是全部引擎操作检测纪律的**唯一来源**。

## 0. 定位

这些不变量是踩过坑验证出来的，不是风格偏好。任何引擎操作（导航、取证、hook、插桩、断点）开始前对照一遍；试图"加一层 stealth 绕过限制"本身就是被验证过的失败路线。违反导致的最轻后果是触发 "unusual traffic" 拦截，最重是整条会话链被标记、后续所有证据作废。

## 1. chrome 引擎五原则

### 1.1 绝不做 JS 层反检测

包装层**绝不**通过 `addInitScript` 或 `Object.defineProperty` 修改 `navigator.*` / `screen.*` / `chrome.*` 等属性。JS patch 必留三类痕迹，高强度反爬（Google reCAPTCHA、FingerprintJS 等）会**精确检查**：

| 检测点 | 被 hack 后的表现 | 真实 Chrome |
|---|---|---|
| `Object.getOwnPropertyDescriptor` | 能看到 getter/setter 痕迹 | 这些属性都是 data property |
| `Error.stack` | 出现 `UtilityScript` / `eval at ...` 字样 | 普通调用栈 |
| `Function.prototype.toString` | 不再是 `[native code]` | 原生函数返回 native code |

真正的反检测只发生在两层：C++ binary 层（cloak）+ CDP 协议层（Patchright）。历史教训：曾有 stealth 初始化脚本试图修复 `chrome.runtime` / `screen.availHeight` 等"残留泄露"，结果被 Google 直接检测——**已删除，不要重新引入**。

### 1.2 绝不做 config 级指纹 hack

`--lang=en-US`、`--window-size=1920,1080`、`--fingerprinting-canvas-image-data-noise` 这类启动参数同为 stealth 反模式：靠 flag 假装真实浏览器、Chrome 升级一两个版本就失效、flag 组合本身可能成为指纹。正确做法：用真实 OS 默认值（`viewport: null`），或用 cloak binary 的源码层 patch（`--fingerprint=<seed>` 让二进制内部派生一致指纹）。历史教训：137 行 STEALTH_ARGS 走过这条路，**已删除，不要重新引入**。

### 1.3 CDP 延迟激活

页面加载期间**不激活任何 CDP 域**：`Network.enable` / `Debugger.enable` / `Audits.enable` 全部延后到首个**非导航**工具调用。anti-bot 脚本（知乎 40362、Cloudflare 挑战、reCAPTCHA 等）在加载阶段实时探测 CDP 事件订阅，看到即判机器人。延后初始化 = 让风控 JS 跑完、放过你，然后再开调试通道。

由此得到标准工作流（**先导航再刷新**）：

```text
1. new_page(url)            → 静默导航，过风控
2. 任意非导航工具调用        → collectors 激活（此时请求列表可能为空，属正常）
3. 导航刷新                  → 带采集重放
4. 取证工具                  → 现在能看到完整请求列表
```

加载期间的请求、console、WebSocket、脚本列表不会被收集——这是设计如此，不是缺陷。

### 1.4 分清「stealth 删除」与「UX 删除」

清理 stealth 代码时**按运行时行为分类，而不是按文件名分类**。例：`--test-type` 历史上和 stealth 写在一起，但它的真实角色是 UX flag（抑制「未受支持命令行标记」黄条），不能跟 stealth 一起删。判断方法：删除前问一句——"这个 flag 在 runtime 里实际做什么？删了用户会立刻看到什么变化？"

### 1.5 headed-only

`headless: false` 写死，不暴露 `--headless` flag。理由：本引擎是给人类分析师用的视觉调试工具；headless 即使叠加 cloak 仍有其他检测手段；暴露 flag 等于给用户挖坑。

## 2. firefox 引擎：签名型禁令

### 2.1 Proxy 式 hook 可被 RS/AK 检测

JSVMP 运行时探针的 **proxy 模式**（包装 `Reflect.get/apply`、给 navigator/screen 等全局对象装 Proxy、拦截 timing API）对 RS/AK 式签名型反爬 **可被检测**。签名型目标只允许两条路：

- `instrumentation(action="install")`——源码级改写（AST/regex），不动运行时环境；
- `hook_jsvmp_interpreter(mode="transparent")`——透明探针（见 2.4）。

proxy 模式仅限行为型/纯混淆目标。残留痕迹：Proxy 对象本身可被 proxy 检测启发式发现；另会留下 `window.__mcp_proxy_originals`、`window.__mcp_jsvmp_installed` 等全局标记。环境篡改同理默认禁用（主 skill §2/§8）；确要使用，必须在 MODE 声明风险并经用户确认。

### 2.2 闭包捕获时序坑

同步加载的 SDK（如 webmssdk）的 JSVMP 解释器在**启动时**通过闭包捕获原生引用。导航之后才装 hook → SDK 闭包里已持有原始未 hook 的引用 → 你的 hook 永远不会触发，且看起来"一切正常"。正确顺序必须固化：

```text
1. launch_browser
2. 装 hook（transparent 模式 / persistent）
3. navigate
```

已经导航过才想起装 hook：装完后强制带 hook 重载（`instrumentation(action="reload")` 或 hook 后 `reload`），否则本次会话的观测是空的。

### 2.3 route / hook 晚注册漏首屏

任何"导航完成后才注册"的拦截都会错过首屏挑战与首个请求——RS 412、Akamai 首包恰恰发生在首屏。规则：**所有 hook/插桩必须先于导航注册**；晚了就带插桩 reload 重来，不要试图"补抓"首屏。

### 2.4 透明探针的适用场景与残留痕迹

transparent 模式只替换原型对象上的 getter 函数（`Navigator.prototype` / `Screen.prototype` / `Document.prototype` 等）：从不使用 Proxy，从不碰 `Function.prototype`。抵抗性来源：

- `typeof navigator`、`navigator.constructor`、`Navigator` 本体与原型链和原始完全一致；
- 新 getter 的 `toString()` 返回与原 getter 相同的字符串；
- 不存在 Proxy 对象，proxy 检测启发式全部失效。

**唯一残留痕迹：getter 函数对象身份不同**（做函数身份比对类检测理论上可察觉）。适用场景：签名型目标的运行时观测首选；它不支持的目标改用源码级插桩。

### 2.5 手段 × 残留 × 签名型可用性对照

| 手段 | 可见残留 | 签名型可用 |
|---|---|---|
| proxy 模式 hook | Proxy 对象 + `__mcp_*` 全局标记 | 否 |
| transparent 透明探针 | getter 函数对象身份 | 是（运行时观测首选） |
| instrumentation 源码级改写 | 改写后的源码本身（源码哈希/长度类完整性校验可发现） | 是（插桩首选） |
| chrome 引擎只读取证 + 真断点 | CDP 延迟激活前不可见；断点暂停时长会被标记 | 是（取证面，操作要快） |

## 3. 串行纪律（双引擎通用）

- **同一时间只允许一个浏览器工具家族持有 live target**。
- 切换引擎/工具家族前：保存基线（页面状态、已捕获请求、hook 状态）并记录状态是否可重放。
- 禁止对同一条一次性会话链并行开多个 target-active 浏览器。
- 断点暂停时间过长会被风控标记：暂停态操作要快，取证一次到位。
- 观测退出条件：能说清哪个请求重要、哪些字段在动、哪个脚本/运行时边界改变它们、还缺什么证据——说清即可转入 hook/AST/补环境/离线重建。

## 4. 引用方

引用方：SKILL.md §6、双 server instructions（jsrev-chrome / jsrev-firefox 均以本文件为其检测纪律来源）。
