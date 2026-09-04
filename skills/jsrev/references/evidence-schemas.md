# evidence-schemas（v0 最小 schema）

> 证据工作区 `tasks/<id>/` 各文件的最小约定。原则：字段宁少勿错，全部 JSON Lines / JSON；**落盘前脱敏**（cookie 值、token、账号字段打码或截断）。

## task.json

```json
{
  "task_id": "2026-08-30-acw-tc-provenance",
  "target": "https://example.com/api/list（授权目标）",
  "class": "signature | behavioral | obfuscation",
  "goal_fields": ["x-sign", "acw_tc"],
  "delivery_target": "pure | +js | +wasm | +instrumented | blocked（语言中性：pure=纯 Python/Node 重写；+js=附少量 JS helper 沙箱调用）",
  "engines_used": ["chrome", "firefox"],
  "created_at": "2026-08-30T10:00:00+08:00",
  "status": "recon | locating | rebuilding | verifying | delivered | blocked"
}
```

## network.jsonl（每行一条请求/响应证据）

```json
{
  "ts": "2026-08-30T10:00:01.123+08:00",
  "dir": "request | response",
  "method": "POST",
  "url": "https://example.com/api/list",
  "headers": {"x-sign": "<captured>", "cookie": "<masked>"},
  "body": "<truncated 4KB>",
  "status": 200,
  "note": "可选：为什么这条样本重要"
}
```

## runtime-evidence.jsonl（hook/插桩/断点观察流水）

```json
{
  "ts": "2026-08-30T10:00:02.456+08:00",
  "source": "hook | instrumentation | breakpoint | engine-trace | compare-env",
  "engine": "chrome | firefox",
  "location": "app.js:12345 sign() 内部",
  "observation": "JSON.stringify 第 2 参被改写为自定义序列化",
  "raw": "<截断的原始输出，敏感字段打码>"
}
```

## handoff.json（阶段交接，schema 继承自 trace/workflow.md）

```json
{
  "task_id": "…",
  "mode": "recon | locate | rebuild | verify",
  "current_stage": "rebuilding",
  "target_url": "…",
  "target_fields": ["x-sign"],
  "baseline_id": "baseline-001（切换引擎前的基线快照引用）",
  "artifacts": ["fixtures/vector-001.json", "deobfuscated/sign.js"],
  "success_predicate": "固定向量 parity 通过 + fresh replay 成功",
  "unresolved": ["ACW_TF 服务端校验逻辑未确认"]
}
```

## fixtures/ 固定向量（每文件一组）

```json
{
  "input": {"ts": 1756528800, "path": "/api/list", "body": "{\"page\":1}"},
  "expected": "9f86d081884c7d659a2f…",
  "source": "真实请求 #3 于 2026-08-30T10:00 抓取",
  "captured_at": "2026-08-30T10:00:03+08:00"
}
```

要求：至少 2 组（含 1 组边界值，如空 body、超长字段）；`expected` 必须来自**真实浏览器运行**，不得来自离线实现自身。

## report.md 段落骨架

1. **Phase Delta**：本次相对上次会话推进了什么
2. **Recon**：目标行为、类别判定、动态字段清单
3. **Implementation Decision**：选了哪级交付档位、为什么
4. **Final Delivery**：离线路径说明、helper 边界、文件清单
5. **Minimal Verifiable Facts**：5-15 条可测事实（带 fixture 引用）
6. **Residual Risks / Blockers**：未竟事项与诚实声明
