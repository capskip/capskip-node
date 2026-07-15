# Troubleshooting

Common issues when using the CapSkip Node.js SDK and how to fix them.

---

## Connection refused / CapSkip not reachable

**Symptom**

```
NetworkException: connect ECONNREFUSED 127.0.0.1:8080
```

**Cause:** CapSkip desktop app is not running, or the port is wrong.

**Fix**

1. Launch the CapSkip application.
2. Confirm the API server is enabled in Settings.
3. Match the port in your SDK config:

```js
const solver = new CapSkip({ host: '127.0.0.1', port: 8080 }); // use your actual port
```

4. Test with curl:

```bash
curl "http://127.0.0.1:8080/res.php?key=capskip&action=get&id=0"
```

---

## TimeoutException — captcha not solved in time

**Symptom**

```
TimeoutException: timeout 300 exceeded
```

**Cause:** CapSkip needs more time, or the captcha failed silently.

**Fix**

1. Increase the timeout:

```js
const solver = new CapSkip({ recaptchaTimeout: 600, defaultTimeout: 180 });
```

2. Increase poll interval slightly (CapSkip docs recommend ~5 s for reCAPTCHA):

```js
const solver = new CapSkip({ pollingInterval: 5 });
```

3. Check CapSkip app logs for solve errors on that captcha type.

---

## ApiException — ERROR_WRONG_USER_KEY

**Symptom**

```
ApiException: ERROR_WRONG_USER_KEY
```

**Cause:** API key validation is enabled in CapSkip but the key is wrong.

**Fix**

1. Copy the exact API key from CapSkip Settings.
2. Pass it to the SDK:

```js
const solver = new CapSkip({ apiKey: 'your-actual-key' });
```

Or disable API key validation in CapSkip Settings (development only).

---

## ApiException — ERROR_BAD_PARAMETERS

**Symptom**

```
ApiException: ERROR_BAD_PARAMETERS
```

**Cause:** Missing or invalid API parameters.

**Fix**

- **reCAPTCHA:** ensure `sitekey` and `url` are correct.
- **Turnstile challenge page:** include `data` and `pagedata` if required.
- **Image captcha:** ensure the file exists or the base64 string is valid.

---

## ValidationException — File not found

**Symptom**

```
ValidationException: File not found: captcha.png
```

**Fix**

- Use an absolute path or verify the working directory.
- For base64, pass a string with no file extension and length > 50, or use a data-URI:

```js
await solver.normal('data:image/png;base64,iVBORw0KGgo...');
```

---

## reCAPTCHA token rejected by target site

**Symptom:** SDK returns a token, but the website rejects it.

**Possible causes & fixes**

| Cause | Fix |
|---|---|
| Wrong `sitekey` or `pageurl` | Must match the exact page where the widget loads |
| IP mismatch | Use the same proxy for solving and submitting the form |
| Enterprise / invisible flag wrong | Set `enterprise: 1` or `invisible: 1` if the page uses them |
| v3 action mismatch | Pass the correct `action` from `grecaptcha.execute()` |
| Token expired | Use the token immediately after receiving it |

**Proxy example (same IP for solve and submit):**

```js
const proxy = { type: 'HTTP', uri: '1.2.3.4:3128' };
const result = await solver.recaptcha('...', '...', { proxy });
// submit form using the same proxy
```

---

## Turnstile challenge page — token works but page still blocks

**Symptom:** Token received but Cloudflare still challenges.

**Fix:** For challenge pages, CapSkip returns a User-Agent that must be used when submitting the token. The SDK returns it as `result.userAgent` — set it as the `User-Agent` header when you submit the `cf-turnstile-response` token.

---

## NetworkException during manual polling

**Symptom:** `getResult()` keeps rejecting with `NetworkException`.

**This is expected** while the captcha is still processing. Catch it and retry:

```js
const { NetworkException } = require('capskip');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
```

---

## Import errors after install

```bash
npm install capskip@latest
node -e "console.log(require('capskip').version)"
```

Make sure you are on Node.js 18 or newer:

```bash
node --version
```

---

## Still stuck?

1. [CapSkip API docs](https://capskip.com/api-docs/)
2. [GitHub Issues](https://github.com/capskip/capskip-node/issues)
3. CapSkip support: support@capskip.com

When opening an issue, include:

- Node.js version (`node --version`)
- SDK version (`node -e "console.log(require('capskip').version)"`)
- CapSkip port and captcha type
- Full error / stack trace (redact sitekeys/tokens)
