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
  AMAZON_WAF_SOLUTION, DATADOME_COOKIE, DATADOME_BROWSER_USER_AGENT, DATADOME_LIST_PROXY,
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

// -- AWS WAF -----------------------------------------------------------------

const WAF_KEY = 'AQIDAHjcYuEXAMPLEghicBgQ/7bFaQZ+m5FKCMDnO+vTbNg96AHDh0IR5vgzHNceHYqZR+GOAAAAfjB8';
const WAF_IV = 'CgAFRDIjfgAAA5yY';
const WAF_CONTEXT = 'Rbp3r8fvbuhmrCqpUe8Mh1TLvs8OSKJZiSs2vCF4dt9rxVZI7xYJa2n5k/9r+XaXe7KUIu2I8nXTDHHkDvIOTDc2';
const WAF_CHALLENGE_JS = 'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/challenge.js';
const WAF_WIDGET_KEY = 'Xr9kEXAMPLE2bWQx1vTq8LmZ0aYc4dHs7nFp3gJt6uKw5eRi9AbCdEfGh=_0_1';
const WAF_JSAPI = 'https://5b7e0a19c3d8.us-east-1.captcha-sdk.awswaf.com/5b7e0a19c3d8/jsapi.js';

function lastSubmission() {
  return server.submissions[server.submissions.length - 1];
}

test('amazonWaf over HTTP: challenge page', async () => {
  const solver = makeSolver();
  const r = await solver.amazonWaf(WAF_KEY, URL, {
    iv: WAF_IV, context: WAF_CONTEXT, challenge_script: WAF_CHALLENGE_JS,
  });
  assert.strictEqual(r.captcha_voucher, AMAZON_WAF_SOLUTION.captcha_voucher);
  assert.strictEqual(r.existing_token, AMAZON_WAF_SOLUTION.existing_token);
  assert.deepStrictEqual(r.code, AMAZON_WAF_SOLUTION);
  assert.ok(r.captchaId);
  assert.strictEqual(lastSubmission().challenge_script, WAF_CHALLENGE_JS);
});

test('amazonWaf over HTTP: widget page', async () => {
  const solver = makeSolver();
  const r = await solver.amazonWaf(WAF_WIDGET_KEY, URL, { jsapiScript: WAF_JSAPI });
  assert.strictEqual(r.captcha_voucher, AMAZON_WAF_SOLUTION.captcha_voucher);
  assert.strictEqual(r.existing_token, AMAZON_WAF_SOLUTION.existing_token);

  const sent = lastSubmission();
  assert.strictEqual(sent.method, 'amazon_waf');
  assert.strictEqual(sent.sitekey, WAF_WIDGET_KEY);
  assert.strictEqual(sent.jsapiScript, WAF_JSAPI);
  assert.ok(!('iv' in sent) && !('context' in sent));
});

test('amazonWaf keys with + / = cross the wire intact', async () => {
  // The keys carry +, / and =, which a form body has to URL-encode; a key
  // mangled on the way would be a different firewall configuration.
  const solver = makeSolver();
  const key = `${WAF_KEY}==`;
  const r = await solver.amazonWaf(key, URL, { iv: WAF_IV, context: WAF_CONTEXT });
  assert.strictEqual(r.existing_token, AMAZON_WAF_SOLUTION.existing_token);

  const sent = lastSubmission();
  assert.strictEqual(sent.sitekey, key);
  assert.strictEqual(sent.iv, WAF_IV);
  assert.strictEqual(sent.context, WAF_CONTEXT);
});

test('amazonWaf plain-text answer is one line of JSON', async () => {
  // Polled without json=1, the object arrives as a JSON string after OK|.
  const solver = makeSolver();
  const id = await solver.send({ method: 'amazon_waf', sitekey: WAF_KEY, pageurl: URL });
  const raw = await solver.getResult(id);
  assert.deepStrictEqual(JSON.parse(raw), AMAZON_WAF_SOLUTION);
});

test('amazonWaf with a lone iv is refused locally', async () => {
  const solver = makeSolver();
  const sentBefore = server.submissions.length;
  await assert.rejects(() => solver.amazonWaf(WAF_KEY, URL, { iv: WAF_IV }));
  assert.strictEqual(server.submissions.length, sentBefore);
});

test('amazonWaf with an off-AWS script is refused locally', async () => {
  const solver = makeSolver();
  const sentBefore = server.submissions.length;
  await assert.rejects(() => solver.amazonWaf(WAF_KEY, URL, {
    jsapiScript: 'https://evil.example/jsapi.js',
  }));
  assert.strictEqual(server.submissions.length, sentBefore);
});

// -- DataDome ----------------------------------------------------------------

const DD_PAGE = 'https://www.example.com/';
const DD_CAPTCHA_URL = 'https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMA7KBvCr0n4cEAG330MA%3D%3D'
  + '&hash=D013AA612AB2224D03B2318D0F5B19&cid=KzE6_pZBBTHdCdvZkauT9VAshi0wS7~v5_M_MacEtdw8'
  + '&t=fe&referer=https%3A%2F%2Fwww.example.com%2F&s=45225&e=549255a0289eaf17af60822309ab8db4&dm=cd';
const DD_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/156.0.0.1 Safari/537.36';
const DD_COOKIE_PAIR = DATADOME_COOKIE.split(';')[0];

test('dataDome without a proxy reports the list proxy', async () => {
  // No proxy sent: CapSkip solved through its own DataDome list, so the result
  // names that proxy and the browser's User-Agent.
  const solver = makeSolver();
  const r = await solver.dataDome(DD_CAPTCHA_URL, DD_PAGE);
  assert.strictEqual(r.code, DATADOME_COOKIE);
  assert.strictEqual(r.cookie, DD_COOKIE_PAIR);
  assert.strictEqual(r.userAgent, DATADOME_BROWSER_USER_AGENT);
  assert.strictEqual(r.proxy, DATADOME_LIST_PROXY);
  assert.ok(r.captchaId);

  const sent = lastSubmission();
  assert.strictEqual(sent.method, 'datadome');
  assert.strictEqual(sent.captcha_url, DD_CAPTCHA_URL);
  assert.strictEqual(sent.pageurl, DD_PAGE);
  assert.ok(!('proxy' in sent) && !('useragent' in sent));
});

test('dataDome with its own proxy and User-Agent', async () => {
  // A proxy sent with the task: no `proxy` comes back, and the User-Agent is
  // the one sent -- it crossed the wire intact, ~ ; ( ) and all.
  const solver = makeSolver();
  const r = await solver.dataDome(DD_CAPTCHA_URL, DD_PAGE, {
    userAgent: DD_USER_AGENT,
    proxy: { type: 'HTTP', uri: 'login:p%40ss@203.0.113.7:3128' },
  });
  assert.strictEqual(r.cookie, DD_COOKIE_PAIR);
  assert.strictEqual(r.userAgent, DD_USER_AGENT);
  assert.ok(!('proxy' in r));

  const sent = lastSubmission();
  assert.strictEqual(sent.useragent, DD_USER_AGENT);
  assert.strictEqual(sent.proxy, 'login:p%40ss@203.0.113.7:3128');
  assert.strictEqual(sent.proxytype, 'HTTP');
});

test('dataDome plain-text answer is the cookie as set', async () => {
  const solver = makeSolver();
  const id = await solver.send({ method: 'datadome', captcha_url: DD_CAPTCHA_URL, pageurl: DD_PAGE });
  assert.strictEqual(await solver.getResult(id), DATADOME_COOKIE);
});

test('dataDome with a banned block page is refused locally', async () => {
  const solver = makeSolver();
  const sentBefore = server.submissions.length;
  await assert.rejects(() => solver.dataDome(DD_CAPTCHA_URL.replace('t=fe', 't=bv'), DD_PAGE));
  assert.strictEqual(server.submissions.length, sentBefore);
});
