/**
 * Hook 代码生成器（jsrev cli vendor，蒸馏自 hello_js_reverse_skill/scripts/hook-generator.js，2026-08-30）
 *
 * jsrev 融合版修复（相对原版的裁决性变更）：
 * 1. cookie 模板改为【原型链级】Hook —— 实例级 Object.defineProperty(document,'cookie',...)
 *    无效：cookie 的 getter/setter 定义在 Document.prototype/HTMLDocument.prototype 上，
 *    直接在实例上 defineProperty 会被浏览器忽略或抛错（这是"Hook 装上了但抓不到写入"的根因）。
 * 2. --target / --function 等用户输入一律 JSON.stringify 后再嵌入生成代码（原版字符串拼接存在注入破坏）。
 * 3. eval / debugger_bypass 模板的 Function Hook 改用 Proxy（原版 `Function.prototype = _Function.prototype`
 *    会破坏 Function 构造器链；Proxy 保原型链、静态属性与 new 语义）。
 * 4. stealth 模板不再进入 `all` 组合包：Firefox UA 下注入 window.chrome 违反 UA 自洽（会被检测）。
 *
 * 使用方式:
 *   jsrev hookgen cookie --target "acw_tc"
 *   node hook-generator.js --type=xhr --target="/api/data"
 */

const HOOK_TEMPLATES = {

    cookie: (options = {}) => {
        const targetFilter = JSON.stringify(options.target || '');
        return `(function() {
    // 原型链级 document.cookie Hook：沿原型链找到 cookie 描述符的 owner 再覆写。
    var owner = null, desc = null, proto = document;
    while (proto) {
        var d = Object.getOwnPropertyDescriptor(proto, 'cookie');
        if (d && (d.set || d.get)) { owner = proto; desc = d; break; }
        proto = Object.getPrototypeOf(proto);
    }
    if (!owner || !desc) { console.warn('[Hook:Cookie] 未在原型链上找到 cookie 描述符'); return; }
    var FILTER = ${targetFilter};
    Object.defineProperty(owner, 'cookie', {
        get: function() { return desc.get ? desc.get.call(this) : undefined; },
        set: function(val) {
            if (!FILTER || String(val).indexOf(FILTER) !== -1) {
                console.log('[Hook:Cookie] Set:', val);
                console.trace('[Hook:Cookie] 调用栈');
            }
            if (desc.set) desc.set.call(this, val);
        },
        configurable: true,
        enumerable: !!desc.enumerable
    });
    console.log('[Hook:Cookie] Cookie Hook 已注入（原型链级 @ ' + ((owner && owner.constructor && owner.constructor.name) || '?') + '）');
})();`;
    },

    xhr: (options = {}) => {
        const targetFilter = JSON.stringify(options.target || '');
        return `(function() {
    var FILTER = ${targetFilter};
    var _open = XMLHttpRequest.prototype.open;
    var _send = XMLHttpRequest.prototype.send;
    var _setHeader = XMLHttpRequest.prototype.setRequestHeader;

    XMLHttpRequest.prototype.open = function(method, url) {
        this.__hookMethod = method;
        this.__hookUrl = url;
        this.__hookHeaders = {};
        return _open.apply(this, arguments);
    };

    XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
        this.__hookHeaders[name] = value;
        return _setHeader.apply(this, arguments);
    };

    XMLHttpRequest.prototype.send = function(body) {
        if (!FILTER || (this.__hookUrl && this.__hookUrl.indexOf(FILTER) !== -1)) {
            console.log('[Hook:XHR] ★', this.__hookMethod, this.__hookUrl);
            console.log('[Hook:XHR] Headers:', JSON.stringify(this.__hookHeaders));
            console.log('[Hook:XHR] Body:', body);
            console.trace('[Hook:XHR] 调用栈');
        }
        return _send.apply(this, arguments);
    };
    console.log('[Hook:XHR] XHR Hook 已注入');
})();`;
    },

    fetch: (options = {}) => {
        const targetFilter = JSON.stringify(options.target || '');
        return `(function() {
    var FILTER = ${targetFilter};
    var _fetch = window.fetch;
    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input.url || '');
        if (!FILTER || url.indexOf(FILTER) !== -1) {
            console.log('[Hook:Fetch] ★', url);
            console.log('[Hook:Fetch] Options:', JSON.stringify(init || {}));
            console.trace('[Hook:Fetch] 调用栈');
        }
        return _fetch.apply(this, arguments);
    };
    console.log('[Hook:Fetch] Fetch Hook 已注入');
})();`;
    },

    eval: () => {
        return `(function() {
    var _eval = window.eval;
    window.eval = function(code) {
        console.log('[Hook:eval] 代码长度:', typeof code === 'string' ? code.length : 'N/A');
        if (typeof code === 'string' && code.length < 10000) {
            console.log('[Hook:eval] 内容:', code.substring(0, 500));
        }
        return _eval.apply(this, arguments);
    };

    // Proxy 版 Function Hook：保持原型链 / 静态属性 / new 语义（不要用 prototype 赋值）。
    var _Function = Function;
    window.Function = new Proxy(_Function, {
        apply: function(target, thisArg, args) {
            var body = args[args.length - 1];
            console.log('[Hook:Function] body长度:', typeof body === 'string' ? body.length : 0);
            if (typeof body === 'string' && body.length < 5000) {
                console.log('[Hook:Function] 内容:', body.substring(0, 500));
            }
            return Reflect.apply(target, thisArg, args);
        },
        construct: function(target, args) {
            var body = args[args.length - 1];
            console.log('[Hook:Function] construct body长度:', typeof body === 'string' ? body.length : 0);
            if (typeof body === 'string' && body.length < 5000) {
                console.log('[Hook:Function] 内容:', body.substring(0, 500));
            }
            return Reflect.construct(target, args);
        }
    });
    console.log('[Hook:eval] eval/Function Hook 已注入');
})();`;
    },

    json: () => {
        return `(function() {
    var _parse = JSON.parse;
    var _stringify = JSON.stringify;

    JSON.parse = function(text) {
        var result = _parse.apply(this, arguments);
        console.log('[Hook:JSON] parse:', typeof text === 'string' ? text.substring(0, 200) : typeof text);
        return result;
    };

    JSON.stringify = function(obj) {
        var result = _stringify.apply(this, arguments);
        console.log('[Hook:JSON] stringify:', result ? result.substring(0, 200) : result);
        return result;
    };
    console.log('[Hook:JSON] JSON Hook 已注入');
})();`;
    },

    base64: () => {
        return `(function() {
    var _atob = window.atob;
    var _btoa = window.btoa;

    window.atob = function(str) {
        var result = _atob(str);
        console.log('[Hook:Base64] atob:', str.substring(0, 80), '→', result.substring(0, 80));
        return result;
    };

    window.btoa = function(str) {
        var result = _btoa(str);
        console.log('[Hook:Base64] btoa:', str.substring(0, 80), '→', result.substring(0, 80));
        return result;
    };
    console.log('[Hook:Base64] Base64 Hook 已注入');
})();`;
    },

    websocket: () => {
        return `(function() {
    var _WS = window.WebSocket;
    window.WebSocket = function(url, protocols) {
        console.log('[Hook:WS] 连接:', url);
        var ws = new _WS(url, protocols);
        var _send = ws.send.bind(ws);
        ws.send = function(data) {
            console.log('[Hook:WS] 发送:', typeof data === 'string' ? data.substring(0, 200) : '[binary]');
            return _send(data);
        };
        ws.addEventListener('message', function(e) {
            console.log('[Hook:WS] 接收:', typeof e.data === 'string' ? e.data.substring(0, 200) : '[binary]');
        });
        return ws;
    };
    window.WebSocket.prototype = _WS.prototype;
    console.log('[Hook:WS] WebSocket Hook 已注入');
})();`;
    },

    debugger_bypass: () => {
        return `(function() {
    // Proxy 版 Function Hook：保持原型链 / 静态属性 / new 语义。
    var _Function = Function;
    var FunctionHooked = new Proxy(_Function, {
        strip: function(args) {
            var body = args[args.length - 1];
            if (typeof body === 'string' && body.indexOf('debugger') !== -1) {
                args[args.length - 1] = body.replace(/debugger\\s*;?/g, '');
            }
            return args;
        },
        apply: function(target, thisArg, args) {
            return Reflect.apply(target, thisArg, this.strip(args.slice()));
        },
        construct: function(target, args) {
            return Reflect.construct(target, this.strip(args.slice()));
        }
    });
    try {
        Object.defineProperty(window, 'Function', { value: FunctionHooked, writable: true, configurable: true });
    } catch (e) {
        window.Function = FunctionHooked;
    }

    var _si = window.setInterval;
    window.setInterval = function(fn, ms) {
        if (typeof fn === 'function' && fn.toString().indexOf('debugger') > -1) return -1;
        if (typeof fn === 'string' && fn.indexOf('debugger') > -1) return -1;
        return _si.apply(this, arguments);
    };

    var _st = window.setTimeout;
    window.setTimeout = function(fn, ms) {
        if (typeof fn === 'function' && fn.toString().indexOf('debugger') > -1) return -1;
        if (typeof fn === 'string' && fn.indexOf('debugger') > -1) return -1;
        return _st.apply(this, arguments);
    };
    console.log('[Hook:AntiDebug] debugger 绕过已注入');
})();`;
    },

    stealth: () => {
        return `(function() {
    // ⚠ 仅限 Chromium 目标使用。Firefox UA 下严禁注入 window.chrome —— 违反 UA 自洽，会被检测。
    Object.defineProperty(navigator, 'webdriver', { get: function() { return undefined; }, configurable: true });

    window.chrome = window.chrome || {};
    window.chrome.runtime = window.chrome.runtime || {};

    Object.defineProperty(navigator, 'plugins', {
        get: function() {
            return [
                { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer' },
                { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai' },
                { name: 'Native Client', filename: 'internal-nacl-plugin' }
            ];
        }
    });

    Object.defineProperty(navigator, 'languages', {
        get: function() { return ['zh-CN', 'zh', 'en']; }
    });

    var _getParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function(param) {
        if (param === 37445) return 'Intel Inc.';
        if (param === 37446) return 'Intel Iris OpenGL Engine';
        return _getParameter.apply(this, arguments);
    };

    console.log('[Hook:Stealth] 隐身模式已注入');
})();`;
    },

    custom: (options = {}) => {
        const funcName = JSON.stringify(options.function || 'targetFunction');
        return `(function() {
    var NAME = ${funcName};
    // 追踪目标函数
    if (typeof window[NAME] !== 'undefined') {
        var _orig = window[NAME];
        window[NAME] = function() {
            console.log('[Hook:Custom]', NAME, '调用');
            console.log('[Hook:Custom] 参数:', JSON.stringify(Array.from(arguments)));
            var result = _orig.apply(this, arguments);
            console.log('[Hook:Custom] 返回:', JSON.stringify(result));
            console.trace('[Hook:Custom] 调用栈');
            return result;
        };
        console.log('[Hook:Custom]', NAME, 'Hook 已注入');
    } else {
        console.warn('[Hook:Custom]', NAME, '未定义，等待加载...');
        // 使用 getter 延迟 Hook
        var _origVal;
        Object.defineProperty(window, NAME, {
            get: function() { return _origVal; },
            set: function(val) {
                if (typeof val === 'function') {
                    var _fn = val;
                    _origVal = function() {
                        console.log('[Hook:Custom]', NAME, '调用');
                        console.log('[Hook:Custom] 参数:', JSON.stringify(Array.from(arguments)));
                        var result = _fn.apply(this, arguments);
                        console.log('[Hook:Custom] 返回:', JSON.stringify(result));
                        return result;
                    };
                } else {
                    _origVal = val;
                }
            },
            configurable: true
        });
    }
})();`;
    },
};

function generateHook(type, options = {}) {
    const generator = HOOK_TEMPLATES[type];
    if (!generator) {
        throw new Error(`未知的 Hook 类型: ${type}。可用类型: ${Object.keys(HOOK_TEMPLATES).join(', ')}`);
    }
    return generator(options);
}

// 注意：组合包不含 stealth（Firefox UA 自洽纪律；需要时单独 --type=stealth 并确认目标是 Chromium）。
function generateAllHooks(options = {}) {
    const hooks = [
        HOOK_TEMPLATES.debugger_bypass(),
        HOOK_TEMPLATES.cookie(options),
        HOOK_TEMPLATES.xhr(options),
        HOOK_TEMPLATES.fetch(options),
        HOOK_TEMPLATES.eval(),
        HOOK_TEMPLATES.base64(),
    ];
    return hooks.join('\n\n');
}

// CLI
if (require.main === module) {
    const args = process.argv.slice(2);
    const options = {};

    // 同时支持 --key=value 与 --key value 两种形式（jsrev cli 以数组参数直传，两种都会出现）
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (!a.startsWith('--')) continue;
        const eq = a.indexOf('=');
        if (eq > 0) {
            options[a.slice(2, eq)] = a.slice(eq + 1);
        } else if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
            options[a.slice(2)] = args[i + 1];
            i++;
        } else {
            options[a.slice(2)] = '';
        }
    }

    if (!options.type) {
        console.log('用法: node hook-generator.js --type=<type> [options]');
        console.log('');
        console.log('类型:');
        console.log('  cookie          Cookie setter 拦截（原型链级）');
        console.log('  xhr             XMLHttpRequest 拦截');
        console.log('  fetch           Fetch API 拦截');
        console.log('  eval            eval/Function 拦截（Proxy 版）');
        console.log('  json            JSON.parse/stringify 拦截');
        console.log('  base64          atob/btoa 拦截');
        console.log('  websocket       WebSocket 拦截');
        console.log('  debugger_bypass debugger 反调试绕过（Proxy 版）');
        console.log('  stealth         浏览器指纹隐身（仅 Chromium 目标；不在 all 组合包内）');
        console.log('  custom          自定义函数拦截');
        console.log('  all             生成常用 Hook 组合包（不含 stealth）');
        console.log('');
        console.log('选项:');
        console.log('  --target=<url>     目标接口路径过滤');
        console.log('  --function=<name>  自定义函数名（type=custom 时）');
        console.log('  --output=<file>    输出到文件');
        process.exit(0);
    }

    let code;
    if (options.type === 'all') {
        code = generateAllHooks(options);
    } else {
        code = generateHook(options.type, options);
    }

    if (options.output) {
        const fs = require('fs');
        fs.writeFileSync(options.output, code);
        console.log(`Hook 代码已保存到: ${options.output}`);
    } else {
        console.log(code);
    }
}

module.exports = { generateHook, generateAllHooks, HOOK_TEMPLATES };
