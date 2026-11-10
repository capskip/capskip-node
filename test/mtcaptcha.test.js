'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://2captcha.com/demo/mtcaptcha';
const SITEKEY = 'MTPublic-KzqLY1cKH';
const TOKEN = 'v1(0f3c9e2a,7b1d4c88,MTPublic-KzqLY1cKH,5e0c2a9f61d84b37a0c1e9b2d6f4a873,'
  + 'Qm9ndXNUb2tlbkZvclRlc3RzT25seV9fTm90QVJlYWxNVENhcHRjaGFUb2tlbi1BYkNkRWZHaA**)';
const CALLER_UA = 'Mozilla/5.0 (caller)';

// Mock client answering as CapSkip's res.php does for MTCaptcha:
// { status, request: token } with json=1, OK|token without.
class MtCaptchaApiClient {
  constructor(jsonReply = null) {
    this.jsonReply = jsonReply;
    this.polls = [];
  }

  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    this.incomings = fields;
    this.incomingFiles = files;
    return 'OK|123';
  }

  async res(params = {}) {
    this.polls.push(params);
    if (params.json === 1 || params.json === '1') {
      return JSON.stringify(this.jsonReply || { status: 1, request: TOKEN });
    }
    return `OK|${TOKEN}`;
  }
}

function makeSolver(jsonReply) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new MtCaptchaApiClient(jsonReply);
  return solver;
}

function solve(solver, options = {}) {
  return solver.mtcaptcha(SITEKEY, URL, options);
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

const MINIMAL = { method: 'mt_captcha', sitekey: SITEKEY, pageurl: URL };

// -- what goes out ----------------------------------------------------------

test('mtcaptcha submits the minimal task', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assertSent(solver, MINIMAL);
  assert.strictEqual(result.captchaId, '123');
});

test('mtcaptcha sends every option', async () => {
  const solver = makeSolver();

  await solve(solver, {
    action: 'login',
    userAgent: CALLER_UA,
    proxy: { type: 'HTTPS', uri: 'login:password@203.0.113.7:3128' },
  });

  assertSent(solver, {
    ...MINIMAL,
    action: 'login',
    useragent: CALLER_UA,
    proxy: 'login:password@203.0.113.7:3128',
    proxytype: 'HTTPS',
  });
});

test('mtcaptcha accepts pageurl in options in place of url', async () => {
  const solver = makeSolver();

  await solver.mtcaptcha(SITEKEY, undefined, { pageurl: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);

  await solver.mtcaptcha(SITEKEY, null, { url: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);
});

test('mtcaptcha accepts the useragent and user_agent spellings', async () => {
  const solver = makeSolver();

  for (const key of ['useragent', 'user_agent']) {
    await solve(solver, { [key]: CALLER_UA });
    const sent = solver.apiClient.incomings;
    assert.strictEqual(sent.useragent, CALLER_UA);
    if (key !== 'useragent') {
      assert.ok(!(key in sent));
    }
  }
});

test('mtcaptcha strips an sk= prefix and whitespace from the sitekey', async () => {
  // MTCaptcha's getchallenge query names the key sk=MTPublic-...; callers copy it.
  const solver = makeSolver();
  for (const value of [`sk=${SITEKEY}`, ` SK=${SITEKEY} `, `  ${SITEKEY}`, `sk= ${SITEKEY}`]) {
    await solver.mtcaptcha(value, URL);
    assert.strictEqual(solver.apiClient.incomings.sitekey, SITEKEY, JSON.stringify(value));
  }
});

test('mtcaptcha does not send unset optionals', async () => {
  const solver = makeSolver();

  await solve(solver, { action: undefined, userAgent: null, proxy: null });

  assertSent(solver, MINIMAL);
});

test('mtcaptcha does not send empty optionals', async () => {
  const solver = makeSolver();

  await solve(solver, { action: '', userAgent: '', proxy: '' });

  assertSent(solver, MINIMAL);
});

test('mtcaptcha defaults a bare proxy string to HTTP', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: '203.0.113.7:8080' });

  assert.strictEqual(solver.apiClient.incomings.proxy, '203.0.113.7:8080');
  assert.strictEqual(solver.apiClient.incomings.proxytype, 'HTTP');
});

test('mtcaptcha accepts the mtcaptcha method spelling through send', async () => {
  const solver = makeSolver();

  await solver.send({ method: 'mtcaptcha', sitekey: `sk=${SITEKEY}`, url: URL });

  assertSent(solver, { ...MINIMAL, method: 'mtcaptcha' });
});

// -- what is refused before it costs a round-trip ---------------------------

test('mtcaptcha refuses a missing or blank sitekey', async () => {
  const solver = makeSolver();
  for (const sitekey of [undefined, null, '', '   ', 'sk=']) {
    await assert.rejects(() => solver.mtcaptcha(sitekey, URL), ValidationException, String(sitekey));
  }
});

test('mtcaptcha refuses a malformed sitekey', async () => {
  const solver = makeSolver();
  const bad = [
    'KzqLY1cKH',
    'MTPublic-',
    'mtpublic-KzqLY1cKH',
    'MTPublic-Kzq LY1',
    'MTPublic-Kzq.LY1',
    `MTPublic-${'a'.repeat(56)}`,
    12345,
  ];
  for (const sitekey of bad) {
    await assert.rejects(() => solver.mtcaptcha(sitekey, URL), ValidationException, String(sitekey));
  }
});

test('mtcaptcha accepts the longest sitekey', async () => {
  const solver = makeSolver();
  const sitekey = `MTPublic-${'a'.repeat(55)}`;

  await solver.mtcaptcha(sitekey, URL);

  assert.strictEqual(solver.apiClient.incomings.sitekey, sitekey);
});

test('mtcaptcha refuses a missing pageurl', async () => {
  const solver = makeSolver();
  for (const url of [undefined, null, '', '   ']) {
    await assert.rejects(() => solver.mtcaptcha(SITEKEY, url), ValidationException);
  }
});

test('mtcaptcha refuses a pageurl that is not absolute http(s)', async () => {
  const solver = makeSolver();
  for (const url of ['2captcha.com/demo/mtcaptcha', 'ftp://example.com/', 'https://']) {
    await assert.rejects(() => solver.mtcaptcha(SITEKEY, url), ValidationException, url);
  }
});

test('mtcaptcha refuses unknown parameters', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solve(solver, { invisible: 1 }), ValidationException);
  await assert.rejects(() => solve(solver, { domain: 'service.mtcaptcha.com' }), ValidationException);
});

test('mtcaptcha refuses a SOCKS4 proxy', async () => {
  const solver = makeSolver();
  await assert.rejects(
    () => solve(solver, { proxy: { type: 'SOCKS4', uri: '203.0.113.7:1080' } }),
    ValidationException,
  );
});

test('mtcaptcha sends nothing when refused', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.mtcaptcha('nope', URL), ValidationException);
  await assert.rejects(() => solver.mtcaptcha(SITEKEY, 'ftp://example.com/'), ValidationException);
  await assert.rejects(() => solve(solver, { invisible: 1 }), ValidationException);

  assert.strictEqual(solver.apiClient.incomings, undefined);
});

// -- what comes back --------------------------------------------------------

test('mtcaptcha exposes the token as code and token', async () => {
  const result = await solve(makeSolver());

  assert.strictEqual(result.code, TOKEN);
  assert.strictEqual(result.token, TOKEN);
  assert.ok(!('solution' in result));
});

test('mtcaptcha fills an empty request from solution.token', async () => {
  const result = await solve(makeSolver({ status: 1, request: '', solution: { token: TOKEN } }));

  assert.strictEqual(result.code, TOKEN);
  assert.strictEqual(result.token, TOKEN);
  assert.ok(!('solution' in result));
});

test('mtcaptcha polls with json=1', async () => {
  const solver = makeSolver();

  await solve(solver);

  assert.strictEqual(solver.apiClient.polls[0].json, 1);
});

function recordTimeout(solver) {
  const seen = {};
  const original = solver.waitResult.bind(solver);
  solver.waitResult = (id, timeout, pollingInterval, json) => {
    seen.timeout = timeout;
    return original(id, timeout, pollingInterval, json);
  };
  return seen;
}

test('mtcaptcha uses the default timeout', async () => {
  // No browser runs, so MTCaptcha keeps the default timeout like ALTCHA.
  const solver = makeSolver();
  solver.defaultTimeout = 77;
  solver.recaptchaTimeout = 321;
  const seen = recordTimeout(solver);

  await solve(solver);

  assert.strictEqual(seen.timeout, 77);
});

test('mtcaptcha explicit timeout wins', async () => {
  const solver = makeSolver();
  const seen = recordTimeout(solver);

  await solve(solver, { timeout: 42 });

  assert.strictEqual(seen.timeout, 42);
});
