# env-patch — Node 补环境（vm 沙箱 / WASM / jQuery 最小补丁）

> 蒸馏自 `trace/references/env-patch.md`（入场条件 / vm 沙箱警告 / 最小补丁哲学）与 `hello_js_reverse_skill/references/environment-patch.md`（vm 沙箱、WASM、jQuery、XHR 实现模板），jsrev 融合版 2026-08-30。
> jsdom 深度补丁（15 类、三层 toString 防御）见 [env-patch-jsdom.md](env-patch-jsdom.md)。仅限授权目标，用户须自行确保已获授权。

## 0. 总纲：入场条件与最小补丁哲学

### 入场条件（4 条，缺一返回浏览器观测）

只有在已有 JS 入口和固定浏览器样本之后才进入补环境。补任何环境值之前确认：

1. 目标脚本或模块 ID。
2. 入口函数、setup 调用或触发顺序。
3. 真实输入与期望输出形状。
4. 浏览器基线与会话来源。

任何一条缺失 → 回到浏览器观测。

### vm 沙箱警告

`node:vm` **不是安全边界**。未知或第三方目标代码必须在一次性 OS/容器沙箱里运行：无凭据、无项目密钥、文件系统受限、网络默认禁用（特定 replay 步骤需要时才开）。

### 最小补丁循环

三原则：**最小补全优先**（只补目标代码实际访问的 API，不一次性补全所有浏览器 API）、**按需扩展**（运行报错再补对应属性/方法）、**真实值优先**（尽量用真实浏览器采集的值，而非随意伪造）。

1. 用空/最小环境跑目标，保存缺失路径、报错与输出。
2. 加"能解释第一处分歧"的最小环境模块。
3. 重跑，对比缺失路径、报错移动与输出形状。
4. 只为"观测到且影响输出"的读取加自定义补丁。
5. 两轮迭代分歧不动，或宿主特性无法诚实模拟时停止。

### 常见补丁模块（只补被读到的）

1. `navigator`：user agent、语言、平台、硬件提示。
2. `location`：origin、host、path、search。
3. `document`：cookie getter/setter、基础元素桩。
4. `crypto`：随机与摘要边界（输入契约证明用到时）。
5. `performance`：单调计时（耗时影响输出时）。

不要把完整浏览器指纹、storage dump、cookie 或 canvas/WebGL 值拷进公开补丁；确需使用时采用脱敏或合成值。

### 完成标准

成功的补丁 = 固定向量 parity 通过 + 一份诚实的残余宿主差异清单。helper 加载成功不算完成。

## 1. Node.js vm 沙箱最小环境

### 基础模板

```javascript
const vm = require('vm');

function createMinimalSandbox(options = {}) {
    const sandbox = {
        // 全局对象
        window: null,
        self: null,
        globalThis: null,
        
        // DOM 最小模拟
        document: {
            cookie: options.cookie || '',
            createElement: (tag) => ({
                tagName: tag.toUpperCase(),
                style: {},
                setAttribute: () => {},
                getAttribute: () => null,
                appendChild: () => {},
                innerHTML: '',
                src: '',
            }),
            getElementById: () => null,
            getElementsByTagName: () => [],
            getElementsByClassName: () => [],
            querySelector: () => null,
            querySelectorAll: () => [],
            head: { appendChild: () => {} },
            body: { appendChild: () => {} },
            location: { href: options.url || 'https://example.com', hostname: 'example.com' },
            referrer: options.referrer || '',
            title: '',
            readyState: 'complete',
        },
        
        // Navigator
        navigator: {
            userAgent: options.userAgent || 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            appCodeName: 'Mozilla',
            appName: 'Netscape',
            appVersion: '5.0',
            platform: 'MacIntel',
            language: 'zh-CN',
            languages: ['zh-CN', 'zh', 'en'],
            cookieEnabled: true,
            onLine: true,
            plugins: { length: 3 },
            mimeTypes: { length: 4 },
            webdriver: false,
            hardwareConcurrency: 8,
            maxTouchPoints: 0,
        },
        
        // Location
        location: {
            href: options.url || 'https://example.com',
            protocol: 'https:',
            host: 'example.com',
            hostname: 'example.com',
            port: '',
            pathname: '/',
            search: '',
            hash: '',
            origin: 'https://example.com',
        },
        
        // Screen
        screen: {
            width: 1920,
            height: 1080,
            availWidth: 1920,
            availHeight: 1055,
            colorDepth: 24,
            pixelDepth: 24,
        },
        
        // 定时器
        setTimeout: setTimeout,
        setInterval: setInterval,
        clearTimeout: clearTimeout,
        clearInterval: clearInterval,
        
        // 内置对象
        String, Array, Object, Math, Date, RegExp, JSON, Map, Set, WeakMap, WeakSet,
        parseInt, parseFloat, isNaN, isFinite, NaN, Infinity, undefined,
        encodeURIComponent, decodeURIComponent,
        encodeURI, decodeURI,
        escape, unescape,
        Error, TypeError, RangeError, SyntaxError, ReferenceError,
        ArrayBuffer, Uint8Array, Int32Array, Float64Array, DataView,
        Promise,
        Proxy, Reflect,
        Symbol,
        
        // Base64
        btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
        atob: (b64) => Buffer.from(b64, 'base64').toString('binary'),
        
        // Console（用于调试）
        console: console,
    };
    
    // 循环引用
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    sandbox.frames = sandbox;
    
    return sandbox;
}

// 使用示例
function runInSandbox(code, options = {}) {
    const sandbox = createMinimalSandbox(options);
    vm.createContext(sandbox);
    
    try {
        vm.runInContext(code, sandbox, {
            timeout: options.timeout || 5000,
            filename: options.filename || 'sandbox.js',
        });
    } catch (e) {
        console.error('沙箱执行错误:', e.message);
        throw e;
    }
    
    return sandbox;
}
```

### Cookie 拦截模式

```javascript
function createCookieTrapSandbox(options = {}) {
    const sandbox = createMinimalSandbox(options);
    const cookies = {};
    
    Object.defineProperty(sandbox.document, 'cookie', {
        get() {
            return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
        },
        set(val) {
            const parts = val.split(';')[0].split('=');
            const name = parts[0].trim();
            const value = parts.slice(1).join('=').trim();
            cookies[name] = value;
            console.log(`[Sandbox] Cookie Set: ${name}=${value}`);
        }
    });
    
    sandbox._cookies = cookies;
    return sandbox;
}
```

## 2. WASM 环境补全

### 基础 WASM 加载

```javascript
const fs = require('fs');

async function loadWasm(wasmPath, importObject = {}) {
    const wasmBuffer = fs.readFileSync(wasmPath);
    
    const defaultImports = {
        env: {
            memory: new WebAssembly.Memory({ initial: 256 }),
            table: new WebAssembly.Table({ initial: 0, element: 'anyfunc' }),
            abort: () => { throw new Error('WASM abort'); },
            ...importObject.env,
        },
        wasi_snapshot_preview1: {
            fd_write: () => 0,
            fd_close: () => 0,
            fd_seek: () => 0,
            proc_exit: () => {},
            ...importObject.wasi_snapshot_preview1,
        },
        ...importObject,
    };
    
    const result = await WebAssembly.instantiate(wasmBuffer, defaultImports);
    return result.instance;
}
```

### wasm-bindgen (Rust) 环境补全

```javascript
class Window {
    constructor() {
        this.document = {
            body: {},
            createElement: () => ({}),
            getElementById: () => null,
        };
    }
}

function patchWasmBindgenEnv() {
    const win = new Window();
    win.window = win;
    win.self = win;
    
    globalThis.Window = Window;
    globalThis.window = win;
    globalThis.self = win;
    globalThis.document = win.document;
    
    // wasm-bindgen 可能检查 instanceof
    // 确保 win instanceof Window === true
}
```

### Emscripten 环境补全

```javascript
const Module = {
    print: console.log,
    printErr: console.error,
    TOTAL_MEMORY: 16777216,
    noInitialRun: true,
    onRuntimeInitialized: function() {
        console.log('WASM Runtime Ready');
    }
};
```

## 3. jQuery 模拟

```javascript
function createjQueryStub() {
    const $ = function(selector) {
        return {
            length: 1,
            val: () => '',
            text: () => '',
            html: () => '',
            attr: () => '',
            css: () => ({}),
            find: () => $(''),
            each: (fn) => { fn(0, {}); },
            click: () => {},
            on: () => {},
            ajax: $.ajax,
        };
    };
    
    $.ajax = function(options) {
        console.log('[jQuery] $.ajax:', options.url, options.data);
        return { done: (fn) => ({ fail: () => ({}) }) };
    };
    
    $.get = $.post = $.ajax;
    $.fn = $.prototype = {};
    $.extend = Object.assign;
    
    return $;
}
```

## 4. XMLHttpRequest 模拟

```javascript
function createXHRStub(interceptor) {
    return class XMLHttpRequest {
        constructor() {
            this.readyState = 0;
            this.status = 0;
            this.responseText = '';
            this.response = '';
        }
        
        open(method, url) {
            this._method = method;
            this._url = url;
            this.readyState = 1;
        }
        
        setRequestHeader(name, value) {
            this._headers = this._headers || {};
            this._headers[name] = value;
        }
        
        send(body) {
            if (interceptor) {
                interceptor({
                    method: this._method,
                    url: this._url,
                    headers: this._headers,
                    body: body,
                });
            }
            this.readyState = 4;
            this.status = 200;
            if (this.onreadystatechange) this.onreadystatechange();
            if (this.onload) this.onload();
        }
        
        addEventListener(event, handler) {
            this['on' + event] = handler;
        }
    };
}
```

## 5. 环境检测绕过清单

| 检测项 | Node.js 默认 | 需要补全的值 |
|--------|-------------|-------------|
| `typeof window` | `undefined` | `object` |
| `typeof document` | `undefined` | `object` |
| `typeof navigator` | `undefined` | `object` |
| `typeof process` | `object` (暴露) | 需要删除 |
| `typeof module` | `object` (暴露) | 需要删除 |
| `typeof global` | `object` (暴露) | 视情况删除 |
| `navigator.webdriver` | N/A | `false` / `undefined` |
| `window.chrome` | N/A | `{ runtime: {} }` |
| `navigator.plugins.length` | N/A | `> 0` |

### 清除 Node.js 特征

```javascript
function hideNodeFeatures(sandbox) {
    delete sandbox.process;
    delete sandbox.module;
    delete sandbox.exports;
    delete sandbox.require;
    delete sandbox.global;
    delete sandbox.__filename;
    delete sandbox.__dirname;
    delete sandbox.Buffer;
}
```

## 6. jsdom 完整环境（最小补全不够时）

当最小补全不足以支撑目标运行时，用 jsdom 提供完整 DOM 环境（含 runScripts/pretendToBeVisual）；更深的指纹级补丁见 [env-patch-jsdom.md](env-patch-jsdom.md)：

```javascript
const { JSDOM } = require('jsdom');

function createFullBrowserEnv(options = {}) {
    const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
        url: options.url || 'https://example.com',
        referrer: options.referrer || '',
        contentType: 'text/html',
        pretendToBeVisual: true,
        runScripts: 'dangerously',
        resources: 'usable',
    });
    
    const { window } = dom;
    
    // 补充 jsdom 缺少的 API
    if (!window.btoa) {
        window.btoa = (str) => Buffer.from(str, 'binary').toString('base64');
    }
    if (!window.atob) {
        window.atob = (b64) => Buffer.from(b64, 'base64').toString('binary');
    }
    
    return { dom, window, document: window.document };
}
```

## 7. 确定补什么：需求采集工作流

按最小补丁哲学，先观测再补丁：

1. **源码枚举**：在已加载脚本中搜索 `window|document|navigator|location|screen` 等关键字（firefox 引擎 `search_code`），识别目标代码访问了哪些浏览器 API。
2. **运行时访问记录**：在页面脚本加载前注入"记录被访问的全局变量和属性"的脚本，`reload` 后读控制台日志（`get_console_logs`）——确定运行时**真正**访问了哪些环境字段。
3. **检测函数入口捕获**：在环境检测函数入口捕获入参、返回值和调用栈。chrome 引擎用真断点（`set_breakpoint_on_text` + 暂停态求值）；firefox 无真断点，用 `hook_function` 在函数入口 hook 替代。
4. **补后对齐**：用 firefox 引擎 `compare_env` 快速采集浏览器基准环境做 diff；更细粒度的分批采集与 diff 流程见 [env-patch-jsdom.md](env-patch-jsdom.md)。

每轮补丁的缺失路径、报错移动与分歧对比，落盘到 `tasks/<id>/runtime-evidence.jsonl`。
