'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://mysite.com/page/with/captchafox';
const SITEKEY = 'sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G';
const TOKEN = '177f50c25b845601e5c779cdb51b040d523e8ab69efb4d5b343e28df07d05076';

// The UA the browser actually minted the token under. CapSkip never applies the
// caller's own, so these two must stay distinguishable in the tests below.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const CALLER_UA = "Mozilla/5.0 (the caller's own UA)";

const MAM_API_SERVER = 'https://s.uicdn.com/mampkg/@mamdev/core.frontend.libs.captchafox/';

// Mock client returning a realistic CaptchaFox answer (a token plus the UA).
class CaptchaFoxApiClient {
  constructor(userAgent = BROWSER_UA) {
    this.userAgent = userAgent;
  }

  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    this.incomings = fields;
    this.incomingFiles = files;
    return 'OK|123';
  }

  async res(params = {}) {
    if (params.json === 1 || params.json === '1') {
      const payload = {
        status: 1,
        request: TOKEN,
        solution: { token: TOKEN },
      };
      if (this.userAgent) {
        payload.userAgent = this.userAgent;
        payload.solution.userAgent = this.userAgent;
      }
      return JSON.stringify(payload);
    }
    return `OK|${TOKEN}`;
  }
}

function makeSolver(userAgent) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new CaptchaFoxApiClient(userAgent);
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

// -- what goes out ----------------------------------------------------------

test('captchafox submits the documented parameters', async () => {
  const solver = makeSolver();

  const result = await solver.captchafox(SITEKEY, URL);

  assertSent(solver, {
    method: 'captchafox',
    sitekey: SITEKEY,
    pageurl: URL,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('captchafox forwards the MAM widget source', async () => {
  // The widget source decides the token format: the MAM package returns a MAM_
  // prefixed token, and sending the wrong one fails silently at the target site
  // rather than erroring here.
  const solver = makeSolver();

  await solver.captchafox(SITEKEY, URL, { api_server: MAM_API_SERVER });
  assert.strictEqual(solver.apiClient.incomings.api_server, MAM_API_SERVER);

  await solver.captchafox(SITEKEY, URL, { apiServer: MAM_API_SERVER });
  assert.strictEqual(solver.apiClient.incomings.api_server, MAM_API_SERVER);
});

test('captchafox forwards useragent and its camelCase alias', async () => {
  const solver = makeSolver();

  await solver.captchafox(SITEKEY, URL, { useragent: CALLER_UA });
  assert.strictEqual(solver.apiClient.incomings.useragent, CALLER_UA);

  await solver.captchafox(SITEKEY, URL, { userAgent: CALLER_UA });
  assert.strictEqual(solver.apiClient.incomings.useragent, CALLER_UA);
  assert.ok(!('userAgent' in solver.apiClient.incomings));
});

test('captchafox does not send an unset optional', async () => {
  const solver = makeSolver();

  await solver.captchafox(SITEKEY, URL, { api_server: undefined, useragent: null });

  assertSent(solver, {
    method: 'captchafox',
    sitekey: SITEKEY,
    pageurl: URL,
  });
});

test('captchafox splits a proxy object into proxy and proxytype', async () => {
  const solver = makeSolver();

  await solver.captchafox(SITEKEY, URL, {
    proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  });

  assertSent(solver, {
    method: 'captchafox',
    sitekey: SITEKEY,
    pageurl: URL,
    proxy: 'login:password@1.2.3.4:8080',
    proxytype: 'HTTP',
  });
});

test('captchafox defaults a bare proxy string to HTTP', async () => {
  const solver = makeSolver();

  await solver.captchafox(SITEKEY, URL, { proxy: '1.2.3.4:8080' });

  assert.strictEqual(solver.apiClient.incomings.proxytype, 'HTTP');
});

// -- what is refused before it costs a round-trip ---------------------------

test('captchafox refuses a missing sitekey or pageurl', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.captchafox('', URL), ValidationException);
  await assert.rejects(() => solver.captchafox(SITEKEY, ''), ValidationException);
});

test('captchafox refuses an unknown parameter', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.captchafox(SITEKEY, URL, { version: 'v2' }),
    ValidationException,
  );
});

test('captchafox refuses SOCKS4 rather than silently going direct', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.captchafox(SITEKEY, URL, { proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }),
    ValidationException,
  );
});

// -- what comes back --------------------------------------------------------

test('captchafox exposes the token', async () => {
  const solver = makeSolver();

  const result = await solver.captchafox(SITEKEY, URL);

  assert.strictEqual(result.token, TOKEN);
  assert.strictEqual(result.code, TOKEN);
});

test('captchafox reports the user agent that minted the token', async () => {
  // Not the one the caller sent -- CapSkip solves in its own browser, and the
  // token has to be submitted under the UA that produced it.
  const solver = makeSolver();

  const result = await solver.captchafox(SITEKEY, URL, { useragent: CALLER_UA });

  assert.strictEqual(result.userAgent, BROWSER_UA);
  assert.notStrictEqual(result.userAgent, CALLER_UA);
});

test('captchafox omits the user agent when the solve reported none', async () => {
  // A UA the solve did not actually use must never be invented.
  const solver = makeSolver(null);

  const result = await solver.captchafox(SITEKEY, URL);

  assert.ok(!('userAgent' in result));
  assert.strictEqual(result.token, TOKEN);
});

test('captchafox does not leak the solution object to the caller', async () => {
  const solver = makeSolver();

  const result = await solver.captchafox(SITEKEY, URL);

  assert.ok(!('solution' in result));
});

test('captchafox reads the token from solution when request is empty', async () => {
  // A client must never be left without the token the poll carried.
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = {
    async in_(options = {}) {
      const { files = {}, ...fields } = options;
      this.incomings = fields;
      return 'OK|123';
    },
    async res() {
      return JSON.stringify({ status: 1, request: '', solution: { token: TOKEN } });
    },
  };

  const result = await solver.captchafox(SITEKEY, URL);

  assert.strictEqual(result.token, TOKEN);
});
