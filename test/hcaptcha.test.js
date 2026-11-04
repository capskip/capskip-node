'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { applyHCaptchaSolution } = require('../src/solver');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://accounts.hcaptcha.com/demo';
const SITEKEY = 'a5f74b19-9e45-40e0-b45d-47ff91b7a6c2';
const TOKEN = 'P1_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.hadwYXNza2V5xQZ2f3Kq8nV2';
const RESP_KEY = 'E0_eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJpZCI6IjA09wB1';
const RQDATA = 'Wk2qT7bX+fV9rL0pZ3mN8cJ1hYsD6uE4gA5oR2iK/0=';

// The UA the browser earned the token with, as CapSkip reports it. Kept apart
// from the caller's own so a test can tell which one came back.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';
const CALLER_UA = 'Mozilla/5.0 (the caller own UA)';

// Mock client answering as CapSkip's res.php does for hCaptcha with json=1:
// { status, request: token, respKey, useragent }.
class HCaptchaApiClient {
  // `respKey: null` leaves the field out of the reply altogether.
  constructor({ respKey = RESP_KEY, userAgent = BROWSER_UA } = {}) {
    this.respKey = respKey;
    this.userAgent = userAgent;
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
      const payload = { status: 1, request: TOKEN };
      if (this.respKey !== null) {
        payload.respKey = this.respKey;
      }
      if (this.userAgent) {
        payload.useragent = this.userAgent;
      }
      return JSON.stringify(payload);
    }
    return `OK|${TOKEN}`;
  }
}

function makeSolver(clientOptions) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new HCaptchaApiClient(clientOptions);
  return solver;
}

function solve(solver, options = {}) {
  return solver.hcaptcha(SITEKEY, URL, options);
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

const MINIMAL = { method: 'hcaptcha', sitekey: SITEKEY, pageurl: URL };

// -- what goes out ----------------------------------------------------------

test('hcaptcha submits the minimal task', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assertSent(solver, MINIMAL);
  assert.strictEqual(result.captchaId, '123');
});

test('hcaptcha accepts pageurl in options in place of url', async () => {
  const solver = makeSolver();

  await solver.hcaptcha(SITEKEY, undefined, { pageurl: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);

  await solver.hcaptcha(SITEKEY, null, { url: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);
});

test('hcaptcha sends every truthy invisible as 1', async () => {
  const solver = makeSolver();
  for (const value of [1, true, '1', 'true', 'TRUE', 'True']) {
    await solve(solver, { invisible: value });
    assert.strictEqual(solver.apiClient.incomings.invisible, 1, `invisible: ${JSON.stringify(value)}`);
  }
});

test('hcaptcha does not send invisible when it is off', async () => {
  // 0 is the server's default; a boolean false must not reach it as 'false'.
  const solver = makeSolver();
  for (const value of [0, false, '0', 'false', 'FALSE']) {
    await solve(solver, { invisible: value });
    assert.ok(!('invisible' in solver.apiClient.incomings), `invisible: ${JSON.stringify(value)}`);
  }
});

test('hcaptcha refuses a bad invisible', async () => {
  const solver = makeSolver();
  for (const value of [2, 'yes', 'invisible', {}, [1]]) {
    await assert.rejects(() => solve(solver, { invisible: value }), ValidationException);
  }
});

test('hcaptcha sends Enterprise rqdata as data', async () => {
  const solver = makeSolver();

  await solve(solver, { data: RQDATA });

  assert.strictEqual(solver.apiClient.incomings.data, RQDATA);
});

test('hcaptcha forwards useragent', async () => {
  const solver = makeSolver();

  await solve(solver, { useragent: CALLER_UA });

  assert.strictEqual(solver.apiClient.incomings.useragent, CALLER_UA);
});

test('hcaptcha accepts the camel-case and snake-case userAgent aliases', async () => {
  const solver = makeSolver();

  for (const key of ['userAgent', 'user_agent']) {
    await solve(solver, { [key]: CALLER_UA });
    const sent = solver.apiClient.incomings;
    assert.strictEqual(sent.useragent, CALLER_UA);
    assert.ok(!(key in sent));
  }
});

test('hcaptcha does not send unset optionals', async () => {
  const solver = makeSolver();

  await solve(solver, {
    invisible: undefined, data: null, userAgent: undefined, proxy: null,
  });

  assertSent(solver, MINIMAL);
});

test('hcaptcha does not send empty optionals', async () => {
  const solver = makeSolver();

  await solve(solver, {
    invisible: '', data: '', userAgent: '', proxy: '',
  });

  assertSent(solver, MINIMAL);
});

test('hcaptcha sends a proxy object', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: { type: 'SOCKS5', uri: 'login:password@1.2.3.4:1080' } });

  assertSent(solver, {
    ...MINIMAL,
    proxy: 'login:password@1.2.3.4:1080',
    proxytype: 'SOCKS5',
  });
});

test('hcaptcha defaults a bare proxy string to HTTP', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: '1.2.3.4:8080' });

  assert.strictEqual(solver.apiClient.incomings.proxy, '1.2.3.4:8080');
  assert.strictEqual(solver.apiClient.incomings.proxytype, 'HTTP');
});

test('hcaptcha sends everything together', async () => {
  const solver = makeSolver();

  await solve(solver, {
    invisible: 1,
    data: RQDATA,
    userAgent: CALLER_UA,
    proxy: { type: 'HTTPS', uri: '1.2.3.4:8080' },
    json: 1,
  });

  assertSent(solver, {
    ...MINIMAL,
    invisible: 1,
    data: RQDATA,
    useragent: CALLER_UA,
    proxy: '1.2.3.4:8080',
    proxytype: 'HTTPS',
    json: 1,
  });
});

// -- what is refused before it costs a round-trip ---------------------------

test('hcaptcha refuses a missing or blank sitekey', async () => {
  const solver = makeSolver();
  for (const sitekey of [undefined, null, '', '   ']) {
    await assert.rejects(() => solver.hcaptcha(sitekey, URL), ValidationException);
  }
});

test('hcaptcha refuses a missing pageurl', async () => {
  const solver = makeSolver();
  for (const url of [undefined, null, '', '   ']) {
    await assert.rejects(() => solver.hcaptcha(SITEKEY, url), ValidationException);
  }
});

test('hcaptcha refuses a pageurl that is not absolute http(s)', async () => {
  const solver = makeSolver();
  for (const url of ['accounts.hcaptcha.com/demo', 'ftp://example.com/', 'javascript:alert(1)']) {
    await assert.rejects(() => solver.hcaptcha(SITEKEY, url), ValidationException, url);
  }
});

test('hcaptcha refuses unknown parameters', async () => {
  // 2Captcha's `domain` is not part of CapSkip's hCaptcha API.
  const solver = makeSolver();
  await assert.rejects(() => solve(solver, { domain: 'js.hcaptcha.com' }), ValidationException);
  await assert.rejects(() => solve(solver, { enterprise: 1 }), ValidationException);
});

test('hcaptcha refuses a SOCKS4 proxy', async () => {
  const solver = makeSolver();
  await assert.rejects(
    () => solve(solver, { proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }),
    ValidationException,
  );
});

test('hcaptcha sends nothing when refused', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.hcaptcha('', URL), ValidationException);
  await assert.rejects(() => solver.hcaptcha(SITEKEY, 'ftp://example.com/'), ValidationException);
  await assert.rejects(() => solve(solver, { invisible: 'yes' }), ValidationException);

  assert.strictEqual(solver.apiClient.incomings, undefined);
});

// -- what comes back --------------------------------------------------------

test('hcaptcha exposes the token as token and code', async () => {
  const result = await solve(makeSolver());

  assert.strictEqual(result.token, TOKEN);
  assert.strictEqual(result.code, TOKEN);
});

test('hcaptcha exposes respKey', async () => {
  const result = await solve(makeSolver());

  assert.strictEqual(result.respKey, RESP_KEY);
});

test('hcaptcha keeps an empty respKey empty', async () => {
  const result = await solve(makeSolver({ respKey: '' }));

  assert.strictEqual(result.respKey, '');
  assert.strictEqual(result.token, TOKEN);
});

test('hcaptcha result carries respKey even when the reply has none', async () => {
  const result = await solve(makeSolver({ respKey: null }));

  assert.strictEqual(result.respKey, '');
  assert.ok(Object.prototype.hasOwnProperty.call(result, 'respKey'));
});

test('hcaptcha result carries the User-Agent that earned the token', async () => {
  const result = await solve(makeSolver(), { userAgent: CALLER_UA });

  assert.strictEqual(result.userAgent, BROWSER_UA);
});

test('hcaptcha result has no userAgent when the solve reported none', async () => {
  const result = await solve(makeSolver({ userAgent: null }));

  assert.ok(!('userAgent' in result));
});

test('hcaptcha polls with json=1', async () => {
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

test('hcaptcha uses the browser timeout', async () => {
  const solver = makeSolver();
  solver.recaptchaTimeout = 321;
  const seen = recordTimeout(solver);

  await solve(solver);

  assert.strictEqual(seen.timeout, 321);
});

test('hcaptcha explicit timeout wins', async () => {
  const solver = makeSolver();
  const seen = recordTimeout(solver);

  await solve(solver, { timeout: 42 });

  assert.strictEqual(seen.timeout, 42);
});

test('applyHCaptchaSolution falls back to an empty respKey for a non-string', () => {
  const result = applyHCaptchaSolution({ captchaId: '1', code: TOKEN, respKey: null });

  assert.strictEqual(result.token, TOKEN);
  assert.strictEqual(result.respKey, '');
});
