# 验证码协议路由（CAPTCHA Routing）

> lineage: 源自 trace/references/captcha-routing.md，2026-08-30 平移至 jsrev skill verticals/captcha/；profile 与脚本相对路径已按新布局修正。
>
> **敏感常量声明**：本目录文档与脚本含真实站点常量（如数美 organization、DES 密钥对、GT4 bundle 动态字段等），仅限自用；公开前需三级裁决。
>
> **适用前提**：目标为已授权的验证码协议链分析，不是普通 OCR，也不是通用 API 签名。交付目标是本地协议重放脚本：同一轮 challenge、图片、token、遥测、动态参数齐全，并有最终服务端 verify/check 通过证据。

## 依赖总表（未随包提供 requirements，需自行安装）

| 依赖 | 适用范围 |
|---|---|
| `requests` | 多数脚本 |
| `ddddocr` | 多数脚本（滑块缺口/点选识别） |
| `Pillow` | 多数脚本（图片处理） |
| `pycryptodome` | 多数脚本（AES/RSA/PoW） |
| `opencv-python` + `scipy` | 仅 `scripts/gt4_word_pure.py` |
| `Node.js`（外部） | 仅 `gt4_replay.py` / `gt4_winlinze_replay.py` 两个 helper 型脚本（依赖不在包内的 `gt4_bundle_helper.js` / `gt4_winlinze_helper.js`，开箱不可运行） |

GT4 纯 Python 路径（`gt4_pure_replay` / `gt4_ai_pure` / `gt4_word_pure`）不需要 Node。

## 支持家族（11 个）

| 家族 | 信号 | 参考 profile |
|---|---|---|
| GT3 滑块 | `register-slide`, `gettype.php`, `fullpage`, `slide`, `get.php`, `ajax.php`, `bg/fullbg/slice`, `validate/seccode` | [geetest-gt3-workflow.md](geetest-gt3-workflow.md) |
| GT4 | `captcha_id`, `lot_number`, `pow_detail`, `payload`, `process_token`, `/load`, `/verify`, `w`, `pow_msg`, `pow_sign` | [geetest-gt4-workflow.md](geetest-gt4-workflow.md) |
| 腾讯 TDC / EdgeOne | `cap_union_prehandle`, 动态 `tdc.js`, `TDC.getData(true)`, `collect`, `eks`, `cap_union_new_verify` | [tencent-edgeone-tdc-workflow.md](tencent-edgeone-tdc-workflow.md) |
| 网易易盾 | `NECaptcha`, `c.dun.163.com/api/v3/get`, `/api/v3/check`, `cb`, `data`, `token`, front/bg 图片 | [yidun-workflow.md](yidun-workflow.md) |
| 数美 | `captcha1.fengkongcloud.cn`, `/ca/v1/register`, `/ca/v2/fverify`, `captchaUuid`, `rid`, `fg/bg` | [shumei-workflow.md](shumei-workflow.md) |
| 云片 | `captcha.yunpian.com`, `/v1/jsonp/captcha/get`, `/captcha/verify`, `captchaId`, `ypjsonp`, 距离与点选坐标 | [yunpian-workflow.md](yunpian-workflow.md) |
| 360 天御 | `captcha.jiagu.360.cn`, `/api/v3/auth`, `/api/v3/check`, `360CaptchaSDK`, `captchaId`, `tracking` | [tianyu360-workflow.md](tianyu360-workflow.md) |
| 顶象/DX 滑块 | `captcha.vivo.com.cn`, `/api/a`, `/api/p1`, `/api/p2`, `dingxiang-sdk.js`, `greenseer.js`, `_dx_app_*`, `_dx_captcha_vid` | 本文件；按通用滑块纪律采集新鲜证据 |
| CSDN 文字点选 | `embedded_captcha`, `click_v2`, 提示文字, 点击坐标, 最终 verify | [csdn-point-click-workflow.md](csdn-point-click-workflow.md) |
| 携程 captcha v4 | `captcha/v4`, `risk_inspect`, `verify_jigsaw`, `verify_icon`, 加密 verify 载荷 | [ctrip-captcha-v4-workflow.md](ctrip-captcha-v4-workflow.md) |
| 百度 Passport 旋转 V2 | `passport.baidu.com/cap/init`, `/cap/style`, `/cap/img`, `/cap/log`, `spin-0`, `backstr`, `ext.p`, `en_conf` | [baidu-passport-spin-v2-workflow.md](baidu-passport-spin-v2-workflow.md) |

## 同轮状态纪律（Required State Discipline）

1. `get/load/prehandle/convert` 的输出、图片、Cookie、challenge 头、随机密钥、遥测与最终 `verify/check` 必须保持在同一会话轮次内。
2. 动态值必须从当前轮生成：callback、POW、加密载荷、轨迹、耗时、token、包装字段。
3. 浏览器自动化只是取证手段；最终交付是协议重放 + 本地 helper 代码。
4. 不以图像识别结果、token 长度、本地 `w` 形态或"看起来成功"的 HTTP 状态判定成功。
5. JSONP 必须先解析再读取状态字段。

## 图片与轨迹默认值（Image And Track Defaults）

1. 滑块任务必须区分：原图距离、页面渲染距离、提交距离、行为轨迹、耗时——五者不可混用。
2. 点选任务必须区分：提示识别、背景目标定位、坐标系映射、verify 参数生成。
3. GT4 `nine` 答案是 0 基小格索引，转 1 基 `[row,col]` 提交。
4. GT4 `icon` 答案是有序背景中心点，映射为 `round(ratio * 10000)` 整数坐标。
5. OCR 或外部识别可以作为子步骤，但最终证明是服务端 verify/check 响应。

## 可选脚本（Optional Scripts）

GT4 辅助脚本位于本目录 `scripts/`（即 `verticals/captcha/scripts/`，共 6 个 `.py`）。把它们当作示例与回归辅助，不是开箱即用的通用绕过；复用前必须重新核对当前 bundle、公钥、字段布局、图片类型和服务端响应。

**降级说明**：`gt4_replay.py` 与 `gt4_winlinze_replay.py` 依赖外部 Node helper（`gt4_bundle_helper.js` / `gt4_winlinze_helper.js` **不在包内**），需外部 helper + Node.js，**开箱不可运行**；纯 Python 路径用 `gt4_pure_replay.py` / `gt4_ai_pure.py` / `gt4_word_pure.py`（`gt4_word_run.py` 为多轮验收包装）。

## 未收录的公开 profile

部分厂商保留的验证码 profile 有意不在本包内。若观察到的目标只匹配未收录的 profile，用 jsrev 引擎采集通用证据，并在报告中注明该专项工作流未包含。
