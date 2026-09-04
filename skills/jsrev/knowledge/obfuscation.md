# 混淆识别与还原指南（8 类 + babel AST 模板）

> lineage：蒸馏自 hello_js_reverse_skill/references/obfuscation-guide.md（8 类混淆识别 + babel 反混淆模板），
> 并以 trace/references/ast-deobfuscation.md（适用边界 / 输出布局 / 失败模式）作导读；旧工具名已按 references/tool-matrix.md 迁移表清零。

## 0. 适用边界（导读）

AST 反混淆用于**定点还原**，不用于探索。函数位置、脚本 URL、请求边界还不知道时，先回浏览器观测（取证 → 定位），再回来做 AST。

**适用场景**：字符串数组与 decoder 调用还原、对象 dispatcher 简化、控制流简化、死代码与 self-defense 清理、可读中间产物。

**标准输出布局**（统一落在证据工作区 `tasks/<task-id>/`）：

```text
source/original/target.js
source/deobfuscated/target_deobf.js
intermediate/target_step1.js
intermediate/target_step2.js
analysis/ast_report.md
```

**过程纪律**：先保存原始文件；解析前检查编码、BOM、不可见字符与语法错误；一次只跑一个可逆 pass；每个 pass 后重新生成代码并 reparse；保留全部中间文件；需要运行时状态时停在可读或插桩输出，不要激进内联。

**验证**：代码变可读 ≠ 还原正确。用语法解析、残留计数、已知固定向量或（安全前提下的）窄运行时 fixture 验证。

**失败模式表**：

| 触发 | 动作 | 回退 |
|---|---|---|
| 解析失败 | 保存 step0，清洗编码 | 产出字符级报告 |
| 混淆家族未知 | 只跑低风险通用 pass | 带残留说明停止 |
| pass 破坏语法 | 回退到上一步 | 禁用该 pass |
| 需要运行时状态 | 停在可读/插桩输出 | 回到观测或补环境 |

## 1. 八类混淆速查与还原

### 1.1 OB 混淆（obfuscator.io）

**识别特征**：大量 `_0x` 前缀变量名（如 `_0x4a3b2c`）；顶部十六进制字符串数组（`var _0xabc = ['...', ...]`）；字符串数组旋转函数；十六进制属性访问（`obj['_0x1234']` 替代 `obj.method`）。

**还原步骤**：

1. 定位字符串数组和旋转函数
2. 执行旋转函数得到最终字符串数组
3. 全局替换十六进制索引为实际字符串
4. 简化数学表达式和逻辑运算
5. 变量重命名提高可读性

**引擎辅助**：

```text
[firefox] search_code(keyword="_0x")   → 定位混淆入口
[firefox] evaluate_js                  → 在浏览器中执行字符串数组还原，验证解码结果
[chrome]  get_script_source            → 拉全量源码落盘，本地做 AST 处理
```

### 1.2 控制流平坦化（CFF）

**识别特征**：

```javascript
var state = initialState;
while (true) {
    switch (state) {
        case 'A': /* ... */ state = 'C'; break;
        case 'B': /* ... */ state = 'D'; break;
        case 'C': /* ... */ state = 'B'; break;
        // ...
    }
}
```

**还原步骤**：找到初始状态值 → 按状态转移顺序排列代码块 → 去掉 switch-case 包装还原为顺序代码 → 简化多余的变量赋值。

**引擎辅助**：

```text
[chrome]  set_breakpoint_on_text + step / get_paused_info → 真断点逐步读 state 转移
[firefox] hook_function(状态机函数, 记录参数与返回值)      → 追踪状态转移
[firefox] instrumentation(action="install")               → 源码级 tap，记录每次 state 写入
```

### 1.3 eval / Function 打包

**识别特征**：

```javascript
eval(function(p,a,c,k,e,d){...}('encoded_string',...))
// 或
new Function('return ' + decryptedCode)()
```

**还原步骤**：hook `eval` 与 `Function` 构造器拦截实际执行的代码（或把 `eval()` 替换为 `console.log()` 查看解密后代码）；可能多层嵌套，逐层解包。

**引擎辅助**（顺序不可反：先装 hook，再导航）：

```text
[firefox] hook_function / inject_hook_preset → 拦截实际执行的代码
[firefox] get_console_logs / [chrome] list_console_messages → 读取解包后的代码
```

### 1.4 AAEncode / JJEncode / JSFuck（直接执行类）

| 类型 | 识别特征 | 还原 |
|---|---|---|
| AAEncode | 全是日文颜文字字符 | 浏览器 console 直接执行，或去掉最外层执行函数改为输出 |
| JJEncode | 全是 `$` 和特殊字符 | 同 AAEncode：直接执行或替换执行为输出 |
| JSFuck | 仅使用 `[]()!+` 六种字符 | 直接在浏览器执行 |

```javascript
// AAEncode
ﾟωﾟﾉ= /｀ｍ´）ﾉ ~┻━┻   //*´∇｀*/ ['_'];
// JJEncode
$=~[];$={___:++$,$$$$:(![]+"")[$],...
// JSFuck
[][(![]+[])[+[]]+(![]+[])[!+[]+!+[]]+(![]+[])[+!+[]]+(!![]+[])[+[]]]...
```

### 1.5 自定义 VM / 字节码解释器

**识别特征**：超大数组作为"字节码"；解释器循环含 `switch` 或函数查找表；通常在 IIFE 中；无法通过简单字符串替换还原。

**还原策略**：

1. **不要尝试反编译字节码**
2. 找到解释器的输入和输出接口
3. 通过 hook 解释器的关键操作（函数调用、赋值、返回）来理解行为
4. 直接在 Node.js 中运行字节码解释器

**引擎辅助**：

```text
[firefox] hook_function(解释器核心函数)             → 捕获每步操作的输入输出
[chrome]  set_breakpoint_on_text + get_paused_info → 真断点捕获关键调用
```

### 1.6 JSVMP（JS 虚拟机保护）

**识别特征**：超大 JS 文件（200KB+）；包含自定义解释器和操作码表；函数名和变量名完全无意义；改写浏览器原生 API。

**还原策略**：

1. **不要反编译，通过 I/O 定位**
2. hook 所有出口（XHR、Cookie、fetch）
3. 追踪加密函数的输入和输出
4. 用已知 I/O 反推算法

**引擎辅助**：

```text
[firefox] inject_hook_preset(preset="xhr"/"fetch"/"crypto") → 出口 hook（必须导航前安装）
[chrome/firefox] get_request_initiator                      → 请求的 JS 调用栈（黄金路径）
```

> 签名型目标注意：禁 Proxy 式运行时 hook，只用源码级插桩或透明探针——见 [invariants.md](invariants.md)；JSVMP 深度打法另见 verticals/jsvmp 文档。

## 2. 通用反混淆 Node.js 模板（babel AST）

```javascript
const parser = require('@babel/parser');
const traverse = require('@babel/traverse').default;
const generate = require('@babel/generator').default;
const t = require('@babel/types');

function deobfuscate(code) {
    const ast = parser.parse(code);

    traverse(ast, {
        // 还原十六进制字符串
        StringLiteral(path) {
            if (/^\\x/.test(path.node.extra?.raw || '')) {
                path.node.extra = undefined;
            }
        },
        // 还原计算属性为点号访问
        MemberExpression(path) {
            if (t.isStringLiteral(path.node.property) && /^[a-zA-Z_$]/.test(path.node.property.value)) {
                path.node.computed = false;
                path.node.property = t.identifier(path.node.property.value);
            }
        },
        // 折叠常量表达式
        BinaryExpression(path) {
            if (t.isNumericLiteral(path.node.left) && t.isNumericLiteral(path.node.right)) {
                const result = eval(`${path.node.left.value} ${path.node.operator} ${path.node.right.value}`);
                if (typeof result === 'number' && isFinite(result)) {
                    path.replaceWith(t.numericLiteral(result));
                }
            }
        }
    });

    return generate(ast, { comments: false }).code;
}
```

> 模板只覆盖三类低风险 pass；按 §0 纪律逐 pass 推进，每加一个 pass 都要 reparse 验证并保留中间产物。

## 3. 混淆代码分析工作流（引擎路由版）

```text
1. 源码枚举/搜索：[chrome] search_in_sources / [firefox] search_code → 定位入口函数
2. 源码落盘：  [chrome] get_script_source / [firefox] instrumentation 源码读写
              → 存 tasks/<task-id>/source/original/
3. 断点/hook： [chrome] set_breakpoint_on_text（真断点）
              [firefox] hook_function 或 instrumentation(action="install")（源码级插桩）
4. 观察：     [chrome] get_paused_info / list_console_messages
              [firefox] instrumentation(action="log") / get_console_logs
5. 浏览器内还原实验：[firefox] evaluate_js（跑字符串数组还原等一次性验证）
6. 调用链追溯：[chrome/firefox] get_request_initiator → 直达签名/加密函数
```

每一步观察结果写进 runtime evidence（SKILL.md §7 证据工作区契约）；AST 产物按 §0 输出布局落盘并附验证说明。
