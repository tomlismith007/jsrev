# 案例：通用 VMP 源码级插桩（骨架模板）

> lineage: 源自 hello_js_reverse_skill/cases/universal-vmp-source-instrumentation.md，2026-08-30 迁移至 jsrev skill；旧工具名已按 [references/tool-matrix.md](../references/tool-matrix.md) 机械替换。
> **骨架案例**。本文是一个**方法论模板**，不是某个具体站点的案例。适用于：RS 5/6、Akamai sensor_data v2/v3、webmssdk、obfuscator.io 等所有"算法封装在字节码 dispatch 循环里"的 VMP。
>
> 使用方式：
>
> 1. 在 Phase 0.5 指纹匹配时，若检测到 VMP 特征（源码含 1000+ 元素超大字节数组 + while-switch 解释器循环，经 `search_code`/`scripts` 确认；或 `instrumentation(action="install")` 的 log 显示高密度 dispatch tap），直接走本案例的「已验证定位路径」
> 2. 完成一次具体站点逆向后，复制本文件重命名为 `vmp-<具体技术特征>.md`，按真实站点数据填充 `[填入...]` 占位符，加入 cases/README.md 索引

---

## 指纹检测规则

- **JS 特征**：
  - 单 JS 文件 100KB+，通常命名模式为 `sdenv-*.js` / `FuckCookie_*.js` / `webmssdk.es5.js` / `sensor_data.js` / `akam/xxx.js` / `a_bogus.js`
  - 含超大字节码数组（`var X = [3,15,7,22,...]`，长度 1000+）
  - 含 `while(true){switch(...)}` 或 `while(!![]){switch(...)}` 解释器循环；`instrumentation(action="install")` 后 log 中 dispatch tap 记录高密度出现（对应旧口径 case_count > 50）
- **参数特征**：
  - 固定长度签名参数（128/192/256 字符） + Base64 变体（有 `-_` 替换 `+/`） 或 hex
  - 典型参数名：`a_bogus` / `_signature` / `X-Bogus` / `msToken` / `_m_h5_tk` / `acw_tc` / `FSSBBIl1UgzbN7N`
- **请求特征**：
  - 首包返回 412（RS）或 403（Akamai）+ 动态 cookie 写入后通过
  - 存在预热接口（如 `/challenge` / `/akam/11/*` / `/v1/gen_token`）
  - Cookie 中有多个动态字段（JS 写的 + HTTP Set-Cookie 发的）
- **反调试特征**：
  - debugger 陷阱（firefox 引擎可用 `inject_hook_preset` 的 `debugger_bypass` 预设绕过）
  - navigator.webdriver / Function.prototype.toString 检测
- **混淆类型**：JSVMP（字节码虚拟机）

---

## 加密方案

- **算法**：[填入真实案例时填写，常见：HMAC-SHA256 / 自实现 MD5 / AES-CBC / 自定义哈希表 + 异或 / CRC32 变体]
- **密钥来源**：[填入：硬编码字节码中 / 服务端预热下发 / 浏览器指纹哈希派生]
- **加密流程**：
  1. VMP 收集浏览器环境指纹（`hot_keys` 暴露的属性集合）
  2. 拼接业务参数 + 时间戳 + 指纹
  3. 通过 dispatch 循环内的 handler 系列完成哈希/加密
  4. 输出 Base64/hex 编码的签名
- **签名公式**：[填入真实公式]

---

## 已验证定位路径（源码级插桩黄金 8 步）

```
Step 1 — launch + 抓包
  launch_browser(headless=False)
  network_capture(action="start")   # firefox 需先 start；chrome 引擎急切抓 body

Step 2 — 首次导航
  若是首屏挑战站点：先用 inject_hook_preset 装好探针预设
  （xhr / fetch / cookie / runtime_probe；如需 JSVMP 观测另加 hook_jsvmp_interpreter），
  再 navigate(url="[填入目标URL]", wait_until="networkidle")，确保探针先于页面脚本生效。
  否则：navigate(url="[填入]", wait_until="load")

Step 3 — 定位 VMP 脚本
  list_network_requests（按 script 类型过滤）
  → 找 size 最大的 JS，记 URL 为 <VMP_URL>
  在该脚本源码中 search_code 确认 VMP 特征：
  超大字节数组（1000+ 元素）+ while-switch 解释器循环，dispatch 分支规模大（数百 case）

Step 4 — 装源码级插桩
  instrumentation(action="install")   # 对 VMP 脚本做源码级 AST tap
  # tag="vmp1"；对该脚本的成员访问与方法调用打点（对应旧 rewrite_member_access/rewrite_calls）

Step 5 — 装兜底 hook（若 Step 2 没装预设）
  inject_hook_preset("cookie", persistent=True)
  inject_hook_preset("xhr", persistent=True)
  inject_hook_preset("fetch", persistent=True)
  inject_hook_preset("crypto", persistent=True)
  hook_jsvmp_interpreter(script_url="[VMP basename]")
  # 注意：本案例针对的是"通用"场景（含签名型和行为型）。如果目标是签名型反爬
  # （RS/Akamai），不要这样用 hook_jsvmp_interpreter，改为：
  #   - instrumentation(action="install") 源码级 AST tap   （首选）
  #   - hook_jsvmp_interpreter(mode="transparent")          （备选）
  # 参考 SKILL.md §2「反爬三分法与引擎路由」章节
  inject_hook_preset("debugger_bypass")   # 目标有 debugger 陷阱时

Step 6 — hook 后 reload（firefox），让探针先于 VMP 生效
  reload()   # 只刷新当前页；配合已装好的 hook 与插桩

Step 7 — 触发业务操作
  [填入具体操作]

Step 8 — 读日志
  instrumentation(action="log", tag="vmp1")
    → 按类型分流读取 tap 记录：
      属性读取 tap   → 记录 hot_keys top 30 的环境属性
      方法调用 tap   → 记录 hot_methods 是否含 CryptoJS.* / SubtleCrypto.*
      函数调用 tap   → 记录 hot_functions 里的高频自定义函数名
  analyze_cookie_sources()
    → 对每个目标 cookie 确认 sources

  清理：
  instrumentation(action="stop")
  remove_hooks()
```

---

## 还原代码（按 hot_methods 分支）

### 分支 A：hot_methods 包含标准加密 API → 纯算法还原

```javascript
// Node.js 示例
const crypto = require('crypto');

function genSign(params, ts, fingerprint) {
  const payload = [
    // [填入实际字段顺序]
    params.url,
    params.body || '',
    ts,
    fingerprint,
  ].join('|');

  return crypto
    .createHmac('sha256', '[填入密钥]')
    .update(payload)
    .digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
```

```python
# Python 等价实现
import hmac, hashlib, base64

def gen_sign(params, ts, fingerprint):
    payload = '|'.join([
        params['url'], params.get('body', ''),
        str(ts), fingerprint
    ])
    raw = hmac.new(b'[填入密钥]', payload.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()
```

### 分支 B：hot_methods 全自定义 + hot_keys 少 → vm/execjs 沙箱执行提取 JS

```javascript
// Node.js + vm
const vm = require('vm');
const fs = require('fs');

const sandboxCode = fs.readFileSync('./config/sign_extracted.js', 'utf8');

const sandbox = {
  // 最小环境：把 hot_keys 里出现的全部属性放进来
  navigator: { userAgent: '...', platform: '...', language: 'zh-CN' },
  // ... 其他 hot_keys 暴露的属性
};
vm.createContext(sandbox);
vm.runInContext(sandboxCode, sandbox);

function genSign(input) {
  return sandbox.__export_sign(input);
}
```

### 分支 C：hot_keys 多（30+） + cookie 来自 HTTP Set-Cookie → 路径 B jsdom 环境伪装

见 knowledge/env-patch 知识 + `cases/jsvmp-xhr-interceptor-env-emulation.md`。

将本案例中采集到的 `hot_keys` 清单作为 "要对齐的环境属性集"——省去 58 项盲目对齐。

---

## 踩坑记录

- **坑 1：instrumentation(action="install") 源码级插桩必须在 navigate/reload 之前调用**——插桩注册晚了就抓不到 VMP 脚本加载
- **坑 2：AST tap 在 MCP 侧用 esprima 解析，不依赖页面 CDN**——若原始源码 parse 失败或改写产物未执行，再降级到正则替换模式
- **坑 3：hook 后的 reload 只刷当前页，不改变 URL**——首屏挑战场景要先 `inject_hook_preset` 装好探针再 `navigate`，不能靠 reload
- **坑 4：hot_keys 里 "[key of Symbol()]"**——这是 Symbol 键被 preview 化的表现，不是真实属性名，可以忽略
- **坑 5：同一个 VMP 被多次加载（HMR / 页面跳转）** → MCP 会按 URL 缓存改写结果；当前接口不需要传缓存参数
- **坑 6：VMP 通过 eval / new Function 动态生成子 VMP** → 源码级插桩看不到动态生成的部分，需要额外 `hook_function(Function, ...)` 截获
- **坑 7：Proxy（jsvmp_hook）与源码级插桩叠加时页面崩溃** → 尝试 `hook_jsvmp_interpreter(track_props=False)` 关闭 Proxy，只留 apply/Reflect.*

---

## 变体说明

| 变体 | 差异点 | 调整策略 |
|------|-------|---------|
| RS 5 | 固定 `sdenv-*.js` 命名 | 插桩 url 匹配模式用 `**/sdenv-*.js` |
| RS 6 | 脚本名每次不同 + 多层 VMP | 先 `list_network_requests` 找所有 100KB+ JS，逐个装插桩（tag 区分） |
| Akamai sensor_data | `_abck` / `bm_sz` cookie | 重点看 `hot_keys` 中 touch/mouse 事件相关属性 |
| webmssdk（短视频平台） | 配合 msToken 预热 | 需先让 `/v1/generate_token` 预热接口完成再触发业务 |
| obfuscator.io（开源） | case 数可能只有 20-30 | dispatch 规模较小，插桩 log 中 dispatch tap 频次相应较低 |

---

## 指纹匹配时的权重建议

作为 Phase 0.5 指纹匹配的备选路径，本案例应命中以下任一条件即触发"尝试源码级插桩"：

- **高权重（直接走）**：源码含 1000+ 元素字节数组 + while-switch 解释器循环（`search_code` 命中），或插桩 log 显示高密度 dispatch tap
- **中权重（优先试）**：单 JS > 200KB + 含 while-switch + 参数长度 128/192/256 + Base64 变体
- **低权重（参考）**：Cookie 中有 acw_tc / FSSBBIl1 / _abck / ak_bmsc / ttwid / msToken 等已知模式字段
