# 错误排查指南（六步排查 + 签名对比链 + 错误速查表）

> lineage：蒸馏自 hello_js_reverse_skill `references/troubleshooting.md`（233 行），jsrev 融合版 2026-08-30；工具速查表全部按 references/tool-matrix.md 迁移表重建。

## 1. 请求失败六步排查（禁止盲目大改，按序执行）

```text
① Cookie 失效        → cookies（firefox）取最新 Cookie 与脚本对比；Network 面板查 HttpOnly 漏项
② 前置请求遗漏       → network_capture(action="start") → 触发 → list_network_requests；找 /init /token /config 类前置
③ 时间戳绑定         → 精度（秒 vs 毫秒）、类型（字符串 vs 数字）、时间窗口（签名有效期）；签名与请求必须用同一个值
④ Header 缺失/错误   → 逐项对比：Content-Type/Referer/Origin/Accept/sec-ch-ua/Accept-Encoding；完整复制后逐个删减
⑤ 环境校验           → search_code(keyword="navigator|screen|canvas") 搜环境检测；compare_env 采集对比；先验证参与校验再补
⑥ 频率限制           → 降频重试（3-5s 间隔）；查 429 / retry-after；只做诊断定位（范围边界见 protocol-analysis.md §4）
```

## 2. 签名值不一致：七环节对比链（脚本值 vs 浏览器值）

1. **原始输入**：参数名（大小写/下划线）、值、隐藏参数（空值但参与签名）
2. **排序与拼接**：排序规则、分隔符、是否含 key 名、空值是否参与、URL 编码在拼接前还是后
3. **时间戳**：精度/类型/时区
4. **随机串**：长度、字符集（hex/alphanumeric/自定义）、生成方法
5. **密钥/盐值**：值（空格/换行/编码）、硬编码 vs 动态获取、IV/Salt
6. **中间摘要**：多次哈希逐层对比中间值；编码 hex 小写/大写/base64
7. **最终输出**：编码、大小写、截断/前缀处理

**快速定位技巧**：
- 二分法：有中间值先比中间，定位前半还是后半
- **固定输入法**：浏览器与脚本硬编码同一组时间戳/随机串/页码再比结果（排除动态因素）——与 knowledge/crypto.md §0 的固定输入循环是同一纪律
- 打印拼接串：在哈希/加密调用前打印完整输入，逐字符对比
- 真值对比：chrome 引擎真断点捕获签名函数入参与返回值（`set_breakpoint_on_text` → `get_paused_info` → `step` → 暂停帧 `evaluate_script`），见 verticals/debugger.md 配方；firefox 侧用 `hook_function` 入口 hook 后 `evaluate_js` 读 `__mcp_*_log`

## 3. HTTP 状态码速查

| 状态码 | 常见原因 | 排查方向 |
|---|---|---|
| 403 | Cookie 失效 / Header 缺失 / IP 封禁 / TLS 指纹 | 步骤 ①④⑤⑥ + protocol-analysis.md |
| 412 | 签名校验失败 / 缺前置请求 | 七环节对比链 + 步骤 ② |
| 429 | 频率限制 | 步骤 ⑥ |
| 500 | 参数格式错误 / 类型不匹配 | 请求 Body 格式 |
| 200 但数据为空 | 签名对但参数错 / 页码越界 / 缺权限 | 业务参数 |

## 4. 加密问题速查

| 问题 | 可能原因 | 解决 |
|---|---|---|
| MD5 不一致 | 编码（UTF-8 vs ASCII） | 确认输入编码 |
| AES 解密失败 | 模式（CBC/ECB）/ Padding / IV | 逐一确认 |
| Base64 多余字符 | URL-safe vs 标准 | `+/` ↔ `-_` 替换 |
| HMAC 不一致 | 密钥编码 / 算法类型 | 字符串 vs hex bytes |
| RSA 失败 | 公钥格式 / PKCS1 vs OAEP | 格式与填充方案 |

## 5. 环境/运行时问题速查

| 问题 | 解决 |
|---|---|
| Node vm 沙箱缺 DOM API | knowledge/env-patch.md 补环境；jsdom 深度补丁见 env-patch-jsdom.md |
| Python execjs 慢 | `ctx = execjs.compile(js)` 复用 context |
| WASM 加载失败 | 补 imports / 内存 |
| requests 被 TLS 识别 | `curl_cffi`（protocol-analysis.md 方案梯度） |
| `hashlib.md5` FIPS 报错 | `usedforsecurity=False` |
| pycrypto 冲突 | 卸 pycrypto 装 pycryptodome |
| httpx 无 h2 | `pip install httpx[http2]` |
| vm 沙箱超时 | `timeout` 选项（jsrev sandbox --timeout） |
| axios 被 WAF 拦 | 完整浏览器 UA（UA 自洽纪律） |

## 6. 排查工具速查（jsrev 现役工具版）

| 场景 | 途径 |
|---|---|
| 对比请求差异 | firefox：`network_capture(action="start")` + `list_network_requests` + `get_network_request`；chrome：`list_network_requests`（reqid 取详情，急切抓 body） |
| 获取真实签名值 | chrome 真断点（verticals/debugger.md 配方）；firefox `hook_function` + `get_console_logs`/`evaluate_js` 读 `__mcp_*_log` |
| 验证环境检测 | firefox `compare_env` + `search_code` |
| 追踪调用链 | `get_request_initiator`（chrome 非回溯需 `break_on_xhr` 复现；firefox 同名工具） |
| 实时对比 | `evaluate_script`（chrome）/ `evaluate_js`（firefox）执行还原函数与脚本输出比 |
| Cookie 归因 | firefox `analyze_cookie_sources`（HTTP Set-Cookie vs JS 写入三源归因） |
| 源码级插桩 | firefox `instrumentation(action="install"/"log"/"stop")`（hot_keys 暴露环境指纹集） |
| hook 时序 | 先装 hook 再 navigate（knowledge/invariants.md §2.2）；已导航过 → 带插桩 `reload` 重来 |
| 离线验证 | `verify_signer_offline`（字符级首偏差定位） |
