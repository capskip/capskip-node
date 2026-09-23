'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://mysite.com/signup';
const SITEKEY = 'FCMGEMUD2M567T8G';

// A v1 token: four dot-separated parts, a few hundred characters.
const V1_TOKEN = 'c62c4da36bbaf7f253873035832709ef.'
  + 'aqwpWwdbzRWKY/UQAQwwpgAAAAAAAAAAM7hBvJOzqjc=.AAAAAArcCQABAAAAxv8QAAIAAACKYRgA.AgAB';

const V1_MODULE_SCRIPT = 'https://cdn.example.com/friendly-challenge@0.9.19/widget.module.min.js';
const V2_MODULE_SCRIPT = 'https://cdn.example.com/@friendlycaptcha/sdk@0.1.6/site.min.js';

// Mock client returning a realistic Friendly Captcha answer.
class FriendlyCaptchaApiClient {
  constructor(token = V1_TOKEN) {
    this.token = token;
  }

  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    this.incomings = fields;
    this.incomingFiles = files;
    return 'OK|123';
  }

  async res(params = {}) {
    if (params.json === 1 || params.json === '1') {
      return JSON.stringify({
        status: 1,
        request: this.token,
        solution: { token: this.token },
      });
    }
    return `OK|${this.token}`;
  }
}

function makeSolver(token) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new FriendlyCaptchaApiClient(token);
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

// -- what goes out ----------------------------------------------------------

test('friendlyCaptcha submits the documented parameters', async () => {
  const solver = makeSolver();

  const result = await solver.friendlyCaptcha(SITEKEY, URL);

  assertSent(solver, {
    method: 'friendly_captcha',
    sitekey: SITEKEY,
    pageurl: URL,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('friendlyCaptcha uses the documented underscore method spelling', async () => {
  // The server accepts friendlycaptcha too, but friendly_captcha is what the
  // parameter table documents and what 2Captcha's own SDKs send.
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL);

  assert.strictEqual(solver.apiClient.incomings.method, 'friendly_captcha');
});

test('friendlyCaptcha forwards an explicit version', async () => {
  const solver = makeSolver();

  for (const version of ['v1', 'v2']) {
    await solver.friendlyCaptcha(SITEKEY, URL, { version });
    assert.strictEqual(solver.apiClient.incomings.version, version);
  }
});

test('friendlyCaptcha accepts a bare digit version', async () => {
  // The server takes a bare 1 or 2 as well as v1/v2.
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL, { version: 2 });

  assert.strictEqual(solver.apiClient.incomings.version, 2);
});

test('friendlyCaptcha forwards the widget script URLs', async () => {
  // The script URL is the most reliable version signal there is: it is the
  // build the site actually loads.
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL, { module_script: V2_MODULE_SCRIPT });
  assert.strictEqual(solver.apiClient.incomings.module_script, V2_MODULE_SCRIPT);

  await solver.friendlyCaptcha(SITEKEY, URL, {
    moduleScript: V1_MODULE_SCRIPT,
    nomoduleScript: 'https://cdn.example.com/widget.min.js',
  });
  assert.strictEqual(solver.apiClient.incomings.module_script, V1_MODULE_SCRIPT);
  assert.strictEqual(
    solver.apiClient.incomings.nomodule_script,
    'https://cdn.example.com/widget.min.js',
  );
});

test('friendlyCaptcha forwards the EU data-residency tenant', async () => {
  // Both tenants mint a token for the same sitekey, so the wrong one is only
  // caught by the target site's own verification.
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL, { api_server: 'eu' });

  assert.strictEqual(solver.apiClient.incomings.api_server, 'eu');
});

test('friendlyCaptcha does not send an unset optional', async () => {
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL, {
    version: undefined,
    module_script: null,
    api_server: undefined,
  });

  assertSent(solver, {
    method: 'friendly_captcha',
    sitekey: SITEKEY,
    pageurl: URL,
  });
});

test('friendlyCaptcha splits a proxy object into proxy and proxytype', async () => {
  const solver = makeSolver();

  await solver.friendlyCaptcha(SITEKEY, URL, {
    proxy: { type: 'SOCKS5H', uri: 'login:pass@1.2.3.4:8080' },
  });

  assertSent(solver, {
    method: 'friendly_captcha',
    sitekey: SITEKEY,
    pageurl: URL,
    proxy: 'login:pass@1.2.3.4:8080',
    proxytype: 'SOCKS5H',
  });
});

// -- what is refused before it costs a round-trip ---------------------------

test('friendlyCaptcha refuses an unknown version locally', async () => {
  // Solving the wrong version returns a well-formed token the site rejects, so
  // a typo must not reach the server as a silent default.
  const solver = makeSolver();

  await assert.rejects(
    () => solver.friendlyCaptcha(SITEKEY, URL, { version: 'v3' }),
    (error) => error instanceof ValidationException && /v1/.test(error.message),
  );
});

test('friendlyCaptcha refuses a missing sitekey or pageurl', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.friendlyCaptcha('', URL), ValidationException);
  await assert.rejects(() => solver.friendlyCaptcha(SITEKEY, ''), ValidationException);
});

test('friendlyCaptcha refuses an unknown parameter', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.friendlyCaptcha(SITEKEY, URL, { challenge_url: 'https://x' }),
    ValidationException,
  );
});

test('friendlyCaptcha refuses SOCKS4 rather than silently going direct', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.friendlyCaptcha(SITEKEY, URL, { proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }),
    ValidationException,
  );
});

// -- what comes back --------------------------------------------------------

test('friendlyCaptcha exposes the token', async () => {
  const solver = makeSolver();

  const result = await solver.friendlyCaptcha(SITEKEY, URL);

  assert.strictEqual(result.token, V1_TOKEN);
  assert.strictEqual(result.code, V1_TOKEN);
});

test('friendlyCaptcha passes the token through verbatim', async () => {
  // A v1 token's dot-separated parts include base64 padding and slashes;
  // nothing may trim or re-encode them.
  const solver = makeSolver();

  const result = await solver.friendlyCaptcha(SITEKEY, URL);

  assert.strictEqual(result.token.split('.').length, 4);
  assert.ok(result.token.includes('/'));
  assert.ok(result.token.includes('='));
});

test('friendlyCaptcha carries a large v2 token intact', async () => {
  // A v2 token is a single opaque string of roughly six kilobytes.
  const v2Token = `AQQA.${'a'.repeat(6000)}`;
  const solver = makeSolver(v2Token);

  const result = await solver.friendlyCaptcha(SITEKEY, URL, { version: 'v2' });

  assert.strictEqual(result.token, v2Token);
  assert.strictEqual(result.token.length, v2Token.length);
});

test('friendlyCaptcha does not leak the solution object to the caller', async () => {
  const solver = makeSolver();

  const result = await solver.friendlyCaptcha(SITEKEY, URL);

  assert.ok(!('solution' in result));
});
