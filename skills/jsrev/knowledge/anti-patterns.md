# 反模式清单（Temptation / Correct move / Self-check 三段式）

> lineage：主体蒸馏自 trace/references/anti-patterns.md（10 条三段式）；并入 hello_js_reverse_skill/references/common-pitfalls.md（6 条实战反模式）——重复条目合并为一条（1/2/4 号），C 独有的"AI 辩护驳斥"并入对应条目，C 独有条目补为 11/12 号。
> 这里的每一条都是真实实战中发生过的失败路径，不是"参考建议"。仅用于已授权目标的协议分析。

## 使用方式

1. 动手前扫视 12 条标题（对应主 skill CHECK-2 经验库速查）。
2. 决策卡住时回来对照：当前方向是不是某条反模式。
3. 写代码写到一半发现自己在滑向反模式：立即停，走降级梯度（[experience-rules.md](experience-rules.md) §五）。
4. 用户指出违规时，可直接引用条目编号对照。

---

## 1. 浏览器兜底方案当最终交付

- **Temptation**：驱动页面、调页面内 `fetch`、或把浏览器 profile 留作隐藏依赖（"JSVMP 保护极其复杂，纯 Node 几乎不可能绕过"）。
- **Correct move**：识别浏览器提供的决定性产物，在最近的稳定边界收割它，然后用本地 HTTP 重放；纯 Node/补环境方案优先。
- **Self-check**：浏览器进程消失后，采集器还能工作吗？——在无 X11、无浏览器、只有 Node.js 的容器里能否稳定跑满 24 小时？能 → 合规；不能 → 违规。

**实战驳斥**（瑞数 nmpa，2026-04，AI 违反实例）：

```javascript
// cookie_fetcher.js（实战 AI 产出，违反本条）
const { firefox } = require('playwright');
async function getCookies() {
  const browser = await firefox.launch();
  const page = await browser.newPage();
  await page.goto('https://www.nmpa.gov.cn/...');  // 过 RS 412 挑战
  await page.waitForTimeout(5000);                  // 等挑战自动完成
  const cookies = await page.context().cookies();  // 取 NfBCSins2OywS
  return cookies;
}
// 最终方案每 30 分钟运行一次 getCookies()
```

AI 的辩护是"瑞数 JSVMP 极复杂，纯 Node 不可能"；但工作区里已有同站纯 Node 补环境方案（sdenv），AI 没查经验库就断言"不可能"；最终交付在无浏览器容器中无法稳定运行一小时以上——"不可能"从未被验证过。正确做法形态：

```javascript
// 纯 Node 补环境方案（sdenv：魔改 jsdom + C++ V8 Addon）
const { jsdomFromUrl } = require('sdenv');
async function getRSCookies(targetUrl) {
  const dom = await jsdomFromUrl(targetUrl, { userAgent: 'Mozilla/5.0...' });
  await new Promise(r => dom.window.addEventListener('sdenv:exit', r));
  return extractCookies(dom);
}
```

## 2. 硬编码轮转状态（cookie / token / nonce）

- **Temptation**：把当前能用的 cookie/token/nonce/header 粘进配置，因为它这一次能用（"cookie 有几小时有效期，不是每次都要开浏览器"）。
- **Correct move**：证明写入者、作用域、过期、刷新路由与首个线上消费者；只重建或刷新权威产物——能请求首页 `Set-Cookie` 直接拿到的值、能基于 nonce 协议还原的签名值，都不该硬编码。
- **Self-check**：新一轮运行能否不靠人工重抓恢复该值？——代码在无浏览器环境跑一周、零人工干预，是否仍稳定？

**实战驳斥**（抖音 /aweme/detail，2026-04，灰色地带违反）：

```json
// headers.json（AI 产出）
{ "Cookie": "ttwid=1|xxxxxxxx; __ac_nonce=yyyyyy; __ac_signature=zzzzzz" }
```

"几小时"还是"几天"不影响定性——cookie 一过期，**没有浏览器就完全无法工作**，可用性取决于浏览器是否可用，浏览器即依赖；且 `ttwid` 请求首页即可从 `Set-Cookie` 拿到，`__ac_signature` 可基于 `__ac_nonce` 协议还原，当时均已有公开路线。cookie/签名值硬编码亦属主 skill §8 技术红线。

## 3. 一次侥幸成功就开始规模化

- **Temptation**：一个页面跑通后，立刻加翻页、并发、导出自动化或运行时瘦身。
- **Correct move**：先把最小请求重放两次，再用同一链条证明下一个 cursor/分页。
- **Self-check**：同一单页请求在新的一次重放中还通过吗？

## 4. 跨级跳运行时档位 / 判定"不可能还原"

- **Temptation**：Python 不行就上大运行时；运行时加载失败就上大而全的宿主补丁；一条路由被拦就迷信传输层；补环境没让 SDK 激活，就横跳"每次请求前用浏览器过一遍拿签名"。
- **Correct move**：记录最后一份有效证明、确切盲点、下一档为何最小、以及浏览器无关交付为何仍成立；沿降级梯度逐级走（[experience-rules.md](experience-rules.md) §五），禁止跨梯度直奔浏览器兜底。
- **Self-check**：能说出更重的那一层具体解决哪个失败吗？降级梯度的下一级试过了吗？

**实战驳斥**（TikTok webmssdk，2026-04，潜在滑坡）：AI 复盘自述——"如果后续环境补丁迭代仍无法激活 SDK 拦截器，我可能会被迫考虑'每次请求前用浏览器过一遍页面获取签名'的方案"。"环境补丁没让 SDK 激活"只是**本步骤**的问题，不是"整个协议方案不可行"的证据；应走降级梯度的**下一级**，而不是横向跳到浏览器——插桩模式切换（ast↔regex）、点对点 hook、路径 B 变体（vm 沙箱 / jsdom 全量加载 / sdenv）都还没试就想到横跳。

## 5. 没有干净基线就上宽 hook

- **Temptation**：还没冻结一份未触碰的请求，就先装全局 hook 或断点。
- **Correct move**：先抓一份干净的请求/响应对，再把 hook 移向最窄的稳定边界。
- **Self-check**：行为是不是在插桩落地之后才发生变化的？（变了 → 你的插桩就是污染源。）

## 6. 逆向可见占位符而非最终出口

- **Temptation**：追一个可见的 `sign` 变量或业务 payload，而不先核对最终出口。
- **Correct move**：追踪规范变异点，重建**恰好跨过网络**的那份东西。
- **Self-check**：本地产物与最终请求槽位、封帧、序列化都对得上吗？

## 7. 把 helper 能跑当协议成功

- **Temptation**：异常变少、输出非空、token 长度合理、cookie 形状像浏览器——感觉像做完了。
- **Correct move**：先对比固定向量，再重放真实请求并核对业务语义。
- **Self-check**：服务端在新的一条会话链上真的接受这份产物了吗？（主 skill §7：HTTP 200、token 长度合理、helper 加载成功、单次看似成功、只有观察没有离线复现——都不算完成。）

## 8. 混用兄弟路由假设

- **Temptation**：把邻近端点的字段顺序、签名覆盖、cursor 规则直接搬过来复用。
- **Correct move**：共享 helper 之前，先对比方法、query、body、content type、headers 与签名覆盖。
- **Self-check**：同一 helper 在两条路由上、用各自的路由级固定向量都通过吗？

## 9. 无视响应解码顺序

- **Temptation**：解到文本能看为止，然后把这套顺序固化进采集器。
- **Correct move**：完整保留前缀剥离、压缩、Base64、二进制信封、protobuf/JSON 顺序以及每个失败分支。
- **Self-check**：冻结的样本在去掉或调换某一步解码时会失败吗？（不会 → 说明你没真正掌握顺序。）

## 10. 存故事不存可验证事实

- **Temptation**：写"这个站点很严""必须用浏览器运行时"这类长篇叙事。
- **Correct move**：存 5-15 条可度量事实：端点、字段槽位、产物形状、解码顺序、会话绑定、重放次数。
- **Self-check**：后续运行能把每条事实核对为"仍成立 / 已变化 / 未知"吗？

## 11. 跳过开工硬 gate 直接 launch_browser

- **Temptation**："用户要求明确，快速开干"——激活 skill 后第一动作就是 `launch_browser` + `navigate`，CHECK 复述口头跳过。
- **Correct move**：开工先复述主 skill（SKILL.md §3）的 CHECK 三项，三项通过再开浏览器：

```text
[CHECK-1] 引擎可用性：确认 jsrev-chrome / jsrev-firefox 存活（零副作用工具探活 / 体检结果）
[CHECK-2] 经验库速查：查本 skill references 与案例库，命中相似场景复用踩坑表与禁动清单
[CHECK-3] 方案意图声明：用哪条路径还原哪个字段、预期交付档位、判定测试是什么
```

- **Self-check**：翻 skill 激活后的前 3 条输出——是 CHECK 复述，还是 `launch_browser` / `navigate`？

**为什么必须是硬 gate**（三次实战复盘，2026-04）：规则写在 skill 里 ≠ 规则会被执行；读了几万字后工作记忆只留最显眼几条，非硬 gate 的规则 100% 会被忽略。三次"快速开干"都导致经验库没查、已有方案没看——瑞数实战用 12 轮对话写了错误方案，而速查 5 分钟可命中已有方案；"快"反而慢一个数量级。

## 12. 工作区已有已验证方案却从零建新项目

- **Temptation**：目录里明明有同站旧方案（含已验证的签名服务、固定向量、踩坑表），却新建一个带日期后缀的平行目录从零写。
- **Correct move**：开工速查时先打开旧方案入口文件看一眼；"重新用 skill" ≠ "从零写代码"；存在歧义（复用 / 重验 / 其他）就问用户，不要默认从零：

```text
列出工作区 → 发现同域旧方案目录（含已验证的 sign 服务与 keys）
→ 打开入口文件确认其形态
→ 询问用户：(A) 基于已有方案创建今天的新目录复用；
          (B) 重新分析一遍验证方案仍有效；(C) 其他？
→ 按用户选择决策
```

- **Self-check**：本次开工前，工作区里同名/同域目录至少被打开看过一个文件了吗？

**实战驳斥**（瑞数 nmpa，2026-04）：AI 看到了旧目录却没打开任何文件、没问用户，从零写了一份 Playwright 方案（见条目 1）；"用户说重新"被当成了"丢弃已有"的授权，而用户可能只是想用新流程验证一遍。

---

## 贡献新条目

每次实战失败后若发现未覆盖的新反模式：完整复盘后按"Temptation / Correct move / Self-check（+ 实战驳斥）"格式追加。质量要求——真实站点名、AI 当时的具体操作（代码/命令序列）、当时的真实辩护、为什么辩护不成立（具体论证）、正确做法（带代码）、判定测试（便于 self-check），缺一不可。30 条封顶，再涨说明 skill 本身需要结构性调整。
