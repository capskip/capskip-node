'use strict';

// End-to-end tests driving the real HTTP layer against a local mock server.

const {
  test, before, after,
} = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CapSkip, ApiClient,
  ApiException, NetworkException, TimeoutException,
} = require('../src');
const {
  startMockServer, CODE, USER_AGENT, PNG, ALTCHA_TOKEN, ALTCHA_NUMBER,
  CAPY_SOLUTION, CAPTCHAFOX_TOKEN, CAPTCHAFOX_USER_AGENT, FRIENDLY_CAPTCHA_TOKEN,
} = require('./helpers/mockServer');

const SITEKEY = '6Le-wvkSVVABCPBMRTvw0Q4Muexq1bi0DJwx_mJ-';
const TS_SITEKEY = '0x4AAAAAAABUYP0XeMJF0xoy';
const URL = 'https://example.com';
const B64 = PNG.toString('base64');

let server;
let host;
let port;

before(async () => {
  ({ server, host, port } = await startMockServer());
});

after(() => new Promise((resolve) => server.close(resolve)));

function makeSolver(overrides = {}) {
  return new CapSkip({
    apiKey: 'capskip', host, port, pollingInterval: 1, ...overrides,
  });
}

function writeImage() {
  const file = path.join(os.tmpdir(), `capskip-${process.pid}-${Date.now()}.png`);
  fs.writeFileSync(file, PNG);
  return file;
}

test('normal: local file upload', async () => {
  const solver = makeSolver();
  const file = writeImage();
  try {
    const result = await solver.normal(file);
    assert.strictEqual(result.code, CODE);
    assert.ok(result.captchaId);
  } finally {
    fs.unlinkSync(file);
  }
});

test('normal: base64 string', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.normal(B64)).code, CODE);
});

test('normal: data-URI', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.normal(`data:image/png;base64,${B64}`)).code, CODE);
});

test('normal: downloads from a URL', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.normal(`http://${host}:${port}/image.png`)).code, CODE);
});

test('normal: json=1 submit response', async () => {
  // json=1 makes in.php return a JSON submit response; the SDK must parse it.
  const solver = makeSolver();
  assert.strictEqual((await solver.normal(B64, { json: 1 })).code, CODE);
});

test('recaptcha: v2', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.recaptcha(SITEKEY, URL)).code, CODE);
});

test('recaptcha: v2 invisible', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.recaptcha(SITEKEY, URL, { invisible: 1 })).code, CODE);
});

test('recaptcha: v2 enterprise', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.recaptcha(SITEKEY, URL, { enterprise: 1 })).code, CODE);
});

test('recaptcha: v3', async () => {
  const solver = makeSolver();
  const result = await solver.recaptcha(SITEKEY, URL, { version: 'v3', action: 'submit', score: 0.7 });
  assert.strictEqual(result.code, CODE);
});

test('recaptcha: proxy', async () => {
  const solver = makeSolver();
  const result = await solver.recaptcha(SITEKEY, URL, {
    proxy: { type: 'HTTPS', uri: 'user:pass@1.2.3.4:3128' },
  });
  assert.strictEqual(result.code, CODE);
});

test('turnstile: widget returns code + userAgent', async () => {
  const solver = makeSolver();
  const result = await solver.turnstile(TS_SITEKEY, URL);
  assert.strictEqual(result.code, CODE);
  assert.strictEqual(result.userAgent, USER_AGENT);
});

test('turnstile: challenge page', async () => {
  const solver = makeSolver();
  const result = await solver.turnstile(TS_SITEKEY, URL, {
    action: 'managed', data: 'cdata', pagedata: 'chlpd',
  });
  assert.strictEqual(result.code, CODE);
  assert.strictEqual(result.userAgent, USER_AGENT);
});

test('polling retries then solves', async () => {
  const solver = makeSolver();
  assert.strictEqual((await solver.recaptcha(SITEKEY, `${URL}/slow`)).code, CODE);
});

test('polling survives empty responses', async () => {
  // Regression: CapSkip returns an empty body before a result is ready; the
  // SDK must keep polling instead of raising "cannot recognize response".
  const solver = makeSolver();
  assert.strictEqual((await solver.recaptcha(SITEKEY, `${URL}/empty`)).code, CODE);
});

test('manual send + getResult', async () => {
  const solver = makeSolver();
  const cid = await solver.send({ method: 'userrecaptcha', googlekey: SITEKEY, pageurl: URL });
  assert.ok(cid);
  assert.strictEqual(await solver.getResult(cid), CODE);
});

test('timeout raises TimeoutException', async () => {
  const solver = makeSolver({ recaptchaTimeout: 2 });
  await assert.rejects(solver.recaptcha(SITEKEY, `${URL}/never`), TimeoutException);
});

test('bad API key raises ApiException', async () => {
  const solver = makeSolver({ apiKey: 'badkey' });
  await assert.rejects(solver.recaptcha(SITEKEY, URL), ApiException);
});

test('connection refused raises NetworkException', async () => {
  const solver = new CapSkip({
    host: '127.0.0.1', port: 1, defaultTimeout: 2, pollingInterval: 1,
  });
  await assert.rejects(
    solver.send({ method: 'userrecaptcha', googlekey: SITEKEY, pageurl: URL }),
    NetworkException,
  );
});

test('low-level ApiClient', async () => {
  const client = new ApiClient({ host, port });
  const resp = await client.in_({
    method: 'turnstile', key: 'capskip', sitekey: TS_SITEKEY, pageurl: URL,
  });
  assert.ok(resp.startsWith('OK|'));
  const polled = await client.res({
    key: 'capskip', action: 'get', id: resp.slice(3), json: 1,
  });
  assert.ok(polled.includes(CODE));
});

test('concurrent solves', async () => {
  const solver = makeSolver();
  const results = await Promise.all([
    solver.recaptcha(SITEKEY, URL),
    solver.turnstile(TS_SITEKEY, URL),
  ]);
  assert.ok(results.every((r) => r.code === CODE));
});

const CHALLENGE_URL = 'https://example.com/captcha/api/altcha/challenge';
const CHALLENGE_DOC = {
  algorithm: 'SHA-256',
  challenge: '3dd28253be6cc0c54d95f7f98c517e68',
  salt: '46d5b1c8871e5152d902ee3f?expires=1893456000',
  signature: '4b1cf0e0be0f4e5247e50b0f9a449830',
  maxnumber: 1000000,
};

test('altcha over HTTP with a challenge url', async () => {
  const solver = makeSolver();
  const r = await solver.altcha(URL, { challengeUrl: CHALLENGE_URL });
  assert.strictEqual(r.code, ALTCHA_TOKEN);
  assert.strictEqual(r.token, ALTCHA_TOKEN);
  assert.strictEqual(r.number, ALTCHA_NUMBER);
  assert.ok(r.captchaId);
});

test('altcha over HTTP with an inline challenge object', async () => {
  // An object has to reach the server as JSON, not as "[object Object]", or the
  // server answers ERROR_BAD_PARAMETERS.
  const solver = makeSolver();
  const r = await solver.altcha(URL, { challengeJson: CHALLENGE_DOC });
  assert.strictEqual(r.number, ALTCHA_NUMBER);
});

// -- Capy -------------------------------------------------------------------

const CAPY_KEY = 'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v';
const FOX_SITEKEY = 'sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G';
const FRIENDLY_SITEKEY = 'FCMGEMUD2M567T8G';

test('capy over HTTP', async () => {
  const solver = makeSolver();
  const r = await solver.capy(CAPY_KEY, URL);
  assert.strictEqual(r.captchakey, CAPY_SOLUTION.captchakey);
  assert.strictEqual(r.challengekey, CAPY_SOLUTION.challengekey);
  assert.strictEqual(r.answer, CAPY_SOLUTION.answer);
  assert.ok(r.captchaId);
});

test('capy answer crosses the wire unchanged', async () => {
  // The answer is the drag path the widget would have recorded; the target site
  // verifies it against the challenge it issued, so any edit breaks it.
  const solver = makeSolver();
  const r = await solver.capy(CAPY_KEY, URL, { api_server: 'https://jp.api.capy.me/' });
  assert.strictEqual(r.answer, CAPY_SOLUTION.answer);
});

test('capy refuses the avatar version locally', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solver.capy(CAPY_KEY, URL, { version: 'avatar' }));
});

// -- CaptchaFox --------------------------------------------------------------

test('captchafox over HTTP', async () => {
  const solver = makeSolver();
  const r = await solver.captchafox(FOX_SITEKEY, URL);
  assert.strictEqual(r.code, CAPTCHAFOX_TOKEN);
  assert.strictEqual(r.token, CAPTCHAFOX_TOKEN);
  assert.ok(r.captchaId);
});

test('captchafox reports the browser user agent', async () => {
  // Not the one sent: CapSkip solves in its own browser, and the token has to
  // be submitted under the UA that minted it.
  const solver = makeSolver();
  const callerUa = 'Mozilla/5.0 (the caller own UA)';
  const r = await solver.captchafox(FOX_SITEKEY, URL, { useragent: callerUa });
  assert.strictEqual(r.userAgent, CAPTCHAFOX_USER_AGENT);
  assert.notStrictEqual(r.userAgent, callerUa);
});

test('captchafox without a sitekey is refused locally', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solver.captchafox('', URL));
});

// -- Friendly Captcha --------------------------------------------------------

test('friendlyCaptcha over HTTP', async () => {
  const solver = makeSolver();
  const r = await solver.friendlyCaptcha(FRIENDLY_SITEKEY, URL, { version: 'v1' });
  assert.strictEqual(r.code, FRIENDLY_CAPTCHA_TOKEN);
  assert.strictEqual(r.token, FRIENDLY_CAPTCHA_TOKEN);
  assert.ok(r.captchaId);
});

test('friendlyCaptcha token survives the wire verbatim', async () => {
  // The token carries base64 padding and slashes; form encoding must round-trip
  // them, or the target site rejects a token that looks fine.
  const solver = makeSolver();
  const r = await solver.friendlyCaptcha(FRIENDLY_SITEKEY, URL, {
    moduleScript: 'https://cdn.example.com/site.min.js',
  });
  assert.strictEqual(r.token, FRIENDLY_CAPTCHA_TOKEN);
  assert.ok(r.token.includes('/') && r.token.includes('='));
});

test('friendlyCaptcha with a bad version is refused locally', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solver.friendlyCaptcha(FRIENDLY_SITEKEY, URL, { version: 'v3' }));
});
