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
| GeeTest v3 (slide) | `geetest()` | `geetest` |
| ALTCHA (proof-of-work) | `altcha()` | `altcha` |
| Capy Puzzle (slide) | `capy()` | `capy` |
| CaptchaFox (widget) | `captchafox()` | `captchafox` |
| Friendly Captcha (proof-of-work) | `friendlyCaptcha()` | `friendly_captcha` |

**Proxy** is supported for every method except image captcha. For ALTCHA the
proxy is used only for the `challengeUrl` fetch; for Capy, only for the
puzzle-image fetch, which is the only request a Capy solve makes.

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

## 5. GeeTest v3 — `geetest(gt, challenge, url, { ... })`

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `geetest` |
| `gt` | string | Yes | Static per-site GeeTest id |
| `challenge` | string | Yes | Single-use challenge token |
| `pageurl` | string | Yes | Full page URL |
| `api_server` | string | No | GeeTest API server domain, e.g. `api-na.geetest.com` |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address |
| `proxytype` | string | No | Proxy type |

### Getting `gt` and `challenge`

Both come from the target site, which fetches them from an endpoint returning
`{"gt": "...", "challenge": "..."}` (often `.../register.php` or a `gettype`/`get.php`
request). Find it in DevTools → Network, or read them out of the
`initGeetest({ gt, challenge })` call in the page scripts.

> **`challenge` is single-use and expires in about a minute.** Fetch a fresh pair
> immediately before each solve. If a solve comes back with a bad-challenge error,
> request a new pair and retry — reusing one never succeeds.

### SDK usage

```js
const result = await solver.geetest(
  '81388ea1fc187e0c335c0a8907ff2625',
  '7cf6a8b1a2c34d5e6f7089abcdef0123',
  'https://example.com/login',
);

result.challenge;   // geetest_challenge
result.validate;    // geetest_validate
result.seccode;     // geetest_seccode
result.code;        // the same answer as a raw JSON string
```

Post the three fields back exactly as the site's own front-end would:

```js
await fetch(LOGIN_URL, {
  method: 'POST',
  body: new URLSearchParams({
    geetest_challenge: result.challenge,
    geetest_validate: result.validate,
    geetest_seccode: result.seccode,
  }),
});
```

GeeTest is a real browser solve, so it uses the longer `recaptchaTimeout` budget
rather than `defaultTimeout`.

---

## 6. ALTCHA — `altcha(url, { ... })`

ALTCHA is not a recognition captcha. There is no image, audio or text to read:
the site issues a proof-of-work challenge and the client must brute-force a
number that satisfies it. A solve is therefore deterministic and cheap —
typically milliseconds.

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `altcha` |
| `pageurl` | string | Yes | Full URL of the page the challenge came from |
| `challenge_url` | string | One of the two | Endpoint CapSkip fetches the challenge from |
| `challenge_json` | string | One of the two | The challenge document itself, as a JSON string |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address — used **only** for the `challenge_url` fetch |
| `proxytype` | string | No | Proxy type |

Sending both challenge parameters is allowed: the inline `challengeJson` wins,
because fetching would only re-obtain what you already supplied.

### Getting the challenge

Open DevTools → Network on the target page and look for the request the
`<altcha-widget>` makes for its challenge (often something like
`/altcha/challenge`). The request URL is your `challengeUrl`; its JSON response
is your `challengeJson`.

The widget attribute that names that endpoint depends on the widget version, so
read the page source rather than assuming:

| Widget | Attribute |
|---|---|
| v1 / v2 | `challengeurl="…"`, with a separate `challengejson="…"` for an inline challenge |
| v3+ | `challenge="…"` — the same attribute takes either a URL or the challenge data |

> **Challenges expire, and the window is short** — some sites inside two minutes.
> Once expired, the site refuses the solution with a bare "verification failed"
> that looks exactly like a wrong answer. Fetch the challenge immediately before
> solving and submit the token promptly; do not fetch a batch in advance, and do
> not hold a token while a user fills in a form.
>
> CapSkip refuses an already-expired inline challenge immediately rather than
> burning CPU on a token that cannot work. If you passed `challengeUrl` and the
> challenge expired while the job queued, it fetches a fresh one automatically.

### SDK usage

```js
// CapSkip fetches the challenge for you
const result = await solver.altcha('https://example.com/signup', {
  challengeUrl: 'https://example.com/captcha/api/altcha/challenge',
});

// …or hand it the document you already have. No network request at all.
const inline = await solver.altcha('https://example.com/signup', {
  challengeJson: {
    algorithm: 'SHA-256', challenge: '…', salt: '…',
    signature: '…', maxnumber: 1000000,
  },
});

result.token;    // the base64 payload to post back
result.number;   // the counter that solved it
result.code;     // the same string as token
```

`challengeJson` accepts an object (serialized for you) or a JSON string.

`number` is reported for both ALTCHA generations. Their tokens differ — a legacy
payload carries it as a top-level `number`, while a proof-of-work v2 payload has
none, its counter sitting at `solution.counter` — so it is read from the server's
own `solution` object, which reports both the same way.

Post the token back in the form field the widget uses, named `altcha`:

```js
await fetch(SIGNUP_URL, {
  method: 'POST',
  body: new URLSearchParams({
    email: 'someone@example.com',
    altcha: result.token,
  }),
});
```

Do not re-encode, trim or re-order the token: it is base64 of a JSON document
whose fields are covered by the server's HMAC signature, so any modification
invalidates it. Some integrations read the payload from a JSON body field
instead — check what the page's own submit sends and mirror it.

Unlike GeeTest and reCAPTCHA this is CPU proof-of-work rather than a browser
solve, so it uses `defaultTimeout`, not `recaptchaTimeout`.

### Algorithms

CapSkip supports the legacy scheme (SHA-1/256/384/512) and PoW v2 with PBKDF2 or
SHA. **Argon2id and scrypt are refused**, not attempted: a task using one returns
`ERROR_CAPTCHA_UNSOLVABLE` and is never retried. ALTCHA itself recommends PBKDF2
as the default, so this affects a minority of sites.

All three widget types (`native`, `checkbox`, `switch`) work — the distinction is
purely visual and never reaches CapSkip.

---

## 7. Capy Puzzle — `capy(sitekey, url, { ... })`

Capy is a slide puzzle: a piece has to be dragged into the hole cut out of a
photograph. CapSkip locates the hole and produces the drag path — one HTTP fetch
plus pixel math, no browser.

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `capy` |
| `captchakey` | string | Yes | The site's public Capy key, conventionally prefixed `PUZZLE_`. The SDK sends its `sitekey` argument here. |
| `pageurl` | string | Yes | Full URL of the page the captcha is on |
| `api_server` | string | No | Root of the Capy API the key lives behind. Default `https://jp.api.capy.me` |
| `version` | string | No | `puzzle` (the default). Only the puzzle family is solved |
| `useragent` | string | No | User-Agent to send with the puzzle request |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address |
| `proxytype` | string | No | Proxy type |

`sitekey` and `websiteKey` are accepted by the server as aliases for
`captchakey`; the SDK sends the documented name.

`version: 'avatar'` is refused by the SDK before the request is made. Avatar is a
different challenge behind a different endpoint, and answering it with a puzzle
answer would bill for a solve the target site rejects, indistinguishably from a
broken solver.

> `api.capy.me` no longer resolves, although several solver services still
> document it. The live host is `jp.api.capy.me`; if a site's widget points
> somewhere else, pass that as `api_server`.

### Getting the captcha key

It is in the page source as `capy_captchakey`, or in the widget script URL:
`<script src="https://jp.api.capy.me/puzzle/get_js/?k=PUZZLE_XXXX">`.

### GET `/res.php`

The answer is **not a token**. It is an object, which the SDK expands into three
result fields. See [Return value](#return-value).

### SDK usage

```js
const result = await solver.capy(
  'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v',
  'https://example.com/login',
);

// With a non-default API server
const result = await solver.capy(
  'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v',
  'https://example.com/login',
  { api_server: 'https://jp.api.capy.me/' },
);

// capy_captchakey, capy_challengekey, capy_answer
result.captchakey, result.challengekey, result.answer;
```

### Timing

Capy grades the wall-clock gap between issuing the puzzle and verifying the
answer, and refuses anything superhuman with `CAPTCHA verification failed` — the
same message a wrong answer gets. CapSkip therefore holds every result until two
seconds have elapsed since it drew the puzzle. This is invisible if you poll: the
task simply takes about two seconds instead of a fifth of one. Nothing to
configure.

The challenge key is single-use and short-lived, so submit the three values
promptly rather than caching them.

---

## 8. CaptchaFox — `captchafox(sitekey, url, { ... })`

CaptchaFox scores the browser itself rather than asking the visitor to read
anything; most visitors never see a puzzle. CapSkip drives the real widget in a
real browser and returns the verification token.

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `captchafox` |
| `sitekey` | string | Yes | The public key the widget renders with, conventionally prefixed `sk_` |
| `pageurl` | string | Yes | Full URL of the page the widget appears on |
| `api_server` | string | No | Widget entry point. Default `https://cdn.captchafox.com/` |
| `useragent` | string | No | Accepted for compatibility and not applied — CapSkip uses its own browser's identity |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address |
| `proxytype` | string | No | Proxy type |

### Choosing the widget source

| `api_server` | Token | Default |
|---|---|---|
| `https://cdn.captchafox.com/` | Plain | Yes |
| `https://s.uicdn.com/mampkg/…` | `MAM_` prefixed | No |

Read the value from the `<script>` tag that loads the widget. If you send the
wrong one the solve still succeeds, but the token comes back in a format the
target site will not accept — a silent verification failure rather than an error.

### The page URL has to match the key

CaptchaFox keys are registered against a list of allowed domains and the service
checks the host before issuing anything. A correct key used on a page outside
that list is refused permanently, not intermittently. CapSkip reports that case
rather than retrying it, because retrying cannot help.

### Challenge types

| Challenge | Frequency | Supported |
|---|---|---|
| Invisible | Usually | Yes |
| Slide | Sometimes | Yes |
| Image select | Rarely | No |
| Audio | Rarely | No |

The two unsupported ones are uncommon and a retry usually draws a different
challenge, so treat an unsolvable result as a signal to resubmit rather than a
permanent failure of the key.

### SDK usage

```js
const result = await solver.captchafox(
  'sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G',
  'https://example.com/signup',
);

// Post in the form field named cf-captcha-response
result.token;

// Submit under the UA that minted the token, not your own
result.userAgent;
```

Uses `recaptchaTimeout` — it is a real browser session, and longer again when an
interactive challenge is drawn.

---

## 9. Friendly Captcha — `friendlyCaptcha(sitekey, url, { ... })`

Proof-of-work, with nothing shown on screen. The widget searches for values that
hash below a difficulty the service sets per request.

### POST `/in.php`

| Parameter | Type | Required | Description |
|---|---|---|---|
| `key` | string | Yes | CapSkip API key |
| `method` | string | Yes | `friendly_captcha` |
| `sitekey` | string | Yes | The `data-sitekey` of the element carrying `class="frc-captcha"` |
| `pageurl` | string | Yes | Full URL of the page the widget appears on |
| `version` | string | No | `v1` (default) or `v2`; a bare `1` or `2` is accepted |
| `module_script` | string | No | `src` of the widget script tag carrying `type="module"` |
| `nomodule_script` | string | No | `src` of the widget script tag carrying `nomodule` |
| `api_server` | string | No | Data residency endpoint: `global` (default), `eu`, or a full URL |
| `useragent` | string | No | User-Agent to send with the request |
| `json` | int | No | `0` plain text, `1` JSON |
| `proxy` | string | No | Proxy address |
| `proxytype` | string | No | Proxy type |

### Version 1 and version 2

Two entirely different protocols ship under this one name, and a sitekey does not
tell you which one a site uses — they share a brand and a sitekey namespace and
nothing else. Both are live. Solve the wrong one and you get a well-formed token
the target site rejects, with no indication that the version was the problem.

| `version` | Widget package | Script |
|---|---|---|
| `v1` | `friendly-challenge` | `widget.module.min.js` / `widget.min.js` |
| `v2` | `@friendlycaptcha/sdk` | `site.min.js` |

CapSkip decides in this order, stopping at the first answer: the `version`
parameter; then the script URL from `moduleScript` or `nomoduleScript`, which is
the most reliable signal because it is the build the site actually loads; then
v1. The SDK refuses any other `version` value locally.

### Submitting the token

| `version` | Form field |
|---|---|
| `v1` | `frc-captcha-solution` |
| `v2` | `frc-captcha-response` |

The field names differ, which is what catches an integration moved from one to
the other. A v1 token is four dot-separated parts and runs to a few hundred
characters; a v2 token is a single opaque string beginning `AQQA.` and is roughly
six kilobytes, so size whatever carries it accordingly.

### SDK usage

```js
// Say which version
const result = await solver.friendlyCaptcha(
  'FCMGEMUD2M567T8G',
  'https://example.com/signup',
  { version: 'v2' },
);

// …or let the script URL decide it
const result = await solver.friendlyCaptcha(
  'FCMGEMUD2M567T8G',
  'https://example.com/signup',
  { moduleScript: 'https://cdn.example.com/@friendlycaptcha/sdk@0.1.6/site.min.js' },
);

// EU data-residency tenant
const result = await solver.friendlyCaptcha(
  'FCMGEMUD2M567T8G',
  'https://example.com/signup',
  { version: 'v2', api_server: 'eu' },
);

result.token;
```

Uses `recaptchaTimeout`: the service decides how much work a request is worth at
the moment it is made, so solve time is not a constant, and v2 always solves in a
browser.

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

ALTCHA additionally exposes `token` (the same string as `code`, named for the
form field it goes in) and `number`, the counter that solved it:

```js
{
  captchaId: '12345',
  code: 'eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi…',
  token: 'eyJhbGdvcml0aG0iOiJTSEEtMjU2Iiwi…',
  number: 9661,
}
```

CaptchaFox and Friendly Captcha expose `token`, the same string as `code`, named
for the form field it goes in. CaptchaFox adds `userAgent` when the solve
reported one — the UA the browser minted the token under, not one you sent:

```js
{
  captchaId: '12345',
  code: '177f50c25b845601e5c779cdb51b040d…',
  token: '177f50c25b845601e5c779cdb51b040d…',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) …',
}
```

Capy returns an object rather than a token, expanded into the three fields the
target form takes (`code` keeps the raw answer):

```js
{
  captchaId: '12345',
  code: { captchakey: 'PUZZLE_…', challengekey: '…', answer: '…', respKey: '' },
  captchakey: 'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v',
  challengekey: 'BalY2gJaI8uA2SGVOZhqBQ3V0CYSNNGP',
  answer: '0xax8ex0xax84x0xkx7qx0x18x76x…',
  respKey: '',
}
```

GeeTest additionally expands its answer into `challenge`, `validate`, and
`seccode` (`code` keeps the raw JSON string):

```js
{
  captchaId: '12345',
  code: '{"geetest_challenge":"...","geetest_validate":"...","geetest_seccode":"..."}',
  challenge: '...',
  validate: '...',
  seccode: '...',
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
| `apiServer` | `api_server` |
| `api_subdomain` | `api_server` |
| `challengeUrl` / `challengeURL` | `challenge_url` |
| `challengeJson` / `challengeJSON` | `challenge_json` |
| `userAgent` / `user_agent` | `useragent` |
| `captchaKey` | `captchakey` |
| `moduleScript` | `module_script` |
| `nomoduleScript` / `noModuleScript` | `nomodule_script` |
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
