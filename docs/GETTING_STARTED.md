# Getting Started

This guide walks you through installing CapSkip, installing the Node.js SDK, and running your first captcha solve.

---

## Prerequisites

| Requirement | Details |
|---|---|
| **CapSkip app** | Windows desktop app from [capskip.com](https://capskip.com) |
| **Node.js** | 18 or newer |
| **Network** | SDK talks to CapSkip on `localhost` — no internet required for the API itself |

---

## Step 1 — Install and configure CapSkip

1. Download CapSkip from [capskip.com](https://capskip.com).
2. Install and launch the application.
3. Open **Settings** and confirm:
   - **Port** — default is `8080` (remember this value)
   - **API key validation** — if enabled, copy your API key; if disabled, any string (e.g. `capskip`) is accepted

CapSkip exposes a standard captcha-solver API:

```
POST http://127.0.0.1:<port>/in.php   → submit captcha, returns OK|<id>
GET  http://127.0.0.1:<port>/res.php  → poll result, returns OK|<answer>
```

### Verify CapSkip is running

**Windows (PowerShell):**

```powershell
Invoke-WebRequest "http://127.0.0.1:8080/res.php?key=capskip&action=get&id=0" -UseBasicParsing
```

You should get a response (even an error like `ERROR_WRONG_CAPTCHA_ID` confirms the server is up).

**Linux / macOS:**

```bash
curl "http://127.0.0.1:8080/res.php?key=capskip&action=get&id=0"
```

---

## Step 2 — Install the Node.js SDK

### From npm (recommended)

```bash
npm install capskip
```

### From source (development)

```bash
git clone https://github.com/capskip/capskip-node.git
cd capskip-node
npm install
```

### Verify installation

```bash
node -e "console.log(require('capskip').version)"
```

Expected output: `1.0.2` (or your installed version).

### Verify CapSkip connectivity

```bash
node examples/verify_connection.js
```

If CapSkip is running, you should see `Status: OK — CapSkip is reachable`.

---

## Step 3 — Your first script

Create `solve_recaptcha.js`:

```js
const { CapSkip, NetworkException, TimeoutException } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});

const SITEKEY = '6Le-wvkSAAAAAPBMRTvw0Q4Muexq9bi0DJwx_mJ-'; // replace with your target page sitekey
const PAGE_URL = 'https://example.com/login';                // replace with your target page URL

(async () => {
  try {
    const result = await solver.recaptcha(SITEKEY, PAGE_URL);
    console.log('Captcha ID:', result.captchaId);
    console.log('Token:     ', result.code.slice(0, 80), '...');
  } catch (err) {
    if (err instanceof NetworkException) {
      console.log('Cannot reach CapSkip — is the app running?', err.message);
    } else if (err instanceof TimeoutException) {
      console.log('Timed out:', err.message);
    } else {
      throw err;
    }
  }
})();
```

Run it:

```bash
node solve_recaptcha.js
```

---

## Step 4 — Run the bundled examples

Clone the repository (if you haven't already) and run an example:

```bash
cd capskip-node
node examples/recaptcha.js
```

| Example | What it demonstrates |
|---|---|
| `image_captcha.js` | Image captcha from file, URL, or base64 |
| `recaptcha.js` | reCAPTCHA v2, v3, invisible, enterprise, proxy |
| `turnstile.js` | Cloudflare Turnstile widget and challenge page |
| `async_example.js` | Parallel solving |
| `verify_connection.js` | Check CapSkip is running |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `CAPSKIP_API_KEY` | `capskip` | API key sent with every request |
| `CAPSKIP_HOST` | `127.0.0.1` | CapSkip host |
| `CAPSKIP_PORT` | `8080` | CapSkip port |

Example `.env` file (load with [dotenv](https://www.npmjs.com/package/dotenv) if you use it):

```env
CAPSKIP_API_KEY=capskip
CAPSKIP_HOST=127.0.0.1
CAPSKIP_PORT=8080
```

---

## Next steps

- [Tutorial](TUTORIAL.md) — complete walkthrough of every captcha type
- [API Reference](API_REFERENCE.md) — all methods and parameters
- [Troubleshooting](TROUBLESHOOTING.md) — fix common errors
- [CapSkip API docs](https://capskip.com/api-docs/) — raw HTTP API reference
