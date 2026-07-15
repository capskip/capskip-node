# CapSkip Node.js SDK — Complete Tutorial

This tutorial takes you from zero to solving every captcha type CapSkip supports.
Work through it top to bottom, or jump to the section you need.

**Contents**

1. [How it works](#1-how-it-works)
2. [Install and configure](#2-install-and-configure)
3. [Your first solve](#3-your-first-solve)
4. [Image captcha](#4-image-captcha)
5. [reCAPTCHA v2](#5-recaptcha-v2)
6. [reCAPTCHA v3](#6-recaptcha-v3)
7. [Cloudflare Turnstile](#7-cloudflare-turnstile)
8. [Using a proxy](#8-using-a-proxy)
9. [Concurrency](#9-concurrency)
10. [The manual workflow](#10-the-manual-workflow)
11. [Return values](#11-return-values)
12. [Error handling](#12-error-handling)
13. [End-to-end: solve and submit](#13-end-to-end-solve-and-submit)
14. [Parameter reference](#14-parameter-reference)
15. [Best practices](#15-best-practices)

---

## 1. How it works

CapSkip is a **local** application that solves captchas on your own machine and
exposes a standard captcha-solver HTTP API (documented in the [CapSkip API docs](https://capskip.com/api-docs/)):

```
POST http://<host>:<port>/in.php   → submit a captcha, returns  OK|<id>
GET  http://<host>:<port>/res.php  → poll for the answer, returns  OK|<solution>
```

This SDK is a thin, friendly wrapper around that API. Every solve follows the
same three steps, which the SDK does for you:

1. **Submit** the captcha (`in.php`) and receive a captcha ID.
2. **Poll** the result endpoint (`res.php`) every few seconds while the answer is
   not ready.
3. **Return** the solution once CapSkip finishes.

You never have to write the polling loop yourself — call one method and `await`
the answer.

---

## 2. Install and configure

### Install CapSkip

Download and launch the CapSkip desktop app from [capskip.com](https://capskip.com),
and leave it running. In **Settings**, note the **API port** (default `8080`) and,
if API-key validation is enabled, your **API key**.

### Install the SDK

```bash
npm install capskip
```

Verify:

```bash
node -e "console.log(require('capskip').version)"
node examples/verify_connection.js     # checks CapSkip is reachable
```

### Configure the client

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: 'capskip',        // your CapSkip API key (any string if validation is off)
  host: '127.0.0.1',        // where CapSkip is listening
  port: 8080,               // API port from CapSkip settings
  defaultTimeout: 120,      // seconds to wait for an image captcha
  recaptchaTimeout: 300,    // seconds to wait for reCAPTCHA / Turnstile
  pollingInterval: 5,       // max seconds between result polls (starts at 0.25s, backs off to this)
});
```

In production, read configuration from the environment instead of hard-coding it:

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});
```

---

## 3. Your first solve

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({ host: '127.0.0.1', port: 8080 });

(async () => {
  const result = await solver.recaptcha(
    '6Le-wvkS...your-sitekey',
    'https://example.com/page-with-recaptcha',
  );

  console.log(result.code);      // the g-recaptcha-response token
  console.log(result.captchaId); // CapSkip's internal ID for this solve
})();
```

`result` is always an object. The solution is in `result.code`.

---

## 4. Image captcha

Use `solver.normal(...)` for classic distorted-text images. The SDK accepts four
input forms and auto-detects which one you passed:

```js
// 1. Local file path
await solver.normal('captcha.png');

// 2. Remote image URL (the SDK downloads and encodes it)
await solver.normal('https://example.com/captcha.jpg');

// 3. Base64 string (no file extension, longer than 50 characters)
const fs = require('fs');
const b64 = fs.readFileSync('captcha.png').toString('base64');
await solver.normal(b64);

// 4. Data-URI
const result = await solver.normal('data:image/png;base64,iVBORw0KGgo...');

console.log(result.code); // the recognized text
```

Image captcha accepts only one extra option, `json`, which controls the raw
response format from CapSkip:

```js
await solver.normal('captcha.png', { json: 1 });
```

> **Note:** Proxies are **not** supported for image captcha — passing one throws
> `ValidationException`. Proxies apply only to reCAPTCHA and Turnstile.

---

## 5. reCAPTCHA v2

`solver.recaptcha(sitekey, url)` handles reCAPTCHA v2 by default. The `sitekey` is
the `data-sitekey` attribute of the widget; `url` is the full page URL where it
appears.

```js
// Standard checkbox
await solver.recaptcha('6Le-wvkS...', 'https://example.com/login');

// Invisible reCAPTCHA v2
await solver.recaptcha('6Le-wvkS...', 'https://example.com', { invisible: 1 });

// Enterprise reCAPTCHA v2
await solver.recaptcha('6Le-wvkS...', 'https://example.com', { enterprise: 1 });

// Enterprise with a data-s value (SDK alias: datas)
const result = await solver.recaptcha('6Le-wvkS...', 'https://example.com', {
  enterprise: 1,
  datas: 'Crb7Vs...',
});

console.log(result.code); // g-recaptcha-response token
```

Do **not** pass `version`, `action`, or `min_score` to a v2 solve — those belong
to v3 and will throw `ValidationException`.

---

## 6. reCAPTCHA v3

reCAPTCHA v3 is score-based. Pass `version: 'v3'` plus the `action` your target
page uses and, optionally, a minimum score.

```js
const result = await solver.recaptcha('6Le-wvkS...', 'https://example.com', {
  version: 'v3',
  action: 'submit',    // must match the action in grecaptcha.execute()
  score: 0.7,          // SDK alias for min_score (0.1 – 0.9)
  enterprise: 0,       // set 1 for Enterprise v3
});

console.log(result.code);
```

`invisible` is a v2-only flag and is rejected for v3.

---

## 7. Cloudflare Turnstile

`solver.turnstile(sitekey, url)` solves Cloudflare Turnstile. The SDK automatically
requests the JSON response so it can return the **User-Agent** Cloudflare expects.

```js
// Standalone widget
const result = await solver.turnstile('0x4AAAAAAA...', 'https://example.com');
console.log(result.code);      // cf-turnstile-response token
console.log(result.userAgent); // present when CapSkip returns it

// With an explicit action
await solver.turnstile('0x4AAAAAAA...', 'https://example.com', { action: 'login' });

// Cloudflare challenge page (needs cData and chlPageData from the page)
await solver.turnstile('0x4AAAAAAA...', 'https://example.com', {
  action: 'managed',
  data: 'your_cData_value',
  pagedata: 'your_chlPageData_value',
});
```

> **Important:** For challenge pages you **must** send the returned token *and* use
> `result.userAgent` as the `User-Agent` header when you submit it. Mismatched
> User-Agents are the most common reason a valid token gets rejected.

---

## 8. Using a proxy

Solving through the same IP you will submit from greatly improves acceptance rates
for reCAPTCHA and Turnstile. Pass the proxy as an object with `type` and `uri`:

```js
const proxy = { type: 'HTTPS', uri: 'user:pass@1.2.3.4:3128' };

await solver.recaptcha('...', 'https://example.com', { proxy });
await solver.turnstile('...', 'https://example.com', { proxy });
```

Supported proxy types: `HTTP`, `HTTPS`, `SOCKS5`, `SOCKS5H`. The `uri` may include
credentials (`login:password@host:port`) or be a bare `host:port`.

---

## 9. Concurrency

Every solve method returns a Promise, so you can solve many captchas concurrently
with `Promise.all`:

```js
const { CapSkip } = require('capskip');

async function main() {
  const solver = new CapSkip({ host: '127.0.0.1', port: 8080 });

  const [r1, r2, r3] = await Promise.all([
    solver.recaptcha('...', 'https://a.com'),
    solver.recaptcha('...', 'https://b.com', { version: 'v3', action: 'submit' }),
    solver.turnstile('0x4A...', 'https://c.com'),
  ]);

  console.log(r1.code, r2.code, r3.code);
}

main();
```

Use `Promise.allSettled` if you want one failure not to reject the others:

```js
const results = await Promise.allSettled([task1, task2]);
```

---

## 10. The manual workflow

If you want to submit now and collect the answer later, use the two low-level
steps directly.

```js
const { NetworkException } = require('capskip');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1. Submit — resolves to the captcha ID immediately, without waiting.
const captchaId = await solver.send({
  method: 'userrecaptcha',
  googlekey: '6Le-wvkS...',
  pageurl: 'https://example.com',
});

// 2. Poll once. NetworkException means "not ready yet" — retry.
let code;
while (true) {
  try {
    code = await solver.getResult(captchaId);
    break;
  } catch (err) {
    if (!(err instanceof NetworkException)) throw err;
    await sleep(5000);
  }
}

console.log(code);
```

Pass `1` as the second argument to `getResult` to get the full object (including
`userAgent` for Turnstile) instead of a plain string.

---

## 11. Return values

Every high-level solve method (`normal`, `recaptcha`, `turnstile`, `solve`)
resolves to an object:

```js
{
  captchaId: '12345',       // CapSkip's internal ID for this solve
  code: 'TOKEN_OR_TEXT',    // the solution: text for images, token otherwise
  userAgent: 'Mozilla/...', // Turnstile only, when CapSkip provides it
}
```

`solver.send()` resolves to just the ID string. `solver.getResult()` resolves to
the solution string (or an object when called with `json = 1`).

---

## 12. Error handling

The SDK throws four error types, all subclasses of `CapSkipError`:

| Exception | When it is thrown |
|---|---|
| `ValidationException` | Invalid or unsupported parameters (e.g. proxy on image captcha) |
| `NetworkException` | CapSkip is unreachable, or the captcha is not ready yet |
| `ApiException` | CapSkip returned an error code (e.g. `ERROR_WRONG_USER_KEY`) |
| `TimeoutException` | Polling exceeded the configured timeout |

```js
const {
  CapSkip, ValidationException, NetworkException, ApiException, TimeoutException,
} = require('capskip');

const solver = new CapSkip({ host: '127.0.0.1', port: 8080 });

try {
  const result = await solver.recaptcha('...', 'https://example.com');
  console.log(result.code);
} catch (err) {
  if (err instanceof ValidationException) {
    console.log('Bad parameters:', err.message);
  } else if (err instanceof NetworkException) {
    console.log('Is CapSkip running?', err.message);
  } else if (err instanceof ApiException) {
    console.log('CapSkip returned an error:', err.message);
  } else if (err instanceof TimeoutException) {
    console.log('Gave up waiting:', err.message);
  } else {
    throw err;
  }
}
```

You can also catch them all at once with the base class:

```js
const { CapSkipError } = require('capskip');

try {
  const result = await solver.turnstile('...', '...');
} catch (err) {
  if (err instanceof CapSkipError) {
    console.log('Solve failed:', err.message);
  } else {
    throw err;
  }
}
```

---

## 13. End-to-end: solve and submit

A realistic flow — solve a reCAPTCHA, then submit the token to the target site
through the **same** proxy:

```js
const { CapSkip, CapSkipError } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: '127.0.0.1',
  port: 8080,
});

const SITEKEY = '6Le-wvkS...your-sitekey';
const LOGIN_URL = 'https://example.com/login';
const PROXY = { type: 'HTTP', uri: '1.2.3.4:3128' };

(async () => {
  let solved;
  try {
    solved = await solver.recaptcha(SITEKEY, LOGIN_URL, { proxy: PROXY });
  } catch (err) {
    if (err instanceof CapSkipError) {
      console.error('Could not solve captcha:', err.message);
      process.exit(1);
    }
    throw err;
  }

  const token = solved.code;

  // Submit the form using the same proxy so the IP matches.
  // (Use your HTTP client of choice, e.g. undici's fetch with a ProxyAgent.)
  const response = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      username: 'myuser',
      password: 'mypass',
      'g-recaptcha-response': token,
    }),
  });

  console.log(response.status);
})();
```

For Turnstile challenge pages, also set the User-Agent header:

```js
const solved = await solver.turnstile('0x4A...', CHALLENGE_URL, {
  data: 'cData',
  pagedata: 'chlPageData',
});

await fetch(CHALLENGE_URL, {
  method: 'POST',
  headers: { 'User-Agent': solved.userAgent },
  body: new URLSearchParams({ 'cf-turnstile-response': solved.code }),
});
```

---

## 14. Parameter reference

### Solve methods

| Method | Signature |
|---|---|
| Image | `normal(file, { json })` |
| reCAPTCHA | `recaptcha(sitekey, url, { version, enterprise, ... })` |
| Turnstile | `turnstile(sitekey, url, { ... })` |
| Manual submit | `send(params) -> Promise<id>` |
| Manual poll | `getResult(id, json)` |

### Convenience aliases

The SDK accepts friendly names and converts them to the raw API parameters:

| SDK name | CapSkip API parameter |
|---|---|
| `url` | `pageurl` |
| `score`, `minScore` | `min_score` |
| `datas`, `data_s` | `data-s` |
| `proxy` (object) | `proxy` + `proxytype` strings |

Anything CapSkip does not document for a given captcha type is rejected with
`ValidationException`, so typos fail fast instead of silently doing nothing.

---

## 15. Best practices

- **Keep CapSkip running.** The SDK talks to a local app; if it is not running you
  get `NetworkException`.
- **Use the token immediately.** reCAPTCHA and Turnstile tokens expire within a
  couple of minutes.
- **Match sitekey and pageurl exactly** to the page the widget loads on.
- **Solve and submit from the same IP** (same proxy) for reCAPTCHA and Turnstile.
- **Never commit secrets.** Read `CAPSKIP_API_KEY` and proxy credentials from the
  environment, not source code.
- **Tune timeouts** for slow captcha types with `recaptchaTimeout` and
  `defaultTimeout`.

---

### Where to go next

- [API Reference](API_REFERENCE.md) — every method, parameter, and endpoint
- [Getting Started](GETTING_STARTED.md) — installation walkthrough
- [Troubleshooting](TROUBLESHOOTING.md) — fixes for common errors
- [CapSkip API docs](https://capskip.com/api-docs/) — the raw HTTP API
