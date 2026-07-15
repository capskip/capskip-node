# CapSkip Node.js SDK

[![Node.js 18+](https://img.shields.io/badge/node-18%2B-brightgreen.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Tests](https://github.com/capskip/capskip-node/actions/workflows/ci.yml/badge.svg)](https://github.com/capskip/capskip-node/actions/workflows/ci.yml)

Official Node.js client for the [CapSkip](https://capskip.com) **local** captcha solver.

CapSkip runs on your machine and exposes a standard captcha-solver HTTP API (the familiar `in.php` / `res.php` endpoints). This SDK wraps that API with clean, familiar method names, so you can solve captchas locally — no cloud service and no per-solve API fees beyond your CapSkip license.

---

## Quick start (5 minutes)

### 1. Install CapSkip

Download and run the CapSkip desktop app from [capskip.com](https://capskip.com). Leave it running in the background.

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

## Supported captcha types

| Type | SDK method |
|---|---|
| Image CAPTCHA (distorted text) | `solver.normal(file)` |
| reCAPTCHA v2 (checkbox) | `solver.recaptcha(sitekey, url)` |
| reCAPTCHA v2 Invisible | `solver.recaptcha(sitekey, url, { invisible: 1 })` |
| reCAPTCHA v2 Enterprise | `solver.recaptcha(sitekey, url, { enterprise: 1 })` |
| reCAPTCHA v3 | `solver.recaptcha(sitekey, url, { version: 'v3' })` |
| reCAPTCHA v3 Enterprise | `solver.recaptcha(sitekey, url, { version: 'v3', enterprise: 1 })` |
| Cloudflare Turnstile (widget) | `solver.turnstile(sitekey, url)` |
| Cloudflare Turnstile (challenge page) | `solver.turnstile(sitekey, url, { data, pagedata })` |

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
  recaptchaTimeout: 300,    // seconds — reCAPTCHA / Turnstile polling timeout
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

### With a proxy (reCAPTCHA & Turnstile only)

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

## Return value

Every solve method resolves to:

```js
{
  captchaId: '12345',    // internal ID from CapSkip
  code: 'TOKEN_OR_TEXT', // solution — text for image, token for reCAPTCHA/Turnstile
  userAgent: '...',      // Turnstile only — use when submitting challenge-page tokens
}
```

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

- [CapSkip website](https://capskip.com)
- [CapSkip API docs](https://capskip.com/api-docs/)
- [Report an issue](https://github.com/capskip/capskip-node/issues)
- [npm package](https://www.npmjs.com/package/capskip)

---

## License

MIT — see [LICENSE](LICENSE).
