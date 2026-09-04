# crypto — 常见加密模式识别与还原（Node.js / Python 双语言）

> 蒸馏自 `hello_js_reverse_skill/references/crypto-patterns.md`（双语言实现）与 `trace/references/crypto-patterns.md`（固定输入循环 / 5 阶 diff / JS→Python 陷阱），jsrev 融合版 2026-08-30。
> 适用时机：签名、token、加密 body 或 helper 输出"看着是标准算法、但固定输入 parity 不过"时——先走 §0 总纲，再按 §1 识别、§2-§11 对照实现。仅限授权目标，用户须自行确保已获授权。

## 0. 总纲：固定输入循环与失败模式

签名还原的失败大多不是算法错，而是序列化错。动手写实现之前先走这个循环：

1. 冻结一个极小输入 + 一个线上真实捕获的输入。
2. 精确冻结序列化：method、URL 编码、query 顺序、body 字节、content-type、header 大小写（涉及时）。
3. 在最终 digest/密文**之前**先对比中间字符串。
4. 在任务证据工作区保留确定性 parity 向量（`tasks/<id>/fixtures/`，至少 2 组含边界值）。
5. 以上全过之后，才恢复时间源与随机源。

### 修改版摘要算法的 5 阶 diff

`md5`、`sha1`、`sha256`、`sm3`、`hmac` 这些名字只是标签，不是证明。固定输入对不上时按此顺序 diff：

1. 初始 IV 或密钥派生。
2. 字符串→字节、字节→字的打包方式。
3. 轮常量与压缩掩码。
4. 逐字节掩码与截断点。
5. padding 与最终编码。

### JS → Python 陷阱

1. `>>> 0` 通常意味着在同一操作边界之后补 `& 0xffffffff`。
2. 循环左移必须处理 `n == 0` 并归一化位宽。
3. 紧凑 JSON 与 URL 编码必须与浏览器字节一致，不能用 Python 默认序列化。
4. 有符号/无符号转换只在部分用例上表现不同——至少保留一个硬向量覆盖它。

### 常见失败模式清单

1. 标准摘要算法被用在了自定义 packer 上。
2. 哈希算法正确，但喂错了序列化。
3. 时间戳精度：本地毫秒、线上秒。
4. 哈希前的 URL 编码不一致。
5. 服务端下发的 seed 过期或来自另一会话。
6. key/IV 在使用前被 slice、trim、装饰或派生。
7. 浏览器与本地运行时走了不同分支。
8. 正确的密文被放进了错误的字段或包装层。

固定输入自检通过、且真实请求接受再生成的产物之前，不得宣布 crypto 完成。

## 1. 快速识别表

| 特征 | 可能的算法 | 验证方法 |
|------|-----------|---------|
| 32位十六进制 | MD5 | 用已知输入验证 |
| 40位十六进制 | SHA-1 | 同上 |
| 64位十六进制 | SHA-256 | 同上 |
| 128位十六进制 | SHA-512 | 同上 |
| `=` 结尾，含 `A-Za-z0-9+/` | Base64 | 直接 atob 解码 |
| `=` 结尾，含 `A-Za-z0-9-_` | Base64url | 替换 `-_` 为 `+/` 后解码 |
| 固定长度密文，16字节倍数 | AES (128-bit key) | 寻找 key/iv |
| 固定长度密文，8字节倍数 | DES / 3DES | 寻找 8字节 key |
| 超长数字字符串 | RSA | 寻找公钥 |
| `CryptoJS` 关键词 | CryptoJS 库 | 直接搜索源码 |

指纹维度（配合识别表一起看）：

1. 长度：32/40/64/128 位 hex、块大小二进制、自定义分段布局。
2. 字符表：hex、Base64、URL-safe Base64、纯数字、自定义字母表、带框二进制。
3. padding 与分隔符：`=`、点、下划线、连字符、固定前缀、版本字节、校验和后缀。
4. 输入构成：method、path、query 顺序、紧凑 JSON、body 字节、时间戳精度、nonce、服务端 seed、cookie 槽位、会话状态。
5. 运行时分支：浏览器分支、Node fallback、伪 native 检测、descriptor 读取、timer 分支、随机源。

## 2. MD5

### 标准 MD5

```javascript
// Node.js
const crypto = require('crypto');
function md5(str) {
    return crypto.createHash('md5').update(str).digest('hex');
}
```

```python
# Python
import hashlib

def md5(text: str) -> str:
    return hashlib.md5(text.encode('utf-8')).hexdigest()
```

### 自定义 MD5（非标准实现）

某些网站修改了 MD5 的内部参数（如 chrsz=16），导致输出与标准 MD5 不同。

**识别方法**：用相同输入对比标准 MD5 输出，如果不一致则为自定义实现。

**还原策略**：必须提取原始 JS 实现，在 Node.js 中直接执行。

### 常见 MD5 签名模式

```javascript
// 模式1：简单拼接
sign = md5(param1 + param2 + timestamp + secret)

// 模式2：排序拼接
params = Object.keys(data).sort().map(k => k + '=' + data[k]).join('&')
sign = md5(params + secret)

// 模式3：嵌套哈希
sign = md5(md5(password) + timestamp)
```

## 3. HMAC

```javascript
// Node.js
const crypto = require('crypto');
function hmacSha256(message, secret) {
    return crypto.createHmac('sha256', secret).update(message).digest('hex');
}
```

```python
# Python
import hmac
import hashlib

def hmac_sha256(message: str, secret: str) -> str:
    return hmac.new(secret.encode('utf-8'), message.encode('utf-8'), hashlib.sha256).hexdigest()
```

**识别特征**：搜索 `HMAC`、`createHmac`、`CryptoJS.HmacSHA256`

## 4. AES

### AES-CBC

```javascript
// Node.js
const crypto = require('crypto');

function aesEncrypt(plaintext, key, iv) {
    const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
    cipher.setAutoPadding(true); // PKCS7
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

function aesDecrypt(ciphertext, key, iv) {
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(true);
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

```python
# Python
import base64
from Crypto.Cipher import AES
from Crypto.Util.Padding import pad, unpad

def aes_cbc_encrypt(plaintext: str, key: str, iv: str) -> str:
    cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, iv.encode('utf-8'))
    padded = pad(plaintext.encode('utf-8'), AES.block_size)
    return base64.b64encode(cipher.encrypt(padded)).decode('utf-8')

def aes_cbc_decrypt(ciphertext_b64: str, key: str, iv: str) -> str:
    cipher = AES.new(key.encode('utf-8'), AES.MODE_CBC, iv.encode('utf-8'))
    decrypted = cipher.decrypt(base64.b64decode(ciphertext_b64))
    return unpad(decrypted, AES.block_size).decode('utf-8')
```

### AES-ECB

```javascript
// Node.js
function aesEcbEncrypt(plaintext, key) {
    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}
```

```python
# Python
def aes_ecb_encrypt(plaintext: str, key: str) -> str:
    cipher = AES.new(key.encode('utf-8'), AES.MODE_ECB)
    padded = pad(plaintext.encode('utf-8'), AES.block_size)
    return base64.b64encode(cipher.encrypt(padded)).decode('utf-8')
```

### CryptoJS 兼容

```javascript
const CryptoJS = require('crypto-js');

// CryptoJS 默认使用 PKCS7 填充
const encrypted = CryptoJS.AES.encrypt(plaintext, CryptoJS.enc.Utf8.parse(key), {
    iv: CryptoJS.enc.Utf8.parse(iv),
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7
}).toString();
```

**关键参数识别**：
- key 长度：16字节=AES-128，24字节=AES-192，32字节=AES-256
- iv 长度：固定16字节
- 模式：CBC（需要iv）、ECB（不需要iv）、CTR、GCM
- 填充：PKCS7（最常见）、ZeroPadding、NoPadding
- 输出格式：Base64（最常见）、Hex

AES 类输出还要确认：字节序、输入是原始字节还是编码文本——正确的加密步骤配上错误的 hex/Base64/URL 编码，仍然是协议失败。

## 5. DES / 3DES

```javascript
// Node.js
function desEncrypt(plaintext, key) {
    const cipher = crypto.createCipheriv('des-ecb', key, null); // 8字节key
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}

function tripleDesEncrypt(plaintext, key, iv) {
    const cipher = crypto.createCipheriv('des-ede3-cbc', key, iv); // 24字节key
    cipher.setAutoPadding(true);
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    return encrypted;
}
```

```python
# Python
from Crypto.Cipher import DES, DES3
from Crypto.Util.Padding import pad

def des_ecb_encrypt(plaintext: str, key: str) -> str:
    cipher = DES.new(key.encode('utf-8'), DES.MODE_ECB)
    padded = pad(plaintext.encode('utf-8'), DES.block_size)
    return base64.b64encode(cipher.encrypt(padded)).decode('utf-8')

def triple_des_cbc_encrypt(plaintext: str, key: str, iv: str) -> str:
    cipher = DES3.new(key.encode('utf-8'), DES3.MODE_CBC, iv.encode('utf-8'))
    padded = pad(plaintext.encode('utf-8'), DES3.block_size)
    return base64.b64encode(cipher.encrypt(padded)).decode('utf-8')
```

## 6. RSA

```javascript
// Node.js
const crypto = require('crypto');

function rsaEncrypt(plaintext, publicKey) {
    const buffer = Buffer.from(plaintext, 'utf8');
    const encrypted = crypto.publicEncrypt({
        key: publicKey,
        padding: crypto.constants.RSA_PKCS1_PADDING
    }, buffer);
    return encrypted.toString('base64');
}
```

**使用 node-forge（更灵活）**：

```javascript
const forge = require('node-forge');

function rsaEncrypt(plaintext, publicKeyPem) {
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const encrypted = publicKey.encrypt(plaintext, 'RSAES-PKCS1-V1_5');
    return forge.util.encode64(encrypted);
}
```

```python
# Python
from Crypto.PublicKey import RSA
from Crypto.Cipher import PKCS1_v1_5

def rsa_encrypt(plaintext: str, public_key_pem: str) -> str:
    key = RSA.import_key(public_key_pem)
    cipher = PKCS1_v1_5.new(key)
    encrypted = cipher.encrypt(plaintext.encode('utf-8'))
    return base64.b64encode(encrypted).decode('utf-8')

# OAEP 模式
from Crypto.Cipher import PKCS1_OAEP

def rsa_encrypt_oaep(plaintext: str, public_key_pem: str) -> str:
    key = RSA.import_key(public_key_pem)
    cipher = PKCS1_OAEP.new(key)
    encrypted = cipher.encrypt(plaintext.encode('utf-8'))
    return base64.b64encode(encrypted).decode('utf-8')
```

**常见 RSA 公钥格式**：
- PEM 格式（`-----BEGIN PUBLIC KEY-----`）
- 模数(n) + 指数(e) 格式（需要手动构造 PEM）

RSA 类输出必须确认：当前模数/指数来源（是否服务端轮换）、padding 方案、密文长度、最终编码。

## 7. Base64 变体

```javascript
// Node.js
const encoded = Buffer.from(str).toString('base64');
const decoded = Buffer.from(encoded, 'base64').toString();

// Base64url（URL安全变体）
function base64url(str) {
    return Buffer.from(str).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

// 自定义字符表 Base64
function customBase64(str, table) {
    const std = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    const b64 = Buffer.from(str).toString('base64');
    return b64.split('').map(c => {
        const idx = std.indexOf(c);
        return idx >= 0 ? table[idx] : c;
    }).join('');
}
```

```python
# Python
import base64

encoded = base64.b64encode(text.encode('utf-8')).decode('utf-8')
decoded = base64.b64decode(encoded).decode('utf-8')

# Base64url（URL安全变体）
encoded_url = base64.urlsafe_b64encode(text.encode('utf-8')).decode('utf-8').rstrip('=')

# 自定义字符表 Base64
def custom_base64(text: str, table: str) -> str:
    std = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
    b64 = base64.b64encode(text.encode('utf-8')).decode('utf-8')
    trans = str.maketrans(std, table)
    return b64.translate(trans)
```

## 8. 异或加密（XOR）

```javascript
// Node.js
function xorEncrypt(plaintext, key) {
    const result = [];
    for (let i = 0; i < plaintext.length; i++) {
        result.push(plaintext.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return Buffer.from(result).toString('hex');
}
```

```python
# Python
def xor_encrypt(plaintext: str, key: str) -> str:
    result = bytes([
        ord(plaintext[i]) ^ ord(key[i % len(key)])
        for i in range(len(plaintext))
    ])
    return result.hex()
```

## 9. RC4

```javascript
// Node.js
function rc4(data, key) {
    const s = Array.from({ length: 256 }, (_, i) => i);
    let j = 0;
    for (let i = 0; i < 256; i++) {
        j = (j + s[i] + key.charCodeAt(i % key.length)) % 256;
        [s[i], s[j]] = [s[j], s[i]];
    }
    let i = 0; j = 0;
    const result = [];
    for (let k = 0; k < data.length; k++) {
        i = (i + 1) % 256;
        j = (j + s[i]) % 256;
        [s[i], s[j]] = [s[j], s[i]];
        result.push(data.charCodeAt(k) ^ s[(s[i] + s[j]) % 256]);
    }
    return Buffer.from(result);
}
```

```python
# Python（使用 pycryptodome）
from Crypto.Cipher import ARC4

def rc4_encrypt(data: str, key: str) -> bytes:
    cipher = ARC4.new(key.encode('utf-8'))
    return cipher.encrypt(data.encode('utf-8'))

# 或手动实现（与 JS 版本逻辑一致）
def rc4_manual(data: str, key: str) -> bytes:
    s = list(range(256))
    j = 0
    for i in range(256):
        j = (j + s[i] + ord(key[i % len(key)])) % 256
        s[i], s[j] = s[j], s[i]
    i = j = 0
    result = []
    for char in data:
        i = (i + 1) % 256
        j = (j + s[i]) % 256
        s[i], s[j] = s[j], s[i]
        result.append(ord(char) ^ s[(s[i] + s[j]) % 256])
    return bytes(result)
```

## 10. 时间戳处理

```javascript
// Node.js
const tsMs = Date.now();                      // 毫秒级（13位）
const tsSec = Math.floor(Date.now() / 1000);  // 秒级（10位）
```

```python
# Python
import time

ts_ms = int(time.time() * 1000)  # 毫秒级（13位）
ts_sec = int(time.time())        # 秒级（10位）
```

**注意**：某些网站使用服务端时间戳，需要从响应头或接口获取。时间戳精度不一致是 §0 失败模式清单的第 3 条——本地毫秒、线上秒，parity 永远对不上。

## 11. 参数签名常见拼接模式

```javascript
// Node.js
// 模式1：固定格式
sign = md5(`page=${page}&t=${timestamp}&key=${secret}`)

// 模式2：所有参数排序拼接
const params = { page: 1, size: 10, t: Date.now() };
const str = Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&');
sign = md5(str + secret)

// 模式3：JSON 字符串
sign = md5(JSON.stringify(data) + secret)

// 模式4：管道分隔
sign = md5(`${page}|${timestamp}|${secret}`)
```

```python
# Python
import hashlib, json, time

def md5(text: str) -> str:
    return hashlib.md5(text.encode('utf-8')).hexdigest()

# 模式1：固定格式
sign = md5(f"page={page}&t={timestamp}&key={secret}")

# 模式2：所有参数排序拼接
params = {"page": 1, "size": 10, "t": int(time.time())}
param_str = "&".join(f"{k}={params[k]}" for k in sorted(params))
sign = md5(param_str + secret)

# 模式3：JSON 字符串（注意 separators 控制格式）
sign = md5(json.dumps(data, separators=(',', ':'), sort_keys=True) + secret)

# 模式4：管道分隔
sign = md5(f"{page}|{timestamp}|{secret}")
```

Python 侧特别注意 `json.dumps` 的 `separators` 与 `sort_keys`：默认序列化带空格、不排序，和浏览器里 `JSON.stringify` 的紧凑输出不一致——这正是 §0 陷阱 3 的最常见触发点。

## 12. CLI 工具

动手识别前可先用 jsrev cli 做密文指纹预判：

- `jsrev crypto identify "<样本>"`（或 `--file=captured_params.json`）：按长度/字符表/填充特征输出候选算法与验证建议（实现见 `cli/vendor/crypto-identifier.js`，零依赖）。
- `jsrev proof crypto_fingerprint "<样本>"`：输出最小 hints（hex/base64 字符表、md5/sha1/sha256-like 长度、块状密文长度等），适合固定向量开工前的快速 sanity check（实现见 `skills/jsrev/scripts/crypto_fingerprint.py`）。

识别结果只是候选，最终以 §0 固定输入循环的 parity 为准。
