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
const { startMockServer, CODE, USER_AGENT, PNG } = require('./helpers/mockServer');

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
