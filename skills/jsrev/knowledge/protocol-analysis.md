# 协议层分析与对抗（TLS 指纹 / HTTP/2 / Header 校验）

> lineage：蒸馏自 hello_js_reverse_skill `references/protocol-analysis.md`（273 行），jsrev 融合版 2026-08-30。
> 适用场景：**算法全部还原正确、固定向量 parity 通过，但 fresh replay 仍失败** —— 此时优先怀疑协议层，而不是回头改算法。

## 0. 定位与边界

协议层对抗只服务于"让调试链路能到达授权目标"（SKILL.md §6）。代理池管理、分布式抓取不在 jsrev 范围（见 fusion-plan 范围边界）。

## 1. TLS 指纹检测（最常见的"算法对但请求败"原因）

服务器分析 TLS ClientHello 特征识别客户端：Cipher Suites 及其顺序、扩展列表、椭圆曲线、签名算法、ALPN。

**检测表现**：403 / 空响应 / `token failed` 类自定义错误；同样的参数在浏览器正常、在 Node/Python 失败。

**方案梯度**（按交付阶梯从高到低）：
1. **firefox 引擎承载**（最可靠）：`launch_browser` → `navigate` → `evaluate_js` 内发 fetch，让请求在真实浏览器 TLS 栈里出去。
2. **curl-impersonate**：`curl_chrome116 <url> -H ...`（Node 侧可 execSync 子进程封装）。
3. **TLS 模拟库**：`tls-client` / Python `curl_cffi`（支持浏览器指纹模拟）。

## 2. HTTP/2 强制

**检测表现**：HTTP/1.1 失败、h2 成功；抓包可见服务器仅接受 h2。

Node.js 用 `http2` 模块直连（`:method`/`:path`/`:scheme`/`:authority` 伪头 + 普通头），Python 用 `httpx[http2]`。关键点：某些站点校验 h2 帧序/伪头顺序，库不支持时要换库而不是硬凑。

## 3. UA / Referer / Origin / CORS

- UA：与交付档位的 UA 自洽纪律联动（knowledge/invariants.md）——脚本 UA 必须与参与签名的环境一致。
- Referer/Origin：403 时逐项对比浏览器请求头（见 knowledge/troubleshooting.md 步骤 ④）。
- CORS 预检：模拟请求时同样处理 OPTIONS 预检头（`Access-Control-Request-Method`/`-Headers`）。

## 4. 请求频率（诊断视角）

403/429 排查时先降频重试（间隔 3-5 秒 + 随机抖动）、检查响应中的 `retry-after`/限流字段。**只用于诊断定位，不做规模化对抗**——那是范围外。

## 5. 诊断流程树

```text
请求失败？
 ├─ 看 HTTP 状态码
 │   ├─ 403 → TLS 指纹 / Referer / UA / IP 封禁
 │   ├─ 412 → 前置条件失败（Cookie / Token 过期 / 签名校验）
 │   ├─ 429 → 频率限制
 │   └─ 200 但数据异常 → 参数错误 / 加密不对
 ├─ 同样的请求在浏览器中成功？
 │   ├─ 是 → TLS 指纹问题 → 方案梯度 1→2→3
 │   └─ 否 → 参数/Cookie 确实有问题 → troubleshooting.md 六步排查
 ├─ curl-impersonate 测试
 │   ├─ 成功 → Node/Python 请求头或参数构造问题
 │   └─ 失败 → TLS / 协议 / IP 问题
 └─ 试 HTTP/2
     ├─ 成功 → 切 http2 模块
     └─ 失败 → TLS 指纹问题
```

## 6. 环境一致性验证（替代已删除的指纹查看工具）

需要确认"浏览器环境 UA/平台/指纹与目标要求一致"时，用 firefox 引擎 `compare_env` 采集 navigator/screen/canvas/webgl/timing 全量属性，与目标站点的检测代码（`search_code(keyword="navigator|screen|canvas")`）对照。
