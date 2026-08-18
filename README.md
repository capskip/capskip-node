# CapSkip Node.js SDK — Captcha Solver for Node.js

[![npm](https://img.shields.io/npm/v/capskip.svg)](https://www.npmjs.com/package/capskip)
[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://github.com/capskip/capskip-node/actions/workflows/ci.yml/badge.svg)](https://github.com/capskip/capskip-node/actions/workflows/ci.yml)

**Solve reCAPTCHA v2, reCAPTCHA v3, Cloudflare Turnstile, GeeTest and image captchas from Node.js.**

Official Node.js client for [CapSkip](https://capskip.com), a **local captcha solver** that runs on your own machine. Licensed once, not billed per solve. TypeScript definitions included.

```bash
npm install capskip
```

---

## How it works

CapSkip is a desktop app. It does the solving on your machine and exposes the standard captcha-solver HTTP API — the same `in.php` / `res.php` endpoints every 2captcha-compatible client already speaks — on `127.0.0.1:8080`.

This SDK is a thin wrapper over that API, with the method names you would expect: `normal()`, `recaptcha()`, `turnstile()`, `geetest()`. Nothing leaves your network, and there is no credit balance to keep an eye on.

## Supported captcha types

| Captcha | Method |
|---|---|
| **Image captcha solver** (distorted text / OCR) | `solver.normal(file)` |
| **reCAPTCHA v2 solver** (checkbox) | `solver.recaptcha(sitekey, url)` |
| **reCAPTCHA v2 invisible solver** | `solver.recaptcha(sitekey, url, { invisible: 1 })` |
| **reCAPTCHA Enterprise solver** | `solver.recaptcha(sitekey, url, { enterprise: 1 })` |
| **reCAPTCHA v3 solver** | `solver.recaptcha(sitekey, url, { version: 'v3', action: 'submit' })` |
| reCAPTCHA v3 Enterprise | `solver.recaptcha(sitekey, url, { version: 'v3', enterprise: 1 })` |
| **Cloudflare Turnstile solver** (widget) | `solver.turnstile(sitekey, url)` |
| Cloudflare Turnstile (challenge page) | `solver.turnstile(sitekey, url, { data, pagedata })` |
| **GeeTest v3 solver** (slide puzzle) | `solver.geetest(gt, challenge, url)` |

**hCaptcha and FunCaptcha/Arkose are not supported.** hCaptcha is the one people misidentify most often, since it also puts a `data-sitekey` on the widget — check for `class="h-captcha"` or a `js.hcaptcha.com` script before reaching for `recaptcha()`.

Point the SDK at the [live captcha demo pages](https://capskip.com/captcha-demo/) to sanity-check your setup against real widgets.

---

## Quick start (5 minutes)

### 1. Install the CapSkip captcha solver

Download and run the CapSkip desktop app from [capskip.com](https://capskip.com/download/). Leave it running in the background.

In CapSkip settings, note:

- **API port** (default: `8080`)
- **API key** (optional — if validation is disabled, any string works)

### 2. Install the SDK

```bash
npm install capskip
```

Or from source:

```bash
git clone https://github.com/capskip/capskip-node.git
cd capskip-node
npm install
```

### 3. Solve your first captcha

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({ host: '127.0.0.1', port: 8080 });

(async () => {
  const result = await solver.recaptcha(
    'YOUR_SITEKEY',
    'https://example.com/page-with-recaptcha',
  );

  console.log(result.code); // g-recaptcha-response token
})();
```

> **Prerequisite:** CapSkip must be running before you call the SDK. If you see a connection error, see [Troubleshooting](docs/TROUBLESHOOTING.md).

Every solve method returns a Promise — use `await` or `.then()`.

---

## Why solve captchas locally

Cloud captcha APIs charge per solve, which turns a retry loop into an expense and routes every page URL and sitekey you touch through someone else's queue.

CapSkip flips that around:

- **Unlimited solving** — one license, no per-captcha charge, no balance to top up
- **Runs on `127.0.0.1`** — the SDK never talks to a third-party server
- **No per-key rate limit** — throughput is whatever your machine can manage
- **Fast** — image captchas come back in well under a second; a typical reCAPTCHA v2 lands in 30–45 seconds

### Coming from 2captcha or Anti-Captcha

CapSkip answers on the same `in.php` / `res.php` endpoints, so it works as a **2captcha API alternative**: an existing integration usually needs nothing more than its host pointed at `127.0.0.1:8080`. The [migration notes](https://capskip.com/2captcha-api-alternative/) cover the details, if you would rather keep your current client library than switch to this one.

---

## Documentation

| Guide | Description |
|---|---|
| [Tutorial](docs/TUTORIAL.md) | Complete walkthrough of every captcha type |
| [Getting Started](docs/GETTING_STARTED.md) | Full setup: CapSkip app, SDK install, first script |
| [API Reference](docs/API_REFERENCE.md) | All classes, methods, parameters, and return values |
| [Examples](examples/) | Ready-to-run scripts for every captcha type |
| [Troubleshooting](docs/TROUBLESHOOTING.md) | Connection errors, timeouts, proxy issues |
| [Contributing](CONTRIBUTING.md) | Development setup, tests, pull requests |
| [Changelog](CHANGELOG.md) | Release history |

---

## Configuration

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: 'capskip',        // your CapSkip API key (or any string if validation is off)
  host: '127.0.0.1',        // CapSkip host
  port: 8080,               // CapSkip port from app settings
  defaultTimeout: 120,      // seconds — image captcha polling timeout
  recaptchaTimeout: 300,    // seconds — reCAPTCHA / Turnstile / GeeTest polling timeout
  pollingInterval: 5,       // max seconds between res.php polls (starts at 0.25s, backs off to this)
});
```

Use environment variables in production:

```bash
# Linux / macOS
export CAPSKIP_API_KEY="your-key"
export CAPSKIP_HOST="127.0.0.1"
export CAPSKIP_PORT="8080"
```

```powershell
# Windows PowerShell
$env:CAPSKIP_API_KEY = "your-key"
$env:CAPSKIP_HOST = "127.0.0.1"
$env:CAPSKIP_PORT = "8080"
```

```js
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});
```

---

## Usage examples

### Image captcha

```js
await solver.normal('captcha.png');
await solver.normal('https://example.com/captcha.jpg');
await solver.normal('data:image/png;base64,iVBORw0KGgo...');
// result.code holds the recognized text
```

### reCAPTCHA v2 / v3

```js
// reCAPTCHA v2
const v2 = await solver.recaptcha('...', 'https://example.com');

// reCAPTCHA v3
const v3 = await solver.recaptcha('...', 'https://example.com', {
  version: 'v3',
  action: 'submit',
  score: 0.7,
});
```

### Cloudflare Turnstile

```js
const result = await solver.turnstile('0x4AAAAAAA...', 'https://example.com');
```

### GeeTest v3

`gt` is static per site, but `challenge` is single-use and expires in about a
minute — fetch a fresh pair right before solving.

```js
const result = await solver.geetest(
  '81388ea1fc187e0c335c0a8907ff2625',
  '7cf6a8b1a2c34d5e6f7089abcdef0123',
  'https://example.com/login',
);

// Post these back exactly as the site's own front-end would
result.challenge, result.validate, result.seccode;
```

### With a proxy (reCAPTCHA, Turnstile & GeeTest only)

```js
// Proxy is not supported for image captcha
await solver.recaptcha('...', 'https://example.com', {
  proxy: { type: 'HTTPS', uri: 'user:pass@1.2.3.4:3128' },
});
await solver.turnstile('...', 'https://example.com', {
  proxy: { type: 'HTTP', uri: '1.2.3.4:3128' },
});
```

### Parallel solving

```js
const { CapSkip } = require('capskip');

async function main() {
  const solver = new CapSkip();
  const [r1, r2] = await Promise.all([
    solver.recaptcha('...', 'https://a.com'),
    solver.turnstile('...', 'https://b.com'),
  ]);
  console.log(r1.code, r2.code);
}

main();
```

> `AsyncCapSkip` is exported as an alias of `CapSkip` — Node I/O is asynchronous by nature, so every method already returns a Promise.

More examples: [`examples/`](examples/)

---

## Puppeteer, Playwright and Selenium

The SDK hands back a token; your existing browser tooling does the driving. The shape is the same whichever you use:

1. Read the sitekey off the page (`data-sitekey`, or the widget's config object).
2. Call the matching solve method with that sitekey and the page URL.
3. Write the token into the response field and submit.

### Puppeteer

```js
const sitekey = await page.$eval('[data-sitekey]', el => el.dataset.sitekey);
const { code } = await solver.recaptcha(sitekey, page.url());

await page.evaluate(t => {
  document.getElementById('g-recaptcha-response').value = t;
}, code);
await page.click('button[type=submit]');
```

### Playwright

```js
const sitekey = await page.getAttribute('[data-sitekey]', 'data-sitekey');
const { code } = await solver.recaptcha(sitekey, page.url());

await page.evaluate(t => {
  document.getElementById('g-recaptcha-response').value = t;
}, code);
```

### Selenium WebDriver

```js
const el = await driver.findElement(By.css('[data-sitekey]'));
const sitekey = await el.getAttribute('data-sitekey');
const { code } = await solver.recaptcha(sitekey, await driver.getCurrentUrl());

await driver.executeScript(
  'document.getElementById("g-recaptcha-response").value = arguments[0];', code,
);
```

Longer walkthroughs: [Puppeteer](https://capskip.com/puppeteer-captcha-solver/), [Playwright](https://capskip.com/playwright-captcha-solver/) and [Selenium](https://capskip.com/selenium-captcha-solver/).

---

## Return value

Every solve method resolves to:

```js
{
  captchaId: '12345',    // internal ID from CapSkip
  code: 'TOKEN_OR_TEXT', // solution — text for image, token for reCAPTCHA/Turnstile
  userAgent: '...',      // Turnstile only — use when submitting challenge-page tokens
}
```

GeeTest additionally expands its answer into `challenge`, `validate`, and
`seccode`, while `code` keeps the raw JSON string.

---

## Error handling

```js
const {
  CapSkip, ValidationException, NetworkException, ApiException, TimeoutException,
} = require('capskip');

try {
  const result = await solver.recaptcha('...', '...');
} catch (err) {
  if (err instanceof ValidationException) {
    // invalid parameters
  } else if (err instanceof NetworkException) {
    // CapSkip not running, or captcha not ready (manual polling)
  } else if (err instanceof ApiException) {
    // API returned an error code
  } else if (err instanceof TimeoutException) {
    // polling timeout exceeded
  }
}
```

---

## TypeScript

Type definitions ship with the package — no `@types` install required.

```ts
import { CapSkip, SolveResult } from 'capskip';

const solver = new CapSkip({ host: '127.0.0.1', port: 8080 });
const result: SolveResult = await solver.recaptcha('...', 'https://example.com');
```

---

## FAQ

### How do I solve a captcha in Node.js?

Install the CapSkip desktop app, `npm install capskip`, then call the method that matches the widget — `recaptcha()`, `turnstile()`, `geetest()` or `normal()`. Each returns a Promise that resolves once CapSkip has an answer, giving you a token, or the recognized text in the case of an image captcha.

### Is this a free captcha solver?

The SDK itself is MIT-licensed and free. Solving needs the CapSkip app, which is bought once rather than metered per captcha, so your cost stops scaling with volume.

### Which captchas can it solve?

reCAPTCHA v2 (checkbox and invisible), reCAPTCHA v3, reCAPTCHA Enterprise, Cloudflare Turnstile, GeeTest v3, and image/text captchas. Not hCaptcha, and not FunCaptcha/Arkose.

### Does it work with Puppeteer and Playwright?

Yes — see [above](#puppeteer-playwright-and-selenium). The SDK never touches a browser itself, so it drops into whatever stack you already have, Selenium and plain `fetch` included.

### Why is my reCAPTCHA v3 score low?

Google derives v3 scores from IP reputation, cookies and browsing history. A solver returns a valid token, but it cannot change how Google grades that token — `score` is forwarded as the target you want, not a guarantee. If a site enforces a high threshold, solve through a cleaner IP using the `proxy` option.

### Can I use it as a 2captcha alternative?

Yes. CapSkip serves the same endpoints, so you can either move to this SDK or repoint an existing 2captcha client at `127.0.0.1:8080`.

### Does the captcha have to be on a public page?

For widget captchas, yes — CapSkip loads the URL you pass it. Image captchas only need the image, and that can be a local file.

### Does it work with TypeScript and ESM?

Types ship in the package. The runtime is CommonJS, so `import { CapSkip } from 'capskip'` works from ESM through Node's interop.

---

## Development

```bash
git clone https://github.com/capskip/capskip-node.git
cd capskip-node
npm install
npm test
```

The test suite uses Node's built-in test runner — no extra dependencies. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full development workflow.

---

## Links

- [CapSkip — local captcha solver](https://capskip.com) · [download](https://capskip.com/download/)
- [Captcha demo pages](https://capskip.com/captcha-demo/) — live reCAPTCHA, Turnstile, GeeTest and image widgets
- [Node.js captcha solver guide](https://capskip.com/nodejs-captcha-solver/)
- [HTTP API docs](https://capskip.com/api-docs/)
- Other clients: [Python](https://github.com/capskip/capskip-python) · [PHP](https://github.com/capskip/capskip-php) · [.NET](https://github.com/capskip/capskip-dotnet) · [MCP server for AI agents](https://github.com/capskip/capskip-mcp)
- [npm package](https://www.npmjs.com/package/capskip) · [report an issue](https://github.com/capskip/capskip-node/issues)

---

## License

MIT — see [LICENSE](LICENSE).
