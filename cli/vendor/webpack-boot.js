/**
 * webpack-boot.js — 离线 webpack chunk 引导与模块探针（jsrev cli vendor，2026-08-30）
 *
 * 用途（L2 交付档位的脚手架）：把站点打包产物（webpack 4 JSONP 风格 chunk，如
 * `window["webpackJsonp"].push([[id],{...modules...},...])`）载入 Node vm 沙箱，
 * 用内置 mini-webpack require 引导指定模块，从而在无浏览器环境下取得站点自己的
 * 签名/加密函数（default export），用于固定向量 parity 与离线重建。
 *
 * 边界与纪律：
 * - 仅支持 webpackJsonp 推送式 chunk（webpack 4 主流形态）；webpack 5 的
 *   self["webpackChunk*"] 暂不支持。
 * - node:vm 不是安全边界：不可信样本只应在一次性容器中运行（见 knowledge/env-patch.md）。
 * - 模块执行在同步 vm 超时内运行；缺依赖模块用 --stub 桩化，入口副作用不自动执行。
 *
 * 用法:
 *   node webpack-boot.js <chunk.js> [more.js...] [options]
 * 选项:
 *   --find <substring>   列出工厂源码包含该子串的模块 id（--find 不区分大小写）
 *   --call <id>          引导指定模块并输出 exports 概览（或调用 --export 函数）
 *   --export <name>      与 --call 连用：取 exports.<name>（默认 default）
 *   --args <json-array>  与 --call 连用：函数调用参数，如 --args '["test"]'
 *   --stub <id>          将模块 id 桩化为空 exports（可重复）
 *   --show <id>          打印模块工厂源码片段（--show-len N 控制，默认 500）
 *   --show-len <n>       --show 的截断长度
 *   --url <url>          location.href（默认 https://example.com/）
 *   --ua <user-agent>    navigator.userAgent
 *   --timeout <ms>       模块同步执行超时（默认 5000）
 */

const vm = require('vm');
const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
    const opts = { files: [], stubs: [], find: null, call: null, exportName: 'default', callArgs: null, show: null, showLen: 500, url: 'https://example.com/', ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', timeout: 5000 };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--find') opts.find = argv[++i];
        else if (a === '--call') opts.call = argv[++i];
        else if (a === '--export') opts.exportName = argv[++i];
        else if (a === '--args') opts.callArgs = argv[++i];
        else if (a === '--stub') opts.stubs.push(argv[++i]);
        else if (a === '--show') opts.show = argv[++i];
        else if (a === '--show-len') opts.showLen = parseInt(argv[++i], 10);
        else if (a === '--url' || a.startsWith('--url=')) opts.url = a === '--url' ? argv[++i] : a.substring(6);
        else if (a === '--ua' || a.startsWith('--ua=')) opts.ua = a === '--ua' ? argv[++i] : a.substring(5);
        else if (a.startsWith('--timeout=')) opts.timeout = parseInt(a.substring(10), 10);
        else if (!a.startsWith('--')) opts.files.push(a);
        else { console.error('未知参数: ' + a); process.exit(2); }
    }
    return opts;
}

function createSandbox(opts) {
    const urlObj = new URL(opts.url);
    const sandbox = {
        console,
        setTimeout: (fn, ms) => setTimeout(fn, Math.min(ms || 0, 2000)),
        clearTimeout, setInterval: () => 0, clearInterval: () => {},
        Date, Math, JSON, Promise, RegExp, Error, TypeError,
        navigator: { userAgent: opts.ua, webdriver: false, language: 'zh-CN', languages: ['zh-CN', 'zh'], platform: 'Win32', hardwareConcurrency: 8 },
        location: { href: urlObj.href, protocol: urlObj.protocol, host: urlObj.host, hostname: urlObj.hostname, port: urlObj.port, pathname: urlObj.pathname, search: urlObj.search, hash: urlObj.hash, origin: urlObj.origin, toString: () => urlObj.href },
        document: { createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), getElementsByTagName: () => [], head: { appendChild() {} }, body: { appendChild() {} }, cookie: '', readyState: 'complete' },
        btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
        atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    };
    sandbox.window = sandbox;
    sandbox.self = sandbox;
    sandbox.globalThis = sandbox;
    sandbox.top = sandbox;
    sandbox.parent = sandbox;
    sandbox.webpackJsonp = sandbox.webpackJsonp || [];
    return sandbox;
}

function collectModules(sandbox) {
    const modules = {};
    const chunkIds = [];
    for (const push of sandbox.webpackJsonp) {
        if (!Array.isArray(push) || !push[1]) continue;
        chunkIds.push(push[0]);
        Object.assign(modules, push[1]);
    }
    return { modules, chunkIds };
}

function makeRequire(modules, stubSet) {
    const cache = { __esModuleStubs: true };
    const pulled = [];
    function req(mid) {
        mid = String(mid);
        if (cache[mid]) return cache[mid].exports;
        pulled.push(mid);
        const m = (cache[mid] = { exports: {} });
        if (stubSet.has(mid) || !modules[mid]) {
            if (!modules[mid] && !stubSet.has(mid)) {
                throw new Error('module ' + mid + ' not in provided chunks（跨 chunk 依赖请把对应文件一并传入，或用 --stub ' + mid + ' 桩化）');
            }
            return m.exports;
        }
        modules[mid].call(m.exports, m, m.exports, req);
        return m.exports;
    }
    req.r = (e) => { Object.defineProperty(e, '__esModule', { value: true }); };
    req.d = (e, getters) => { for (const k in getters) if (req.o(getters, k) && !req.o(e, k)) Object.defineProperty(e, k, { enumerable: true, get: getters[k] }); };
    req.n = (mod) => { const g = mod && mod.__esModule ? () => mod.default : () => mod; req.d(g, { a: g }); return g; };
    req.o = (o, p) => Object.prototype.hasOwnProperty.call(o, p);
    req.e = () => Promise.resolve();
    req.m = modules;
    req.c = cache;
    req.p = '';
    req.pulled = pulled;
    return req;
}

function stringifyResult(value) {
    try {
        return JSON.stringify(value, (_, v) => (typeof v === 'bigint' ? String(v) : typeof v === 'function' ? '[Function ' + (v.name || 'anonymous') + ']' : v));
    } catch {
        return String(value);
    }
}

function main() {
    const opts = parseArgs(process.argv.slice(2));
    if (opts.files.length === 0) {
        console.log(require('util').inspect({ usage: 'node webpack-boot.js <chunk.js> [more.js...] [--find <sub>] [--call <id> --export default --args \'["x"]\'] [--stub <id>] [--show <id>]' }, { depth: null }));
        process.exit(0);
    }
    const result = { files: opts.files, chunks: 0, moduleCount: 0, loadErrors: [] };
    const sandbox = createSandbox(opts);
    vm.createContext(sandbox);
    for (const file of opts.files) {
        const code = fs.readFileSync(path.resolve(file), 'utf8');
        try {
            vm.runInContext(code, sandbox, { filename: path.basename(file), timeout: opts.timeout, displayErrors: true });
        } catch (e) {
            result.loadErrors.push({ file, error: e.message });
        }
    }
    const { modules } = collectModules(sandbox);
    result.chunks = sandbox.webpackJsonp.length;
    result.moduleCount = Object.keys(modules).length;
    const stubSet = new Set(opts.stubs.map(String));

    if (opts.find) {
        const needle = opts.find.toLowerCase();
        result.find = Object.keys(modules)
            .filter((id) => String(modules[id]).toLowerCase().includes(needle))
            .map(String);
    }
    if (opts.show != null) {
        const src = String(modules[opts.show] || '');
        result.show = { id: String(opts.show), found: Boolean(modules[opts.show]), source: src.slice(0, opts.showLen), length: src.length };
    }
    if (opts.call != null) {
        const req = makeRequire(modules, stubSet);
        const out = { id: String(opts.call) };
        try {
            const exports = req(opts.call);
            out.pulledModules = req.pulled.slice();
            const target = opts.exportName !== undefined && exports && Object.prototype.hasOwnProperty.call(exports, opts.exportName)
                ? exports[opts.exportName]
                : exports && exports.default !== undefined ? exports.default : exports;
            out.exportType = typeof target;
            if (typeof target === 'function') {
                let args = [];
                if (opts.callArgs) args = JSON.parse(opts.callArgs);
                const value = target.apply(null, args);
                out.exportName = opts.exportName;
                out.resultType = typeof value;
                out.result = stringifyResult(value instanceof Promise ? '[Promise — 同步探针不等待]' : value);
            } else {
                out.exportsKeys = Object.keys(exports || {});
                out.value = stringifyResult(target);
            }
        } catch (e) {
            out.pulledModules = req.pulled.slice();
            out.error = e.message;
        }
        result.call = out;
    }
    console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) main();
module.exports = { collectModules, makeRequire };
