# 反调试对抗手册（7 类检测 + 通用反制）

> lineage：蒸馏自 hello_js_reverse_skill/references/anti-debug.md（7 类检测 + 通用反反调试脚本）；已删工具段落已改写为现役引擎工作流。仅用于已授权目标的协议分析。

## 0. 引擎与类别边界（决定你能不能用下面的反制）

- **firefox（Camoufox）**：可以注入反反调试脚本——通过 hook 机制在页面加载前安装，**先装 hook，再 navigate**。
- **chrome（Chromium）**：**不可以**——零 JS 注入是硬不变量，注入痕迹（getter/setter、Error.stack、toString 非 native）会被精确检测（[invariants.md](invariants.md) §1.1）。
- **纯混淆 / 行为型**目标：本篇反制脚本可用（firefox 引擎）。
- **签名型**目标（RS/AK 等）：环境篡改默认禁用——覆写 `Function`/定时器/console 会被完整性校验发现；优先源码级插桩（AST 改写时顺带剥 debugger）或 chrome 引擎真断点工作流。
- chrome 引擎遇到 debugger 陷阱：不注入，定位陷阱源码后走断点管理（`list_breakpoints` / `remove_breakpoint` / `pause_or_resume`）或源码层 AST 去除 debugger 语句；仍不行交给 firefox 的 `debugger_bypass` 预设。运行时篡改类反制（§2/§4/通用脚本）都受上述两条约束。

## 1. debugger 语句

表现与反制（方案 A = firefox 引擎一键预设 `inject_hook_preset(preset="debugger_bypass")` 或手动安装下方脚本；方案 B = chrome 引擎零注入，真断点工作流内禁用该处暂停/`pause_or_resume` 恢复，或 AST 去除 debugger 语句）：

```javascript
// ── 表现 ──
// 无限 debugger 循环
setInterval(function() { debugger; }, 100);
// 条件 debugger
(function check() {
    debugger;
    check();
})();
// 隐藏 debugger（通过 constructor）
(function() {
    var a = new Function("debugger");
    setInterval(a, 1000);
})();

// ── 绕过：覆写 Function 构造器 + 定时器，过滤 debugger ──
const _Function = Function;
Function = function() {
    const body = arguments[arguments.length - 1];
    if (typeof body === 'string' && body.indexOf('debugger') !== -1) {
        arguments[arguments.length - 1] = body.replace(/debugger/g, '');
    }
    return _Function.apply(this, arguments);
};
Function.prototype = _Function.prototype;

const _setInterval = setInterval;
setInterval = function(fn, ms) {
    if (typeof fn === 'function' && fn.toString().indexOf('debugger') !== -1) {
        return -1;
    }
    if (typeof fn === 'string' && fn.indexOf('debugger') !== -1) {
        return -1;
    }
    return _setInterval.apply(this, arguments);
};
```

## 2. 开发者工具检测

### 2.1 窗口尺寸检测

```javascript
// ── 检测：outer 与 inner 尺寸差 ──
setInterval(function() {
    if (window.outerHeight - window.innerHeight > 200 ||
        window.outerWidth - window.innerWidth > 200) {
        // DevTools 已打开
        document.body.innerHTML = '';
    }
}, 500);

// ── 绕过：注入后锁定尺寸 ──
Object.defineProperty(window, 'outerHeight', { get: () => window.innerHeight });
Object.defineProperty(window, 'outerWidth', { get: () => window.innerWidth });
```

### 2.2 console.log 计时检测

```javascript
// ── 检测：console.log 在 DevTools 打开时较慢 ──
setInterval(function() {
    var start = Date.now();
    console.log('check');
    console.clear();
    if (Date.now() - start > 10) {
        // DevTools 已打开
        window.location = 'about:blank';
    }
}, 1000);

// ── 绕过：覆写 console 方法为空操作 ──
const noop = function() {};
console.log = noop;
console.clear = noop;
```

### 2.3 toString 检测

```javascript
// ── 检测：只有在 DevTools 打开时，console.log 才会调用对象的 toString ──
var devtools = /./;
devtools.toString = function() {
    isDevToolsOpen = true;
    return '';
};
console.log(devtools);

// ── 绕过：覆写 console.log，阻止 toString 调用检测 ──
const _log = console.log;
console.log = function() {
    // 不调用 toString
};
```

## 3. 代码完整性检测

### 3.1 函数 toString 检测

```javascript
// ── 检测：代码被格式化（toString 出现换行）即触发反调试 ──
function critical() {
    // 重要逻辑
}
if (critical.toString().indexOf('\n') !== -1) {
    while(true) {}
}

// ── 绕过：保存原始 toString 结果 ──
const origToString = critical.toString();
Object.defineProperty(critical, 'toString', {
    value: function() { return origToString; }
});
```

### 3.2 源码长度检测

```javascript
if (someFunction.toString().length !== 1234) {
    // 代码被修改
    throw new Error('Integrity check failed');
}
```

**绕过**：不修改原始函数，在页面脚本执行之前收集所需数据（firefox 导航前装 hook；chrome 靠"先静默导航、再刷新取证"工作流）。

## 4. 时间差检测

```javascript
// ── 检测：两处时间差过大 = 可能在断点处暂停了 ──
var t1 = Date.now();
// ... 执行代码 ...
var t2 = Date.now();
if (t2 - t1 > 100) {
    window.location = 'about:blank';
}

// ── 绕过：Hook Date.now 返回连续值 ──
const _now = Date.now;
let fakeTime = _now();
Date.now = function() {
    fakeTime += 1;
    return fakeTime;
};

// 或使用 performance.now
const _perfNow = performance.now;
performance.now = function() {
    return _perfNow.call(performance);
};
```

> 优先路线是不触发：断点暂停时间过长本身就会被风控标记——暂停态要快，取证一次到位。

## 5. 环境检测

### 5.1 Node.js 环境检测（绕过：在 vm 沙箱中删除这些全局变量）

```javascript
if (typeof process !== 'undefined' && process.versions && process.versions.node) {
    throw new Error('Node.js detected');
}
if (typeof module !== 'undefined' && module.exports) {
    throw new Error('CommonJS detected');
}
if (typeof global !== 'undefined') {
    throw new Error('Non-browser detected');
}
```

### 5.2 浏览器指纹检测（绕过：补全环境变量，见 [env-patch.md](env-patch.md)；浏览器侧靠引擎自身反检测分层，不要手工打 JS 补丁）

```javascript
if (!window.chrome || !window.chrome.runtime) {
    throw new Error('Not Chrome');
}
if (navigator.webdriver) {
    throw new Error('WebDriver detected');
}
if (navigator.plugins.length === 0) {
    throw new Error('Headless browser detected');
}
```

### 5.3 Selenium / Puppeteer 检测（绕过：优先换用反检测引擎——双引擎即为此设计；逐个清除指纹会留下 §6 所述可检痕迹）

```javascript
const checks = [
    'webdriver' in navigator,
    '_Selenium_IDE_Recorder' in window,
    'callSelenium' in document,
    '__webdriver_script_fn' in document,
    '$cdc_asdjflasutopfhvcZLmcfl_' in document,
    '_phantom' in window,
    'callPhantom' in window
];
if (checks.some(Boolean)) {
    throw new Error('Automation detected');
}
```

## 6. Object.defineProperty 篡改

```javascript
// ── 表现：改写属性定义行为（例：阻止 Cookie Hook）──
const _defineProperty = Object.defineProperty;
Object.defineProperty = function(obj, prop, descriptor) {
    if (prop === 'cookie') {
        return "";
    }
    return _defineProperty.apply(this, arguments);
};

// ── 绕过：在所有代码之前保存原始方法，后续用原始引用 ──
const originalDefineProperty = Object.defineProperty;
// 后续使用 originalDefineProperty 而非 Object.defineProperty
```

## 7. Proxy 检测

```javascript
// 某些代码会检测对象是否被 Proxy 包装
try {
    new Proxy({}, {});
} catch(e) {
    // 环境异常
}
```

**注意**：用 Proxy 做 hook 时确保 Proxy 行为与原始对象一致；签名型目标直接禁用 Proxy 式 hook（可被 RS/AK 检测，invariants.md §2.1），改用透明探针或源码级插桩。

## 通用反反调试注入脚本

仅限 firefox 引擎、hook 机制在页面加载前安装（先装 hook，再导航）；覆写 `Function`/定时器并隐藏 webdriver 属运行时篡改——**签名型目标禁用**，仅用于纯混淆/行为型目标；检测纪律唯一来源是 [invariants.md](invariants.md)。

```javascript
(function() {
    'use strict';

    // 保存原始方法引用
    const originals = {
        defineProperty: Object.defineProperty,
        getOwnPropertyDescriptor: Object.getOwnPropertyDescriptor,
        setInterval: window.setInterval,
        setTimeout: window.setTimeout,
        Function: window.Function,
        eval: window.eval,
        dateNow: Date.now,
    };

    // 1. 拦截 debugger
    const _Function = originals.Function;
    window.Function = function() {
        let body = arguments[arguments.length - 1];
        if (typeof body === 'string' && body.includes('debugger')) {
            arguments[arguments.length - 1] = body.replace(/debugger\s*;?/g, '');
        }
        return _Function.apply(this, arguments);
    };
    window.Function.prototype = _Function.prototype;

    // 2. 过滤 debugger 定时器
    const _setInterval = originals.setInterval;
    window.setInterval = function(fn, ms) {
        if (typeof fn === 'function' && fn.toString().includes('debugger')) return -1;
        if (typeof fn === 'string' && fn.includes('debugger')) return -1;
        return _setInterval.apply(this, arguments);
    };

    const _setTimeout = originals.setTimeout;
    window.setTimeout = function(fn, ms) {
        if (typeof fn === 'function' && fn.toString().includes('debugger')) return -1;
        if (typeof fn === 'string' && fn.includes('debugger')) return -1;
        return _setTimeout.apply(this, arguments);
    };

    // 3. 隐藏 webdriver 属性
    originals.defineProperty.call(Object, navigator, 'webdriver', {
        get: () => undefined, configurable: true
    });

    console.log('[AntiDebug] 反反调试脚本已注入');
})();
```
