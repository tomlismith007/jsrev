# 公开证明工具（Public Proof）

> lineage: 合并自 trace/references/public-proof-tools.md，2026-08-30 并入 jsrev skill knowledge/。这些小脚本让交付证据可复核，而不携带任何私有案例材料。

## 脚本

脚本位于本 skill 的 `scripts/` 目录（即 `skills/jsrev/scripts/`）：

| 脚本 | 用途 |
|---|---|
| [scripts/protocol_diff.py](../scripts/protocol_diff.py) | 对比两份 JSON/文本协议样本，展示结构差异。 |
| [scripts/crypto_fingerprint.py](../scripts/crypto_fingerprint.py) | 对可疑的 sign/token/密文字符串输出基础长度/字符集提示。 |
| [scripts/public_proof_lab.py](../scripts/public_proof_lab.py) | 运行确定性本地检查：精确线上字节、修改后摘要 parity、解码顺序。 |

验证码垂直域的协议重放脚本（GT4 纯 Python 路径等）在 [../verticals/captcha/scripts/](../verticals/captcha/scripts/)，见 [captcha-routing.md](../verticals/captcha/captcha-routing.md) 的依赖总表与降级说明。

## 建议用法

1. 抓包样本先人工规范化并脱敏（可用你自己的工具链）。
2. 用 `protocol_diff.py` 对比一份浏览器实抓与一份本地重放。
3. `crypto_fingerprint.py` 只用于提示，不能确定性地判定算法。
4. `public_proof_lab.py --self-test` 用于演示为什么精确字节、摘要掩码和解码顺序会影响结果。

## 验收边界（Acceptance）

这些工具只是证明辅助，本身不是成功闸门。任务完成的唯一判据是完成契约（SKILL.md §7）：固定向量 parity、fresh replay、服务端校验通过的响应；或明确标注为 artifact-only 的分析。
