# 使用无限星河AI 配置 Codex、Claude Code 与 js-reverse-mcp

> 本文由 [无限星河AI（Infistar）](https://www.infistar.cc/register?aff=JJXMRC86&ref_source=link) 赞助。配置、接口调用和网页分析步骤均经过实际测试；赞助不影响对限制、风险和故障的如实说明。

这篇教程解决两层配置问题：

1. **模型接口配置**：把无限星河AI 的 API 地址、API Key 和模型接入 Codex 或 Claude Code。
2. **MCP 工具配置**：把 [`js-reverse-mcp`](https://github.com/zhizhuodemao/js-reverse-mcp) 接入客户端，让模型能够操作浏览器并分析 JavaScript。

二者缺一不可：API 决定“由哪个模型思考”，MCP 决定“模型可以使用哪些浏览器调试工具”。

## 1. 准备工作

开始前请准备：

- Windows、macOS 或 Linux；
- [Node.js](https://nodejs.org/) `20.19` 或更高版本；
- 稳定版 Google Chrome；
- 一个无限星河AI 账户和可用余额；
- 只分析自己拥有或已获得明确授权的网页。

检查 Node.js 与 npm：

```bash
node --version
npm --version
```

如果 Node.js 版本低于 `20.19`，请先升级，否则 `js-reverse-mcp` 可能无法启动。

## 2. 注册账户并创建 API Key

1. 打开 [无限星河AI 注册页面](https://www.infistar.cc/register?aff=JJXMRC86&ref_source=link) 完成注册和登录。
2. 进入控制台的 [令牌管理](https://infistar.cc/console/token)。
3. 点击“添加令牌”。建议为本教程单独创建一个令牌，并设置合理的额度上限。
4. 确认令牌所属分组能够调用准备使用的模型。
5. 创建后立即复制 API Key，并保存到密码管理器中。

API Key 通常以 `sk-` 开头。它可以消耗账户余额，不要把完整 Key 发到聊天、截图、Issue、日志或 Git 仓库中。

### 验证 Key 和模型权限

Windows PowerShell：

```powershell
$env:INFISTAR_API_KEY = "你的_API_Key"
curl.exe https://infistar.cc/v1/models `
  -H "Authorization: Bearer $env:INFISTAR_API_KEY"
```

macOS / Linux：

```bash
export INFISTAR_API_KEY="你的_API_Key"
curl https://infistar.cc/v1/models \
  -H "Authorization: Bearer $INFISTAR_API_KEY"
```

请求成功后，检查返回结果的 `data[].id` 中是否包含 `gpt-5.6-sol`。模型权限以当前 API Key 的实际返回结果为准，不要填写模型中文名或套餐名。

## 3. 模型怎么选

本教程统一使用：

```text
gpt-5.6-sol
```

推荐关系如下：

| 模型            | 适合场景                                    | 建议                     |
| --------------- | ------------------------------------------- | ------------------------ |
| `gpt-5.6-sol`   | 复杂代码库、JS 逆向、长链路调试、高价值任务 | 本教程首选               |
| `gpt-5.6-terra` | 常规开发、日常调试、效果与成本平衡          | 日常默认可选             |
| `gpt-5.6-luna`  | 快速检索、简单修改、批量低成本任务          | 对速度和成本更敏感时使用 |

Sol 更适合复杂、开放式和需要持续推理的工作。若控制台暂时没有该模型，请先用 `/v1/models` 查看当前令牌可用的精确模型 ID，再选择 Terra 或其他可用模型。

## 4. 配置 Codex

### 4.1 安装 Codex CLI

```bash
npm install -g @openai/codex
codex --version
```

### 4.2 设置 API Key

先在当前终端临时设置，测试通过后再决定是否持久保存。

Windows PowerShell：

```powershell
$env:INFISTAR_API_KEY = "你的_API_Key"
```

macOS / Linux：

```bash
export INFISTAR_API_KEY="你的_API_Key"
```

### 4.3 配置接口和模型

打开 Codex 配置文件：

- Windows：`%USERPROFILE%\.codex\config.toml`
- macOS / Linux：`~/.codex/config.toml`

加入以下内容：

```toml
model = "gpt-5.6-sol"
model_provider = "infistar"

[model_providers.infistar]
name = "无限星河AI"
base_url = "https://infistar.cc/v1"
env_key = "INFISTAR_API_KEY"
wire_api = "responses"
```

这里的 `base_url` **必须带 `/v1`**，`wire_api` 使用 `responses`。

### 4.4 验证 Codex

在设置过环境变量的同一个终端运行：

```bash
codex -a on-request
```

然后发送：

```text
请只回复“CODEX_OK”，不要读取或修改文件，也不要运行命令。
```

收到 `CODEX_OK` 说明 API 地址、Key、模型和 Responses 接口均已生效。

## 5. 配置 Claude Code

### 5.1 安装 Claude Code

```bash
npm install -g @anthropic-ai/claude-code
claude --version
```

### 5.2 临时配置并验证

Claude Code 使用 Anthropic Messages 兼容接口。它的地址与 Codex 不同：**不要添加 `/v1`**。

Windows PowerShell：

```powershell
$env:ANTHROPIC_BASE_URL = "https://infistar.cc"
$env:ANTHROPIC_AUTH_TOKEN = "你的_API_Key"
claude --model gpt-5.6-sol
```

macOS / Linux：

```bash
export ANTHROPIC_BASE_URL="https://infistar.cc"
export ANTHROPIC_AUTH_TOKEN="你的_API_Key"
claude --model gpt-5.6-sol
```

进入 Claude Code 后运行 `/status`，确认 API 地址是 `https://infistar.cc`。随后发送：

```text
请只回复“CLAUDE_OK”，不要读取或修改文件，也不要运行命令。
```

### 5.3 保存配置并消除“未知模型”提示

当前版本的 Claude Code 可能提示它不认识 `gpt-5.6-sol` 的上下文窗口。这只是 Claude Code 本地的模型识别提示，不代表无限星河AI 没有该模型。

可以在用户配置中把 Claude Code 的内置模型入口映射到实际模型 ID。配置文件位置：

- Windows：`%USERPROFILE%\.claude\settings.json`
- macOS / Linux：`~/.claude/settings.json`

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://infistar.cc",
    "ANTHROPIC_AUTH_TOKEN": "你的_API_Key"
  },
  "model": "claude-opus-4-6",
  "modelOverrides": {
    "claude-opus-4-6": "gpt-5.6-sol"
  }
}
```

这样 Claude Code 仍使用自己认识的模型入口管理上下文，实际请求发送给 `gpt-5.6-sol`。

该文件含有完整 API Key，不要上传到 Git。若系统中曾设置 `ANTHROPIC_API_KEY`，建议删除或确认它不会覆盖当前配置。

## 6. 安装并配置 js-reverse-mcp

推荐用 `npx` 按版本运行，不需要全局安装。本教程锁定已测试版本 `4.0.3`，避免未来版本变化导致命令表现不同。

先创建一个专用输出目录。MCP 只能在这个目录内读写文件：

Windows PowerShell：

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\js-reverse-work"
```

macOS / Linux：

```bash
mkdir -p "$HOME/js-reverse-work"
```

### 6.1 接入 Codex

Windows：

```powershell
codex mcp add js-reverse -- npx -y js-reverse-mcp@4.0.3 --isolated --allowedRoots "$env:USERPROFILE\js-reverse-work"
codex mcp list
```

macOS / Linux：

```bash
codex mcp add js-reverse -- npx -y js-reverse-mcp@4.0.3 --isolated --allowedRoots "$HOME/js-reverse-work"
codex mcp list
```

重新启动 Codex，并使用允许交互确认的权限策略：

```bash
codex -a on-request
```

首次调用 MCP 工具时，检查工具名称和参数，再批准调用。

### 6.2 接入 Claude Code

Windows：

```powershell
claude mcp add -s user js-reverse -- npx -y js-reverse-mcp@4.0.3 --isolated --allowedRoots "$env:USERPROFILE\js-reverse-work"
claude mcp list
```

macOS / Linux：

```bash
claude mcp add -s user js-reverse -- npx -y js-reverse-mcp@4.0.3 --isolated --allowedRoots "$HOME/js-reverse-work"
claude mcp list
```

`-s user` 表示对当前用户生效。若只想在当前项目使用，可改成 `-s project`。

### 6.3 为什么推荐这两个参数

- `--isolated`：每次使用临时浏览器配置，不保留 Cookie 和 localStorage，适合教程与一次性分析。
- `--allowedRoots <目录>`：把 MCP 的本地文件读写权限限制在专用目录内。

需要保留登录态时可以移除 `--isolated`；只有遇到强反爬站点时才考虑 `--cloak`。`--cloak` 首次使用会下载约 200 MB 的浏览器文件，看起来可能像启动卡住。

## 7. 完成一次合法网页 JS 分析

本例只读取无限星河AI 的公开首页，不登录、不绕过权限、不提交表单，也不修改网站数据。

在 Codex 或 Claude Code 中发送：

```text
仅分析我有权测试的公开页面 https://infistar.cc/，不要登录、点击按钮、提交表单或修改任何数据。

请使用 js-reverse MCP：
1. 打开该页面；
2. 列出加载的 JavaScript 脚本；
3. 在脚本中搜索 supported_endpoint；
4. 汇总页面地址、脚本数量、命中脚本 URL、行号和附近代码含义。
```

调用顺序通常是：

```text
new_page → list_scripts → search_in_sources → get_script_source（需要更多上下文时）
```

### 本文作者的实际测试结果

测试日期：2026-08-25。

- MCP Server 成功启动并暴露 **24 个工具**；
- 成功打开 `https://infistar.cc/`；
- 页面当时加载 **7 个 JavaScript 脚本**；
- 在首页主脚本 `index-Chmfo85E.js` 第 94 行附近找到 **1 处** `supported_endpoint`；
- 命中代码会读取模型的 `supported_endpoint_types`，用于按支持的接口类型筛选模型；
- 整个测试只进行了只读检查，没有点击、表单提交、登录或数据修改。

前端构建后的文件名和行号会随网站发布变化，因此复现时应以工具当次返回为准。

## 8. 常见故障排查

| 现象                                                            | 常见原因                                 | 处理方法                                                                                          |
| --------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `401` / `Invalid API Key`                                       | Key 不完整、已删除、变量未在当前终端生效 | 重新复制 Key，检查前后空格；确认令牌仍启用；从设置变量的同一个终端启动客户端                      |
| `402`                                                           | 余额不足                                 | 在钱包管理中充值或兑换额度                                                                        |
| `403`                                                           | 令牌分组无模型权限                       | 检查令牌分组，或换用该 Key 可见的模型                                                             |
| `404`                                                           | API 地址或模型 ID 错误                   | Codex 使用 `https://infistar.cc/v1`；Claude Code 使用 `https://infistar.cc`；模型写 `gpt-5.6-sol` |
| 模型不存在                                                      | 使用了展示名称，或当前 Key 看不到该模型  | 调用 `GET /v1/models`，复制 `data[].id` 的原始值                                                  |
| Claude Code 提示未知模型                                        | 客户端不认识第三方模型的上下文信息       | 使用上文的 `modelOverrides` 映射；这不等同于服务端模型不存在                                      |
| MCP 列表中没有 `js-reverse`                                     | 添加命令失败或客户端未重启               | 运行 `codex mcp list` 或 `claude mcp list`；删除后重新添加并重启客户端                            |
| Windows 提示找不到 `npx`                                        | Node.js 未安装或 PATH 未刷新             | 重新安装 Node.js，重开终端；必要时把 MCP 命令中的 `npx` 改成 `npx.cmd`                            |
| MCP 首次启动超时                                                | `npx` 正在下载依赖，网络较慢             | 先手动运行 `npx -y js-reverse-mcp@4.0.3 --help` 完成下载，再重启客户端                            |
| `MCP tool call requires approval, but approval policy is never` | 客户端禁止询问授权，MCP 调用无法获批     | Codex 用 `codex -a on-request` 进入交互会话并批准调用；不要在首次测试时使用 `-a never`            |
| 浏览器没有打开                                                  | Chrome 未安装、旧进程占用或 MCP 启动失败 | 安装稳定版 Chrome，关闭残留测试浏览器，检查 MCP 状态和 stderr 日志                                |
| 工具能启动但读写文件被拒绝                                      | 文件不在 `--allowedRoots` 下             | 把输出路径改到专用工作目录，或重新添加正确的允许目录                                              |
| 第一次使用 `--cloak` 长时间无输出                               | 正在下载约 200 MB 浏览器文件             | 先运行 `npx cloakbrowser install`，等待下载完成后再启动 MCP                                       |
| `429`                                                           | 请求频率或并发过高                       | 等待 10–30 秒，降低并发，必要时换模型                                                             |
| `500` / `502` / `503` / `504`                                   | 上游波动或超时                           | 等待后重试；持续出现时换模型并查看平台公告                                                        |

如果 Codex 中 MCP 启动确实较慢，可在 `config.toml` 里找到自动生成的服务配置并增加超时：

```toml
[mcp_servers.js-reverse]
command = "npx"
args = ["-y", "js-reverse-mcp@4.0.3", "--isolated", "--allowedRoots", "你的工作目录"]
startup_timeout_sec = 120
tool_timeout_sec = 180
```

不要使用 `DEBUG=*` 收集日志，它可能记录浏览器协议中的页面内容、Cookie 或凭据。需要调试时仅使用项目文档建议的有限日志范围，并在分享前脱敏。

## 9. 安全与合规

- 只分析自己拥有、明确授权或允许安全研究的页面，并遵守网站条款和当地法律。
- 不要在含有个人信息、支付信息或生产后台的浏览器 Profile 中运行 MCP。
- API Key 不要写入仓库、前端代码、Issue、截图或公开日志。
- 为教程和自动化任务创建独立 Key，设置额度上限并定期轮换。
- Key 一旦在聊天或其他不受控位置完整出现，应立即在“令牌管理”中删除并重新创建。
- `evaluate_script` 可以执行页面代码；调用前务必检查参数，不运行来源不明的脚本。

## 10. 本文实测范围

本文写作时完成了以下验证：

- `GET /v1/models`：成功，并确认 `gpt-5.6-sol` 可见；
- OpenAI Responses API：`gpt-5.6-sol` 文本响应成功；
- Responses 工具调用：成功返回函数调用；
- Anthropic Messages 兼容接口：`gpt-5.6-sol` 文本响应成功；
- Anthropic 工具调用：成功返回 `tool_use`；
- Codex CLI 自定义 provider：成功返回 `CODEX_OK`；
- Claude Code `2.1.243`：安装、配置项和 MCP 添加命令已校验；
- `js-reverse-mcp@4.0.3`：构建、类型检查和生产依赖审计通过；
- `js-reverse-mcp` 对无限星河AI 公开首页的只读分析：成功。

## 参考链接

- [无限星河AI](https://www.infistar.cc/register?aff=JJXMRC86&ref_source=link)
- [无限星河AI 文档](https://doc.infistar.cc/)
- [Codex 接入教程](https://doc.infistar.cc/client-integrations/codex)
- [Claude Code 接入教程](https://doc.infistar.cc/client-integrations/claude-code)
- [HTTP 状态码排查](https://doc.infistar.cc/troubleshooting/http-status-troubleshooting)
- [js-reverse-mcp 项目](https://github.com/zhizhuodemao/js-reverse-mcp)
- [OpenAI：选择 Sol、Terra 和 Luna](https://learn.chatgpt.com/docs/models#choosing-sol-terra-and-luna)
- [Codex MCP 配置](https://learn.chatgpt.com/docs/extend/mcp)
