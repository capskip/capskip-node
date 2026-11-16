'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://smartcaptcha.yandexcloud.net/demo';
const SITEKEY = 'ysc1_DAo8nFPdNCMHkAwYxIUJFxW5IIJd99BBfeeeee';
// base64 of t=...;i=203.0.113.25;D=...: shaped like a real token, carrying a
// documentation address.
const TOKEN = 'dD0xNzk0NDE5NTg3O2k9MjAzLjAuMTEzLjI1O0Q9QjQ1RjJBN0MxRTkwRDM2ODU0QzA1M0M3QTFF'
  + 'MkIzQzRENUU2RjcwODE5MkEzQjRDNUQ2RTdGODA5MUEyQjNDNEQ1RTZGNzA4MTt1PTE3OTQ0MTk1'
  + 'ODcxMjM0NTY3ODk7aD01ZjBjMmE5ZTYxZDg0YjM3YTBjMWU5YjJkNmY0YTg3Mw==';
const CALLER_UA = 'Mozilla/5.0 (caller)';

// Mock client answering as CapSkip's res.php does for a SmartCaptcha token:
// { status, request: token } with json=1, OK|token without.
class YandexApiClient {
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
  solver.apiClient = new YandexApiClient(jsonReply);
  return solver;
}

function solve(solver, options = {}) {
  return solver.yandexSmart(SITEKEY, URL, options);
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

const MINIMAL = { method: 'yandex', sitekey: SITEKEY, pageurl: URL };

// -- what goes out ----------------------------------------------------------

test('yandexSmart submits the minimal task', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assertSent(solver, MINIMAL);
  assert.strictEqual(result.captchaId, '123');
});

test('yandexSmart sends every option', async () => {
  const solver = makeSolver();

  await solve(solver, {
    userAgent: CALLER_UA,
    proxy: { type: 'SOCKS5', uri: 'login:password@203.0.113.7:1080' },
  });

  assertSent(solver, {
    ...MINIMAL,
    useragent: CALLER_UA,
    proxy: 'login:password@203.0.113.7:1080',
    proxytype: 'SOCKS5',
  });
});

test('yandexSmart accepts pageurl in options in place of url', async () => {
  const solver = makeSolver();

  await solver.yandexSmart(SITEKEY, undefined, { pageurl: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);

  await solver.yandexSmart(SITEKEY, null, { url: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);
});

test('yandexSmart accepts the useragent and user_agent spellings', async () => {
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

test('yandexSmart trims the sitekey', async () => {
  const solver = makeSolver();

  await solver.yandexSmart(`  ${SITEKEY}\n`, URL);

  assert.strictEqual(solver.apiClient.incomings.sitekey, SITEKEY);
});

test('yandexSmart accepts a sitekey without the ysc1_ prefix', async () => {
  // Older client keys carry no ysc1_ prefix; the server takes them.
  const solver = makeSolver();
  const sitekey = 'FEXfAbHQsToo97VidNVk3j4dC74nGW1DgdxjtNB9';

  await solver.yandexSmart(sitekey, URL);

  assert.strictEqual(solver.apiClient.incomings.sitekey, sitekey);
});

test('yandexSmart accepts the shortest and longest sitekeys', async () => {
  const solver = makeSolver();
  for (const sitekey of ['a'.repeat(16), 'a'.repeat(120)]) {
    await solver.yandexSmart(sitekey, URL);
    assert.strictEqual(solver.apiClient.incomings.sitekey, sitekey);
  }
});

test('yandexSmart does not send unset or empty optionals', async () => {
  const solver = makeSolver();

  await solve(solver, { userAgent: undefined, proxy: null });
  assertSent(solver, MINIMAL);

  await solve(solver, { userAgent: '', proxy: '' });
  assertSent(solver, MINIMAL);
});

test('yandexSmart defaults a bare proxy string to HTTP', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: '203.0.113.7:8080' });

  assert.strictEqual(solver.apiClient.incomings.proxy, '203.0.113.7:8080');
  assert.strictEqual(solver.apiClient.incomings.proxytype, 'HTTP');
});

// -- what is refused before it costs a round-trip ---------------------------

test('yandexSmart refuses a missing or blank sitekey', async () => {
  const solver = makeSolver();
  for (const sitekey of [undefined, null, '', '   ']) {
    await assert.rejects(() => solver.yandexSmart(sitekey, URL), ValidationException, String(sitekey));
  }
});

test('yandexSmart refuses a malformed sitekey', async () => {
  const solver = makeSolver();
  const bad = [
    'a'.repeat(15),
    'a'.repeat(121),
    'ysc1_has space in it',
    'ysc1_dotted.key.value',
    'ysc1_" onload="x',
    12345,
  ];
  for (const sitekey of bad) {
    await assert.rejects(() => solver.yandexSmart(sitekey, URL), ValidationException, String(sitekey));
  }
});

test('yandexSmart refuses a pageurl that is missing or not absolute http(s)', async () => {
  const solver = makeSolver();
  for (const url of [undefined, '', 'smartcaptcha.yandexcloud.net/demo', 'ftp://example.com/', 'https://']) {
    await assert.rejects(() => solver.yandexSmart(SITEKEY, url), ValidationException, String(url));
  }
});

test('yandexSmart refuses unknown parameters', async () => {
  const solver = makeSolver();
  for (const extra of [{ action: 'login' }, { img_type: 'smart_captcha' }]) {
    await assert.rejects(() => solve(solver, extra), ValidationException, JSON.stringify(extra));
  }
});

test('yandexSmart refuses a SOCKS4 proxy', async () => {
  const solver = makeSolver();
  await assert.rejects(
    () => solve(solver, { proxy: { type: 'SOCKS4', uri: '203.0.113.7:1080' } }),
    ValidationException,
  );
});

test('yandexSmart sends nothing when refused', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.yandexSmart('nope', URL), ValidationException);
  await assert.rejects(() => solver.yandexSmart(SITEKEY, 'ftp://example.com/'), ValidationException);
  await assert.rejects(() => solve(solver, { action: 'login' }), ValidationException);

  assert.strictEqual(solver.apiClient.incomings, undefined);
});

// -- what comes back --------------------------------------------------------

test('yandexSmart exposes the token as code and token', async () => {
  const result = await solve(makeSolver());

  assert.strictEqual(result.code, TOKEN);
  assert.strictEqual(result.token, TOKEN);
  assert.ok(!('solution' in result));
});

test('yandexSmart fills an empty request from solution.token', async () => {
  const result = await solve(makeSolver({ status: 1, request: '', solution: { token: TOKEN } }));

  assert.strictEqual(result.code, TOKEN);
  assert.strictEqual(result.token, TOKEN);
  assert.ok(!('solution' in result));
});

test('yandexSmart plain-text answer is the token', async () => {
  const solver = makeSolver();

  const id = await solver.send({ method: 'yandex', sitekey: SITEKEY, url: URL });

  assert.strictEqual(await solver.getResult(id), TOKEN);
});

test('yandexSmart polls with json=1', async () => {
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

test('yandexSmart uses the reCAPTCHA timeout', async () => {
  // The widget runs in a real browser, so it takes the longer timeout.
  const solver = makeSolver();
  solver.defaultTimeout = 77;
  solver.recaptchaTimeout = 321;
  const seen = recordTimeout(solver);

  await solve(solver);

  assert.strictEqual(seen.timeout, 321);
});

test('yandexSmart explicit timeout wins', async () => {
  const solver = makeSolver();
  const seen = recordTimeout(solver);

  await solve(solver, { timeout: 42 });

  assert.strictEqual(seen.timeout, 42);
});
