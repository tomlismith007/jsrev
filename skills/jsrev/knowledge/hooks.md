# hooks — JS Hook 技术模板库

> 蒸馏自 `hello_js_reverse_skill/references/hook-techniques.md`（13 种 hook 模板）与 `trace/references/browser-hook.md`（最小 hook 纪律 / 3 段粘贴式观察器），jsrev 融合版 2026-08-30。
> Hook 是 JS 逆向的核心手段之一：通过劫持/拦截 JS 原生函数或对象属性，捕获加密函数输入输出、Cookie 生成过程、网络请求参数构造等关键证据。仅限授权目标，用户须自行确保已获授权。

## 0. 总纲：Hook 纪律（先读）

Hook 是**临时取证工具**，不是常驻设施：

1. Hook 能回答问题的最小对象或函数——不要一把梭全装。
2. 只在需要时记录参数、返回值、关键 header、URL 与调用栈。
3. 非任务明确要求，不得改变生产行为（拦截器证明类任务除外）。
4. 用 hook 结果做验收之前，先无 hook 复现一次，确认干净行为一致。
5. 收尾必报：用了哪个 hook、观察到了什么、定位到哪个栈/脚本、无 hook 复现是否一致。
6. **检测纪律**（与 SKILL.md §6 一致）：签名型目标禁 Proxy 式 hook 与运行时改写（可被检测），只允许源码级插桩或引擎层观测；Proxy 变体仅在行为型/纯混淆目标上使用。

## 1. 注入方式

- **页面脚本加载前注入**（init-script 方式）：保证 hook 先于目标代码生效——首选。
- **页面加载后动态注入**：JS 执行能力（`evaluate_js`）在当前页面上下文执行，适合动态补挂。
- **预设一键注入**：`inject_hook_preset(preset="xhr|fetch|crypto|websocket|debugger_bypass|cookie|runtime_probe")`。
- **定向 hook**：`hook_function(function_path="目标函数", hook_code="...", position="before|after|replace")`。
- **首屏挑战页**：RS/Akamai 类首包挑战在 hook 装好前就跑完 → 用带预注入参数的导航（`pre_inject_hooks`），或注入持久化 hook 后 `reload`（持久化 hook 会先于页面脚本执行）。
- **结果收集**：控制台读取（`get_console_logs`）；关键点用 `console.trace` 输出调用栈。
- **本地生成 hook 代码**：`jsrev hookgen <type>`（如 `jsrev hookgen cookie --target "acw_tc"`，实现见 `cli/vendor/hook-generator.js`）——已内置修复版原型链 cookie 模板。
- firefox 引擎优势：Juggler 协议沙箱隔离，hook 不被页面 JS 检测到。

## 2. Hook 模板库

### 2.1 Cookie 写入 Hook — 只用原型链级写法

**裁决**：实例级 `Object.defineProperty(document, 'cookie', ...)` 写法**无效**，会被浏览器忽略——`cookie` 的 getter/setter 定义在原型链上（`Document.prototype` 或 `HTMLDocument.prototype`），不在 `document` 实例上。实例级 defineProperty "看起来装上了但完全抓不到 cookie 写入"，这是自写 cookie hook 最常见的翻车原因。必须沿原型链找到 owner 再覆写：

```javascript
(function () {
    window.__mcp_cookie_log = window.__mcp_cookie_log || [];

    // 沿原型链找到定义 cookie 描述符的 owner
    function findCookieDescriptor() {
        var proto = Object.getPrototypeOf(document);
        while (proto) {
            var d = Object.getOwnPropertyDescriptor(proto, 'cookie');
            if (d) return { descriptor: d, owner: proto };
            proto = Object.getPrototypeOf(proto);
        }
        return null;
    }

    var found = findCookieDescriptor();
    if (!found) return;

    var origSet = found.descriptor.set;
    var origGet = found.descriptor.get;

    // 在正确的 owner 上替换（关键：owner 是 Document.prototype 或 HTMLDocument.prototype）
    Object.defineProperty(found.owner, 'cookie', {
        set: function (value) {
            window.__mcp_cookie_log.push({
                op: 'set', value: String(value),
                stack: new Error().stack, ts: Date.now()
            });
            return origSet.call(this, value);
        },
        get: function () {
            var v = origGet.call(this);
            window.__mcp_cookie_log.push({
                op: 'get', value: String(v),
                stack: new Error().stack, ts: Date.now()
            });
            return v;
        },
        configurable: true, enumerable: true
    });
})();
```

详细原理、使用方式与适用场景见 §3。

### 2.2 XHR Hook

**用途**：拦截所有 XMLHttpRequest 请求，捕获完整请求参数。

```javascript
(function() {
    const _open = XMLHttpRequest.prototype.open;
    const _send = XMLHttpRequest.prototype.send;
    const _setHeader = XMLHttpRequest.prototype.setRequestHeader;
    
    XMLHttpRequest.prototype.open = function(method, url) {
        this._hookMethod = method;
        this._hookUrl = url;
        this._hookHeaders = {};
        console.log('[Hook] XHR Open:', method, url);
        return _open.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this._hookHeaders[name] = value;
        return _setHeader.apply(this, arguments);
    };
    
    XMLHttpRequest.prototype.send = function(body) {
        console.log('[Hook] XHR Send:', {
            method: this._hookMethod,
            url: this._hookUrl,
            headers: this._hookHeaders,
            body: body
        });
        if (this._hookUrl.indexOf('目标接口') !== -1) {
            console.log('[Hook] ★ 目标请求捕获');
            console.trace('[Hook] 请求调用栈');
        }
        return _send.apply(this, arguments);
    };
})();
```

### 2.3 Fetch Hook

**用途**：拦截 fetch API 请求。

```javascript
(function() {
    const _fetch = window.fetch;
    window.fetch = function(url, options) {
        console.log('[Hook] Fetch:', url, options);
        if (typeof url === 'string' && url.indexOf('目标接口') !== -1) {
            console.log('[Hook] ★ 目标Fetch捕获');
            console.trace('[Hook] Fetch 调用栈');
        }
        return _fetch.apply(this, arguments);
    };
})();
```

### 2.4 $.ajax Hook（jQuery 场景）

**用途**：拦截 jQuery AJAX 请求，捕获加密参数。

```javascript
(function() {
    if (typeof $ === 'undefined' || typeof $.ajax === 'undefined') return;
    
    const _ajax = $.ajax;
    $.ajax = function(options) {
        if (typeof options === 'object') {
            console.log('[Hook] $.ajax:', {
                url: options.url,
                method: options.type || options.method,
                data: options.data,
                headers: options.headers
            });
            
            if (options.url && options.url.indexOf('目标接口') !== -1) {
                console.log('[Hook] ★ 目标Ajax捕获');
                if (options.data && options.data.m) {
                    console.log('[Hook] 加密参数 m:', options.data.m);
                }
            }
        }
        return _ajax.apply(this, arguments);
    };
    
    // 同时 Hook ajaxSetup
    if ($.ajaxSetup) {
        const _setup = $.ajaxSetup;
        $.ajaxSetup = function(options) {
            console.log('[Hook] $.ajaxSetup:', options);
            return _setup.apply(this, arguments);
        };
    }
})();
```

### 2.5 eval / Function Hook

**用途**：捕获动态生成和执行的代码。

```javascript
(function() {
    // eval Hook
    const _eval = window.eval;
    window.eval = function(code) {
        console.log('[Hook] eval 调用, 代码长度:', (typeof code === 'string') ? code.length : 'N/A');
        if (typeof code === 'string' && code.length < 5000) {
            console.log('[Hook] eval 代码:', code.substring(0, 500));
        }
        return _eval.apply(this, arguments);
    };
    
    // Function 构造器 Hook
    const _Function = Function;
    const handler = {
        construct(target, args) {
            const body = args[args.length - 1];
            console.log('[Hook] new Function, body 长度:', body ? body.length : 0);
            if (body && body.indexOf('目标关键词') !== -1) {
                console.log('[Hook] ★ 目标 Function 捕获:', body.substring(0, 500));
            }
            return new target(...args);
        },
        apply(target, thisArg, args) {
            const body = args[args.length - 1];
            console.log('[Hook] Function(), body 长度:', body ? body.length : 0);
            return target.apply(thisArg, args);
        }
    };
    window.Function = new Proxy(_Function, handler);
})();
```

### 2.6 JSON.parse Hook

**用途**：捕获 JSON 解析操作，常用于响应数据解密场景。

```javascript
(function() {
    const _parse = JSON.parse;
    JSON.parse = function(text) {
        const result = _parse.apply(this, arguments);
        console.log('[Hook] JSON.parse:', typeof text === 'string' ? text.substring(0, 200) : text);
        return result;
    };
})();
```

### 2.7 JSON.stringify Hook

**用途**：捕获 JSON 序列化操作，常在签名前执行。

```javascript
(function() {
    const _stringify = JSON.stringify;
    JSON.stringify = function(obj) {
        const result = _stringify.apply(this, arguments);
        console.log('[Hook] JSON.stringify:', result ? result.substring(0, 200) : result);
        return result;
    };
})();
```

### 2.8 atob / btoa Hook

**用途**：捕获 Base64 编解码操作。

```javascript
(function() {
    const _atob = window.atob;
    const _btoa = window.btoa;
    
    window.atob = function(str) {
        const result = _atob(str);
        console.log('[Hook] atob:', str.substring(0, 100), '→', result.substring(0, 100));
        return result;
    };
    
    window.btoa = function(str) {
        const result = _btoa(str);
        console.log('[Hook] btoa:', str.substring(0, 100), '→', result.substring(0, 100));
        return result;
    };
})();
```

### 2.9 setTimeout / setInterval Hook

**用途**：监控定时器调用，识别反调试和周期性操作。

```javascript
(function() {
    const _setTimeout = window.setTimeout;
    const _setInterval = window.setInterval;
    
    window.setTimeout = function(fn, delay) {
        const fnStr = typeof fn === 'function' ? fn.toString().substring(0, 200) : String(fn).substring(0, 200);
        // 过滤 debugger 反调试
        if (fnStr.indexOf('debugger') !== -1) {
            console.log('[Hook] setTimeout 拦截 debugger，已跳过');
            return -1;
        }
        return _setTimeout.apply(this, arguments);
    };
    
    window.setInterval = function(fn, delay) {
        const fnStr = typeof fn === 'function' ? fn.toString().substring(0, 200) : String(fn).substring(0, 200);
        if (fnStr.indexOf('debugger') !== -1) {
            console.log('[Hook] setInterval 拦截 debugger，已跳过');
            return -1;
        }
        return _setInterval.apply(this, arguments);
    };
})();
```

### 2.10 WebSocket Hook

**用途**：拦截 WebSocket 消息。

```javascript
(function() {
    const _WebSocket = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        console.log('[Hook] WebSocket 连接:', url);
        const ws = new _WebSocket(url, protocols);
        
        const _send = ws.send.bind(ws);
        ws.send = function(data) {
            console.log('[Hook] WS 发送:', data);
            return _send(data);
        };
        
        ws.addEventListener('message', function(event) {
            console.log('[Hook] WS 接收:', event.data);
        });
        
        return ws;
    };
    window.WebSocket.prototype = _WebSocket.prototype;
})();
```

### 2.11 window 属性访问 Hook（蜜罐检测）

**用途**：监控对 window 属性的访问，识别蜜罐检测。

```javascript
(function() {
    const handler = {
        get(target, prop, receiver) {
            if (['__selenium', '__webdriver_script_fn', '__driver_evaluate',
                 '$cdc_asdjflasutopfhvcZLmcfl_', 'callPhantom', '_phantom'].includes(prop)) {
                console.log('[Hook] ★ 蜜罐属性访问:', prop);
                return undefined;
            }
            return Reflect.get(target, prop, receiver);
        }
    };
    // 注意：直接代理 window 风险较大，仅在需要时使用
})();
```

### 2.12 Canvas 指纹 Hook

**用途**：拦截 Canvas 指纹采集。

```javascript
(function() {
    const _toDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function() {
        console.log('[Hook] Canvas toDataURL 调用');
        console.trace('[Hook] Canvas 调用栈');
        return _toDataURL.apply(this, arguments);
    };
    
    const _toBlob = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function() {
        console.log('[Hook] Canvas toBlob 调用');
        return _toBlob.apply(this, arguments);
    };
})();
```

### 2.13 Navigator 属性伪装

**用途**：伪装浏览器指纹。注意：这属于环境篡改，签名型目标禁用（见 §0 纪律 6）；轻量伪装可参考 [env-patch-jsdom.md](env-patch-jsdom.md) 的完整补丁。

```javascript
(function() {
    Object.defineProperty(navigator, 'webdriver', {
        get: () => false
    });
    Object.defineProperty(navigator, 'plugins', {
        get: () => [1, 2, 3, 4, 5]
    });
    Object.defineProperty(navigator, 'languages', {
        get: () => ['zh-CN', 'zh', 'en']
    });
})();
```

## 3. Cookie 原型链级 Hook 详解

### 为什么不能直接 `Object.defineProperty(document, 'cookie', ...)`

`document.cookie` 的 getter/setter 定义在**原型链**上（具体是 `Document.prototype` 或 `HTMLDocument.prototype`），不在 `document` 实例上。直接在实例上 defineProperty 会被浏览器忽略或抛错。实例级写法一律废弃（含"先从 `Document.prototype`/`HTMLDocument.prototype` 取描述符、再 defineProperty 回 `document` 实例"的变体——同样是实例级覆写），统一用 §2.1 的 owner 覆写版。

### 使用方式（三步）

```text
# 1. 注入（默认持久化）——两种来源任选：
#    a. jsrev 本地生成：jsrev hookgen cookie --target "目标cookie名"
#    b. firefox 引擎预设：inject_hook_preset(preset="cookie", persistent=True)

# 2. 触发场景（登录、刷新、带指纹 cookie 的页面流程）

# 3. 拉日志
#    a. 读原始日志：
evaluate_js(expression="JSON.stringify(window.__mcp_cookie_log.slice(-20))")
#    b. 或直接走 Cookie 归因（推荐）：
analyze_cookie_sources(name_filter="目标cookie名")
```

### 适用场景

- 所有涉及 JS 写入 cookie 的场景（eval 首包、指纹 cookie、JS 计算 token 后 `document.cookie = ...`）。
- **不适用**：HTTP Set-Cookie 写入的场景（这种用 `analyze_cookie_sources` 的 http_responses 分支）。

## 4. 组合模板：通用逆向分析 Hook（一键注入）

cookie 部分必须用 §2.1 的原型链级模板替换（实例级写法无效），其余原样：

```javascript
(function() {
    console.log('[Hook] ========== 通用逆向Hook已注入 ==========');
    
    // 1. Cookie 监控 —— 此处用 §2.1 原型链级模板（实例级 defineProperty(document,'cookie') 无效）
    
    // 2. XHR 监控
    const _xhrOpen = XMLHttpRequest.prototype.open;
    const _xhrSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(m, u) { this._m = m; this._u = u; return _xhrOpen.apply(this, arguments); };
    XMLHttpRequest.prototype.send = function(b) { console.log('[XHR]', this._m, this._u, b); return _xhrSend.apply(this, arguments); };
    
    // 3. Fetch 监控
    const _fetch = window.fetch;
    window.fetch = function() { console.log('[Fetch]', ...arguments); return _fetch.apply(this, arguments); };
    
    // 4. debugger 拦截
    const _si = window.setInterval;
    window.setInterval = function(fn, d) {
        if (typeof fn === 'function' && fn.toString().indexOf('debugger') > -1) return -1;
        return _si.apply(this, arguments);
    };
    
    console.log('[Hook] ========== Hook注入完成 ==========');
})();
```

## 5. 极简粘贴式观察器（带栈 / 响应观察）

§2 模板之外的另一组变体：代码更短，额外捕获调用栈与响应状态，适合"先看一眼这个边界在传什么"。抓完即删，并用无 hook 复现验证行为一致（§0 纪律 5）。

### Fetch Observer（带响应观察）

```js
(() => {
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const stack = new Error().stack;
    console.log("[trace:fetch]", args[0], args[1], stack);
    const response = await originalFetch.apply(this, args);
    console.log("[trace:fetch:response]", response.url, response.status);
    return response;
  };
})();
```

### XHR Observer（带栈）

```js
(() => {
  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this.__trace = { method, url, stack: new Error().stack };
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.send = function (body) {
    console.log("[trace:xhr]", this.__trace, body);
    return send.call(this, body);
  };
})();
```

## 6. runtime_probe 预设：低开销广谱运行时探针

### 与 JSVMP Proxy hook 的区别

| 维度 | `hook_jsvmp_interpreter`（Proxy 式） | `runtime_probe` |
|------|---------------------------------------|----------------|
| 实现方式 | 在 navigator/screen 等全局对象上装 **Proxy** | **不装 Proxy**，只 override 具体热点 API |
| 开销 | 高（每次属性读取都进 Proxy trap） | 低（只在调用热点 API 时记录） |
| 覆盖面 | 全局对象所有属性 + apply/call/bind/Reflect.* | 固定一组 API |
| 安全性 | 个别页面可能被 Proxy 破坏（且签名型禁用） | 非常安全 |
| 典型用途 | JSVMP 深度分析 | "这个页面都在做什么"快速摸底 |

### runtime_probe 覆盖的 API 清单

| 类别 | 覆盖项 | 日志 type |
|------|-------|----------|
| XHR | `XMLHttpRequest.prototype.open/send` | `xhr_open` / `xhr_send` |
| fetch | `window.fetch` | `fetch` |
| Canvas 指纹 | `HTMLCanvasElement.prototype.toDataURL` | `canvas_toDataURL` |
| Canvas 上下文 | `HTMLCanvasElement.prototype.getContext` | `canvas_getContext` |
| WebGL | `WebGLRenderingContext.prototype.getParameter` | `webgl_getParameter` |
| navigator | userAgent / platform / language / languages / webdriver / hardwareConcurrency / deviceMemory / vendor / appVersion / plugins / mimeTypes 的 getter | `nav_read` |
| 事件 | `EventTarget.prototype.addEventListener`（只记 mouse/key/devicemotion 等 bot 检测类） | `addEventListener` |

### 使用方式

```text
# 1. 注入
inject_hook_preset(preset="runtime_probe", persistent=True)

# 2. 触发场景

# 3. 拉日志：探针把记录写进 window 上的 __mcp_*_log 日志数组（与 cookie 预设同一约定），
#    用 JS 执行能力读取后按 type 字段自行聚合统计
evaluate_js(expression="JSON.stringify(window.__mcp_runtime_probe_log.slice(-300))")
```

### 典型诊断模式

- **反爬是否做 canvas 指纹检测？** → 统计 `type === 'canvas_toDataURL'` 的记录数是否 > 0。
- **反爬是否读 navigator.webdriver？** → 过滤 `type === 'nav_read'` 的记录找 `prop: "webdriver"`。
- **反爬是否检测鼠标移动？** → 统计 `type === 'addEventListener'` 里 mousemove/mousedown 的计数。
