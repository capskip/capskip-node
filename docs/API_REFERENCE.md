# CapSkip API Reference

Complete reference aligned with the [official CapSkip API](https://capskip.com/api-docs/).

CapSkip exposes a standard captcha-solver HTTP API on your local machine:

```
POST http://<host>:<port>/in.php   → submit captcha
GET  http://<host>:<port>/res.php  → poll result
```

The SDK only supports the four captcha types documented by CapSkip. Every solve
method returns a `Promise`.

---

## Supported captcha types

| Type | SDK method | `method` (POST) |
|---|---|---|
| Image captcha | `normal()` | `post` or `base64` |
| reCAPTCHA v2 | `recaptcha(sitekey, url)` | `userrecaptcha` |
| reCAPTCHA v3 | `recaptcha(sitekey, url, { version: 'v3' })` | `userrecaptcha` + `version=v3` |
| Cloudflare Turnstile | `turnstile()` | `turnstile` |

**Proxy** is supported for reCAPTCHA and Turnstile only — not for image captcha.

---

## CapSkip

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: 'capskip',
  host: '127.0.0.1',
  port: 8080,
  defaultTimeout: 120,
  recaptchaTimeout: 300,
  pollingInterval: 5,       // max seconds between polls; starts at 0.25s and backs off to this
});
```

`AsyncCapSkip` is exported as an alias of `CapSkip`.

---

## 1. Image captcha — `normal(file, { json })`

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `post` (multipart file) or `base64` |
| `file` | file | Yes* | Image file when `method=post` |
| `body` | string | Yes* | Base64 image when `method=base64` |
| `json` | int | No | `0` plain text (default), `1` JSON |

### GET `/res.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `action` | string | Yes | `get` |
| `id` | int | Yes | Captcha ID from `in.php` |
| `json` | int | No | `0` plain text (default), `1` JSON |

### SDK usage

```js
await solver.normal('captcha.png');
await solver.normal('https://example.com/captcha.jpg');
const result = await solver.normal('data:image/png;base64,iVBORw0KGgo...', { json: 1 });
console.log(result.code);
```

Only `json` is accepted as an extra parameter. Proxy is **not** supported.

---

## 2. reCAPTCHA v2 — `recaptcha(sitekey, url, { ... })`

### POST `/in.php`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `key` | string | Yes | — | CapSkip API key |
| `method` | string | Yes | — | `userrecaptcha` |
| `googlekey` | string | Yes | — | Site key (`data-sitekey` / `k`) |
| `pageurl` | string | Yes | — | Full page URL |
| `enterprise` | int | No | `0` | `1` = Enterprise v2 |
| `invisible` | int | No | `0` | `1` = Invisible reCAPTCHA |
| `data-s` | string | No | — | Google Search / services `data-s` value |
| `json` | int | No | `0` | `1` = JSON response |
| `proxy` | string | No | — | `IP:PORT` or `login:pass@IP:PORT` |
| `proxytype` | string | No | `HTTP` | `HTTP`, `HTTPS`, `SOCKS5`, `SOCKS5H` |

Do **not** send `version`, `action`, or `min_score` for v2.

### GET `/res.php`

Same as image captcha poll parameters.

### SDK usage

```js
// Standard v2
await solver.recaptcha('...', 'https://example.com');

// Invisible v2
await solver.recaptcha('...', '...', { invisible: 1 });

// Enterprise v2
await solver.recaptcha('...', '...', { enterprise: 1 });

// Enterprise v2 with data-s (SDK alias: datas)
await solver.recaptcha('...', '...', { enterprise: 1, datas: '...' });

// With proxy
await solver.recaptcha('...', '...', {
  proxy: { type: 'HTTPS', uri: 'user:pass@1.2.3.4:3128' },
});
```

---

## 3. reCAPTCHA v3 — `recaptcha(sitekey, url, { version: 'v3', ... })`

### POST `/in.php`

| Parameter | Type | Required | Default | Description |
|---|---|---|---|---|
| `key` | string | Yes | — | CapSkip API key |
| `method` | string | Yes | — | `userrecaptcha` |
| `version` | string | Yes | — | `v3` |
| `googlekey` | string | Yes | — | Site key |
| `pageurl` | string | Yes | — | Full page URL |
| `enterprise` | int | No | `0` | `1` = Enterprise v3 |
| `action` | string | No | `verify` | Action from `grecaptcha.execute()` |
| `min_score` | float | No | `0.4` | Minimum acceptable score |
| `json` | int | No | `0` | `1` = JSON response |
| `proxy` | string | No | — | Proxy address |
| `proxytype` | string | No | `HTTP` | Proxy type |

Do **not** send `invisible` for v3.

### SDK usage

```js
await solver.recaptcha('...', 'https://example.com', {
  version: 'v3',
  action: 'submit',
  min_score: 0.7,          // or SDK alias: score: 0.7
  enterprise: 0,
});
```

---

## 4. Cloudflare Turnstile — `turnstile(sitekey, url, { ... })`

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `turnstile` |
| `sitekey` | string | Yes | Turnstile sitekey |
| `pageurl` | string | Yes | Full page URL |
| `action` | string | No | From `data-action` or `turnstile.render()` |
| `data` | string | No | `cData` / `data-cdata` |
| `pagedata` | string | No | `chlPageData` (challenge pages) |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address |
| `proxytype` | string | No | Proxy type |

### GET `/res.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `action` | string | Yes | `get` |
| `id` | int | Yes | Captcha ID |
| `json` | int | **Yes** | Must be `1` to receive User-Agent |

The SDK **automatically** polls Turnstile results with `json=1` and includes `userAgent` in the result when CapSkip returns it.

### SDK usage

```js
// Standalone widget
const result = await solver.turnstile('0x4AAAAAAA...', 'https://example.com');
console.log(result.code);
console.log(result.userAgent); // present when CapSkip returns it

// Challenge page
const challenge = await solver.turnstile('0x4AAAAAAA...', 'https://example.com', {
  action: 'managed',
  data: 'cData_value',
  pagedata: 'chlPageData_value',
});
// Use challenge.userAgent when submitting the token
```

---

## Return value

Every solve method resolves to:

```js
{
  captchaId: '12345',
  code: 'TOKEN_OR_TEXT',
  userAgent: '...',   // Turnstile only, when json=1 poll includes it
}
```

---

## SDK parameter aliases

Convenience aliases mapped before sending to CapSkip:

| SDK alias | CapSkip API param |
|---|---|
| `url` | `pageurl` |
| `score` | `min_score` |
| `minScore` | `min_score` |
| `datas` | `data-s` |
| `data_s` | `data-s` |
| `proxy` object | `proxy` + `proxytype` strings |

```js
const proxy = { type: 'HTTPS', uri: 'login:password@1.2.3.4:3128' };
```

Unsupported parameters (e.g. `numeric` on image captcha, `action` on v2) throw `ValidationException`.

---

## Manual workflow

### `send(params)`

Submit without polling. Resolves to the captcha ID string.

```js
const captchaId = await solver.send({
  method: 'userrecaptcha',
  googlekey: '...',
  pageurl: 'https://example.com',
});
```

### `getResult(id, json = 0)`

Poll once. Rejects with `NetworkException` while `CAPCHA_NOT_READY`.

```js
const { NetworkException } = require('capskip');

const code = await solver.getResult(captchaId);          // plain text
const data = await solver.getResult(captchaId, 1);       // object when json=1
```

---

## Low-level HTTP (ApiClient)

```js
const { ApiClient } = require('capskip');

const client = new ApiClient({ host: '127.0.0.1', port: 8080 });
await client.in_({ method: 'turnstile', key: 'capskip', sitekey: '...', pageurl: '...' });
await client.res({ key: 'capskip', action: 'get', id: '12345', json: 1 });
```

---

## Exceptions

| Exception | When |
|---|---|
| `ValidationException` | Invalid/unsupported parameters |
| `NetworkException` | Connection error, or captcha not ready |
| `ApiException` | CapSkip API error response |
| `TimeoutException` | Polling timeout exceeded |

All extend `CapSkipError`, so `catch (err) { if (err instanceof CapSkipError) ... }` catches them all.
