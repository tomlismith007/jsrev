# 交付契约（Workflow / Delivery / Evidence / Report / iv8）

> lineage：合并蒸馏自 trace/references 契约五篇——workflow.md、delivery.md、evidence.md、report-template.md、iv8-basics.md。
> 档位命名与完成契约以 SKILL.md §5/§7 为准，本篇是其可操作展开版。
> 仅用于已授权目标。

## 1. 启动分类（先于一切深工具）

| 模式 | 含义 | 动作 |
|---|---|---|
| `live-target` | 当前页面/端点需要新鲜的线上与运行时证据 | 记录可用浏览器/调试/运行时工具、选定回退、阻塞项；**不要**为了"证明工具可用"用多个浏览器家族开同一目标 |
| `artifact-only` | 已有捕获/脚本/token/cookie/响应足够推进下一步 | 直接进入对应 Phase |
| `continuation` | 目标、会话假设、工具注册表、交付目标均未失效 | 读上一份 handoff.json 继续 |

## 2. 五阶段主流程

1. **Phase 1 真实请求**：抓到返回有用数据的那个请求。存完整 URL、方法、query、body、headers、出站 cookie、响应形态、redirect 链、initiator。线上出口与中间值不一致时，**以线上出口为准**。
2. **Phase 2 移动状态**：列出成功尝试之间变化的每个字段，并为每个字段归类来源：时间、nonce、cookie 写入者、请求签名者、响应刷新、解码密钥、翻页 cursor、传输属性、会话状态。
3. **Phase 3 变异点**：找到 wire 形态 payload 被改变的位置。常见位置：fetch/XHR 包装器、请求拦截器、序列化器、bootstrap 脚本、暴露的 helper、WASM 导出、响应侧刷新处理器。
4. **Phase 4 离线重建**：先做固定输入 parity；当前档位被证明不足才升运行时。次序：纯 Python → 小 JS/WASM helper → 插桩执行（已知入口 + 固定样本）。
5. **Phase 5 重放**：跑一条完整会话链；确认业务语义而非仅 HTTP 状态；翻页、并发、打包之前，先用新会话重放一次单页。

## 3. 阶段交接：handoff.json

切换阶段时保存（保持脱敏、task-local）：

```json
{
  "task_id": "stable-id",
  "mode": "live-target",
  "current_stage": "Observe",
  "target_url": "https://example.test/api",
  "target_method": "POST",
  "target_fields": ["x-sign"],
  "baseline_id": "source-session-time",
  "artifacts": {},
  "success_predicate": "fixed input and live replay match",
  "unresolved": []
}
```

## 4. 证据契约

证据要**新鲜、有序、脱敏**。

### 4.1 最小捕获（针对业务请求）

1. 请求 URL、方法、query、body 字节、content type。
2. 浏览器/网络包装器全部跑完之后的请求 headers。
3. **按实际发出形态**记录的出站 Cookie header。
4. 响应状态、headers、body 形态、redirect 链。
5. initiator 调用栈或最接近的脚本/函数边界。
6. 相关存储、cookie 写入、bootstrap 资源。

### 4.2 Cookie Provenance

绝不把每个 cookie 表面当成同一回事，逐项追踪：

1. `Set-Cookie` 响应来源。
2. `document.cookie` 写入者来源。
3. 浏览器 jar 中的值。
4. 出站 Cookie header 的消费方。
5. 作用域、path、过期、刷新路由、首个下游消费者。

### 4.3 固定向量

移植代码之前先冻结至少一组向量：

```json
{
  "input": {"query": {}, "body": {}, "headers": {}},
  "expected": {"field": "known-output-shape"},
  "source": "browser-capture-id",
  "captured_at": "ISO-8601 timestamp"
}
```

用途：首偏差调试（first-divergence）。**过期样本不得当 live 验收**。

### 4.4 脱敏

移除或哈希：cookie、authorization 头、原始账号 ID、私有 token、代理凭据、浏览器 profile、含个人数据的完整请求体。调试所需时保留形状与字段名。

## 5. 交付档位与验收

### 5.1 交付物清单

1. 已确认的请求契约。
2. 移动字段及其刷新来源。
3. helper 边界与保留理由。
4. 固定向量（或 artifact-only 限制声明）。
5. （授权范围内的）新鲜重放证明。
6. 脱敏报告与残余风险。

### 5.2 Proof Manifest

任务内 manifest 示例（`delivery` 字段用 SKILL.md §5 档位名）：

```json
{
  "mode": "live-target",
  "delivery": "pure-python-or-node",
  "request_contract": "analysis/request-contract.json",
  "fixed_vectors": ["fixtures/vector-001.json"],
  "live_replay_count": 2,
  "browser_free": true,
  "runtime_free": false,
  "helper_boundary": "known JS entry only",
  "residual_risks": []
}
```

### 5.3 Acceptance Rules

仅满足以下**之一**时，不得标记完成：

1. helper 能加载。
2. 输出非空。
3. token 长度看起来合理。
4. HTTP 状态是 200。
5. 浏览器重放仍然能跑。
6. 旧 cookie 或旧样本在本地仍通过。

完成 = 启动 gate（SKILL.md §0 SUCCESS）写下的 success predicate 成立。

## 6. 插桩执行档（iv8 降级说明）

> **降级裁决**：jsrev 主 skill **无内置 iv8 执行后端**。原 trace 口径中的 "Python + iv8" 档位在本 skill 中由 **firefox 引擎的 `instrumentation` / `evaluate_js` 承载**——即 SKILL.md §5 第 4 档"插桩执行"（在受控浏览器内计算参数）。若 firefox 引擎插桩/求值能力不可用，该档位**不可选**，交付档位记 **blocked** 并写明卡点。

### 6.1 何时用（四个前提同时成立）

1. 用户明确选择 Python + 插桩执行档。
2. 存在已知 JS 入口或生命周期触发点。
3. 同一条会话链上有新鲜 HTML、脚本、种子数据、cookie 与期望输出。
4. 纯 Python 或小 JS helper 比本地运行目标代码风险更高。

入口未知 → 回浏览器观测；固定样本缺失 → 先抓取再实现。

### 6.2 最小流程（六步）

1. 用一个 Python 会话贯穿：入口页、脚本抓取、helper 执行、重放请求。
2. 易失 HTML、脚本、运行时材料存入证据工作区。
3. 只配置目标代码**实际读取**的环境字段。
4. 触发已知入口或页面生命周期。
5. 提取生成的 URL、headers、cookie 更新、body 或 token。
6. 把输出合并回同一 Python 会话并重放请求。

### 6.3 验证（五查）

1. 固定输出形状与关键字段。
2. 至少两次新鲜生成。
3. 服务端响应语义，而非仅 HTTP 状态。
4. cookie 与会话连续性。
5. 插桩无法表达某个浏览器特性时，写清失败说明。

### 6.4 边界

不要把插桩执行档做成宽泛的浏览器替代品。helper 保持最窄；避免通用框架；报告须写明确切入口、材料、输出、重放结果与残余缺口。

## 7. 报告模板（5 段）

脱敏总则：报告只写 secret 名称、来源、作用域、过期与短哈希。不得把原始 cookie、token、密码、authorization 头、代理凭据、私钥、账号标识贴进对话、fixtures 或共享报告。

### 7.1 Phase Delta

```markdown
Phase Delta
- New evidence:
- Changed hypothesis:
- Intake/capability change:
- Evidence path and SHA-256:
- First divergence:
- Next smallest proof:
```

### 7.2 Recon

```markdown
Recon
- Target:
- Mode: live-target / artifact-only / continuation
- Real request candidates:
- Useful data source: HTML / XHR / Fetch / GraphQL / WebSocket / binary / other
- Key headers: names and provenance only
- Key cookies: names, writer, scope, expiry, hash
- Decode needed:
- Misleading signals:
- Next hypothesis:
```

### 7.3 Implementation Decision

Delivery shape 按 jsrev 档位枚举：`pure Python/Node / +small JS / +small WASM / +插桩执行（firefox 引擎承载，无后端记 blocked） / blocked`。

```markdown
Implementation Decision
- Delivery shape:
- Why this shape:
- Required session state:
- Required headers:
- Required cookies:
- Required helper outputs:
- Required decode chain:
- Known risks:
```

### 7.4 Final Delivery

```markdown
Final Delivery
- Collector path:
- Intake mode:
- Real endpoint:
- Moving parts:
- Helper boundary:
- Fixed vectors:
- Replay count:
- Pagination confirmed:
- Browser dependency: none / blocked reason
- Residual risks:
```

### 7.5 Minimal Verifiable Facts

一次可复用的胜利之后，保留 5-15 条事实；每条必须可观测、可度量、且不含原始 secret 即可安全存储。

```markdown
Minimal Verifiable Facts
- Family or route:
- Fact 1:
- Fact 2:
- Fact 3:
- Fact 4:
- Fact 5:
```
