# 案例库（Cases）

本目录是 jsrev skill 的实战案例库，存放已验证的逆向分析经验案例，供 Phase 0.5 指纹匹配阶段自动检索（SKILL.md §3 CHECK-2）。

> lineage: 源自 hello_js_reverse_skill/cases/README.md，2026-08-30 按新布局重写（cases/ 并入 jsrev skill；私有映射机制改为"私有案例不入库"原则）。

## 🔍 高频站点速查表（**SKILL.md §3 CHECK-2 必看**）

> 如果你的目标站点或反爬类型在下表中，**直接跳到对应案例，不要从零分析**。
> 关键词匹配规则：URL / 搜索到的 JS 变量名 / 请求参数名 任一命中即可。

| 关键词（URL 域名 / 签名参数 / SDK 字符串） | 反爬类型 | 对应案例 / 目录 | 已验证方案 |
|---|---|---|---|
| 国际版短视频 `X-Bogus` / `X-Gnarly` / `webmssdk` / `cacheOpts` | 行为型 | [`jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox.md`](./jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox.md) | jsdom 环境伪装 |
| 国内短视频 `a_bogus` / `_sdkGlueInit` | 行为型 | [`jsvmp-xhr-interceptor-env-emulation.md`](./jsvmp-xhr-interceptor-env-emulation.md)（待建变体：`jsvmp-abogus-douyin-webapp.md`） | vm 沙箱 + 自定义字符表 |
| 政务站点 412 挑战 / `NfBCSins2OywS` / `NfBCSins2OywT` / `.e17ed02.js` | 签名型（RS 6） | [`jsvmp-ruishu6-cookie-412-sdenv.md`](./jsvmp-ruishu6-cookie-412-sdenv.md) | sdenv 纯 Node.js |
| `acmescripts` / `/akam/` | 签名型（Akamai） | (待建) | (待建) |
| `acw_sc__v2` / Aliyun WAF | 签名型 | (待建) | (待建) |
| `FSSBBIl1UgzbN7N` / `_RSG` / 200KB 混淆 JS + 412 | 签名型（RS） | 同 RS6 案例 | sdenv |
| `obfuscator.io` 特征（`_0x` 大量前缀） | 纯混淆 | (无专案，走通用骨架) | AST 反混淆 |

### 使用方式

```
Phase 0 CHECK-2（SKILL.md §3）:
1. 目标 URL 的域名 → 查上表
2. navigate 后 search_code 几个关键词 → 查上表
3. 命中任一关键词 → 读对应案例并按其 "已验证定位路径" 执行
4. 未命中 → 记录采集到的关键词，分析完后沉淀新案例
```

### 证据工作区复用检查（SKILL.md §7）

除了本目录，**证据工作区可能已有同站点分析残留**：

```
列目录 js_reverse_cache/tasks/（或 JSREV_HOME 指定根）
→ 看是否有同目标的 task 目录
→ 有 → 最高权重命中（已验证代码与证据！）
→ 先读其 fixtures/ 与 report.md 复用结论，再决定是否重跑

历史项目工作区的常见命名模式（旧约定，遇到时同样先复用）：
  site_<target>/       (某站点的历史分析目录)
  <target>_<date>/     (按日期的某次分析快照)
```

**重要**：工作区里已有同站点产物 → **不要从零写新项目**，先读已有代码与固定向量复用。这既省时间，也避免同一站点沉淀出多套互相矛盾的还原代码。

## 使用方式

- Agent 在 Phase 0.5 采集目标站点的技术指纹后，遍历本目录下的 `.md` 文件，匹配「指纹检测规则」段
- 命中后按案例中的「已验证定位路径」和「还原代码模板」快速执行
- 每个案例以**技术特征**命名，不以具体域名命名

## 案例索引

| 案例文件 | 技术特征 | 难度 | 核心方案 | 反爬类型 |
|---------|---------|------|---------|---------|
| [jsvmp-xhr-interceptor-env-emulation.md](jsvmp-xhr-interceptor-env-emulation.md) | JSVMP 字节码虚拟机 + XHR 拦截器 + 多层 SDK 联动 + jsdom 全量环境伪装 | ★★★★★ | jsdom 沙箱 + 58 项环境补丁 + XHR Hook 截出 a_bogus | 行为型 |
| [jsvmp-ruishu6-cookie-412-sdenv.md](jsvmp-ruishu6-cookie-412-sdenv.md) | JSVMP RS6 + Cookie 生成 + 412 挑战 + sdenv 补环境 | ★★★★★ | sdenv（魔改 jsdom + C++ V8 Addon）让RS JSVMP 真实执行生成 Cookie | 签名型 |
| [universal-vmp-source-instrumentation.md](universal-vmp-source-instrumentation.md) | 通用 VMP（RS 5/6、Akamai sensor_data、webmssdk、obfuscator.io）+ 首屏挑战 + 混合 Cookie 模式 | ★★★★ | 源码级插桩 + hot_keys 指纹学习 + analyze_cookie_sources 归因（**骨架模板**，由使用者按实际站点填充） | 混合（以签名型为主） |
| [jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox.md](jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox.md) | JSVMP 双签名（X-Bogus + X-Gnarly）+ XHR/fetch 双通道拦截 + cacheOpts 初始化 + jsdom Firefox 环境伪装 | ★★★★★ | jsdom 喂入-截出策略 + Firefox 格式 native code 伪装 + cacheOpts 路径注册 + got-scraping TLS 指纹模拟 | 行为型 |

## 指纹匹配快速参考

| 技术特征关键词 | 匹配案例 | 置信度 |
|--------------|---------|--------|
| `webmssdk` / `byted_acrawler` / `_SdkGlueInit` | jsvmp-xhr-interceptor-env-emulation 或 jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox | 高（需进一步区分） |
| `cacheOpts` + `X-Gnarly` | jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox | 高（国际版双签名变体） |
| `a_bogus` + 192字符 + 无 `cacheOpts` | jsvmp-xhr-interceptor-env-emulation | 高（国内版单签名） |
| `sdenv` / `FuckCookie` / 412 挑战 | jsvmp-ruishu6-cookie-412-sdenv | 高（RS） |
| `while-switch` 分发循环 + 200KB+ 文件 | universal-vmp-source-instrumentation | 中（通用骨架） |

## 变体关系图

```
JSVMP 字节码虚拟机 + 多层 SDK 联动
├── 国内短视频平台变体（单签名 a_bogus + bdms.paths）
│   └── → jsvmp-xhr-interceptor-env-emulation.md
├── 海外短视频平台（国际版）变体（双签名 X-Bogus + X-Gnarly + cacheOpts）
│   └── → jsvmp-dual-sign-xhr-intercept-cacheOpts-jsdom-firefox.md
└── 通用 VMP 骨架（RS/Akamai/webmssdk/obfuscator.io）
    └── → universal-vmp-source-instrumentation.md

RS JSVMP + Cookie 签名
└── → jsvmp-ruishu6-cookie-412-sdenv.md
```

## 私有案例不入库（原则声明）

本目录**没有**私有域名映射机制（旧版的 `_private_mapping.json` 已废弃）。替代原则：

- **私有案例不入库**：涉及具体域名、账号、密钥、真实 Cookie 的案例细节，一律不写入本 skill 目录；只落本地证据工作区（`js_reverse_cache/tasks/<task-id>/`，按 SKILL.md §7 Evidence Contract）。
- 入库的案例必须以**技术特征**命名并脱敏：抽象域名描述、去掉真实密钥与会话材料。
- 需要私有标注时，在个人工作区自行维护（不入库、不提交）。

## 新增案例

1. 复制 `_template.md` 为新文件，以技术特征命名，并在文件头加一行 lineage
2. 按模板格式填写各段；工具名以 [../references/tool-matrix.md](../references/tool-matrix.md) 为准，不写死旧名
3. 更新本文件的案例索引表
4. 在"关键经验总结"段列 5-15 条最小可验证事实（如"X-Bogus 长度 28""webdriver === false"）——下次同站升级时可用于手动核对"哪些变了"
5. 涉及具体域名的私有标注放工作区，不入库（见上节）

### 跨端知识提取提示词

当你在其他大模型端完成了一个站点的逆向分析，可以使用以下提示词让它输出可沉淀的结构化信息：

```
请将本次逆向分析的经验总结为结构化的技术案例，按以下格式输出。注意：不要包含具体域名、URL、真实密钥等敏感信息，用抽象描述代替。

---

## 案例名称
（用技术特征命名，如"OB混淆+AES-CBC+动态密钥"、"JSVMP+Cookie生成"）

## 反爬类型判定
（签名型 / 行为型 / 纯混淆，附判定依据）

## 技术指纹
（列出可用于自动检测的稳定特征，每条写成可搜索的模式）
- JS特征: （如"_0x前缀变量大量出现"、"单文件200KB+"、"存在while-switch解释器循环"）
- 参数特征: （如"sign参数，32位hex，疑似MD5"、"token参数，Base64格式"）
- 请求特征: （如"存在/api/init预热请求"、"Cookie中有动态字段__ac_xxx"）
- 反调试特征: （如"debugger定时器"、"console.log检测"）
- 混淆类型: （如"OB混淆v2"、"JSVMP"、"webpack打包+变量混淆"）

## 加密方案
- 算法: （如AES-CBC、MD5、HMAC-SHA256、RSA等）
- 密钥来源: （硬编码/接口下发/动态计算/从页面DOM提取）
- 加密流程: （明文如何组装 → 如何加密 → 如何拼接到请求中）
- 签名公式: （如 sign = MD5(path + timestamp + nonce + secret).toLowerCase()）

## 定位路径
（还原过程中最高效的定位方法，按执行顺序）
1. 第一步做了什么，搜索了什么关键词
2. 第二步怎么找到的关键函数
3. 第三步怎么确认的算法

## 还原代码
（脱敏后的核心还原函数，可直接复用）

## 踩坑记录
（遇到的坑和解决方法，每条一个）

## 变体说明
（同类站点的已知变体差异）

## 关键经验总结
（本次分析中最有价值的 2-3 条经验）

---
```

将输出内容发给本 Skill 的使用者，即可按 `_template.md` 格式沉淀到本目录。
