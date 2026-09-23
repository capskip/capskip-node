'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { applyCapySolution } = require('../src/solver');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://mysite.com/login';
const CAPTCHA_KEY = 'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v';

// What CapSkip hands back: not a token, but the three values the Capy widget
// would have written into the target form, plus respKey for shape-compatibility
// with 2Captcha's documented response.
const SOLUTION = {
  captchakey: CAPTCHA_KEY,
  challengekey: 'BalY2gJaI8uA2SGVOZhqBQ3V0CYSNNGP',
  answer: '0xax8ex0xax84x0xkx7qx0x18x76x0x1ix6sx0x26x68x0x2gx5kx0x34x50x',
  respKey: '',
};

// Mock client returning a realistic Capy answer (an object, not a token).
class CapyApiClient {
  constructor(request = SOLUTION) {
    this.request = request;
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
        request: this.request,
        solution: this.request,
      });
    }
    return `OK|${JSON.stringify(this.request)}`;
  }
}

function makeSolver(request) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new CapyApiClient(request);
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

// -- what goes out ----------------------------------------------------------

test('capy submits the documented parameters', async () => {
  const solver = makeSolver();

  const result = await solver.capy(CAPTCHA_KEY, URL);

  assertSent(solver, {
    method: 'capy',
    captchakey: CAPTCHA_KEY,
    pageurl: URL,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('capy sends its sitekey argument as captchakey', async () => {
  // The SDK argument is `sitekey`, matching every other method; the wire name is
  // `captchakey`, which is what the API documents.
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL);

  assert.strictEqual(solver.apiClient.incomings.captchakey, CAPTCHA_KEY);
  assert.ok(!('sitekey' in solver.apiClient.incomings));
});

test('capy forwards api_server and its camelCase alias', async () => {
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL, { api_server: 'https://jp.api.capy.me/' });
  assert.strictEqual(solver.apiClient.incomings.api_server, 'https://jp.api.capy.me/');

  await solver.capy(CAPTCHA_KEY, URL, { apiServer: 'https://jp.api.capy.me/' });
  assert.strictEqual(solver.apiClient.incomings.api_server, 'https://jp.api.capy.me/');
});

test('capy lowercases userAgent to the documented spelling', async () => {
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL, { userAgent: 'Mozilla/5.0' });

  assert.strictEqual(solver.apiClient.incomings.useragent, 'Mozilla/5.0');
  assert.ok(!('userAgent' in solver.apiClient.incomings));
});

test('capy accepts an explicit puzzle version', async () => {
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL, { version: 'puzzle' });

  assert.strictEqual(solver.apiClient.incomings.version, 'puzzle');
});

test('capy does not send an unset optional', async () => {
  // A form body can only carry strings, so undefined would arrive stringified.
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL, { api_server: undefined, version: null });

  assertSent(solver, {
    method: 'capy',
    captchakey: CAPTCHA_KEY,
    pageurl: URL,
  });
});

test('capy splits a proxy object into proxy and proxytype', async () => {
  const solver = makeSolver();

  await solver.capy(CAPTCHA_KEY, URL, {
    proxy: { type: 'SOCKS5', uri: 'login:pass@1.2.3.4:8080' },
  });

  assertSent(solver, {
    method: 'capy',
    captchakey: CAPTCHA_KEY,
    pageurl: URL,
    proxy: 'login:pass@1.2.3.4:8080',
    proxytype: 'SOCKS5',
  });
});

// -- what is refused before it costs a round-trip ---------------------------

test('capy refuses the avatar version locally', async () => {
  // CapSkip solves the puzzle family only. Returning a puzzle answer for an
  // avatar request would bill for a solve the target site rejects.
  const solver = makeSolver();

  await assert.rejects(
    () => solver.capy(CAPTCHA_KEY, URL, { version: 'avatar' }),
    (error) => error instanceof ValidationException && /puzzle/.test(error.message),
  );
});

test('capy refuses an unknown version', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.capy(CAPTCHA_KEY, URL, { version: 'slider' }),
    ValidationException,
  );
});

test('capy refuses a missing captchakey or pageurl', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.capy('', URL), ValidationException);
  await assert.rejects(() => solver.capy(CAPTCHA_KEY, ''), ValidationException);
});

test('capy refuses an unknown parameter', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.capy(CAPTCHA_KEY, URL, { challenge: 'x' }),
    ValidationException,
  );
});

test('capy refuses SOCKS4 rather than silently going direct', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.capy(CAPTCHA_KEY, URL, { proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }),
    ValidationException,
  );
});

// -- what comes back --------------------------------------------------------

test('capy expands its answer into the three form fields', async () => {
  const solver = makeSolver();

  const result = await solver.capy(CAPTCHA_KEY, URL);

  assert.strictEqual(result.captchakey, SOLUTION.captchakey);
  assert.strictEqual(result.challengekey, SOLUTION.challengekey);
  assert.strictEqual(result.answer, SOLUTION.answer);
  assert.strictEqual(result.respKey, '');
});

test('capy passes the answer through unchanged', async () => {
  // The answer is the drag path the widget would have recorded, and the target
  // site verifies it against the challenge it issued.
  const solver = makeSolver();

  const result = await solver.capy(CAPTCHA_KEY, URL);

  assert.strictEqual(result.answer, SOLUTION.answer);
  assert.ok(!result.answer.includes(' '));
});

test('capy keeps the raw answer as code', async () => {
  const solver = makeSolver();

  const result = await solver.capy(CAPTCHA_KEY, URL);

  const raw = typeof result.code === 'string' ? JSON.parse(result.code) : result.code;
  assert.deepStrictEqual(raw, SOLUTION);
});

test('capy expands a JSON-string answer too', () => {
  // `capy()` polls with json=1, where the object arrives already parsed in
  // `request`. A client reading res.php as plain text gets the same object as a
  // single line of JSON after OK|, so the expansion has to read both.
  const result = applyCapySolution({
    captchaId: '123',
    code: JSON.stringify(SOLUTION),
  });

  assert.strictEqual(result.challengekey, SOLUTION.challengekey);
  assert.strictEqual(result.answer, SOLUTION.answer);
  assert.strictEqual(result.captchakey, SOLUTION.captchakey);
});

test('capy does not leak the solution object to the caller', async () => {
  const solver = makeSolver();

  const result = await solver.capy(CAPTCHA_KEY, URL);

  assert.ok(!('solution' in result));
});

test('capy leaves an unparseable answer untouched', async () => {
  // A reply the SDK cannot read must reach the caller as the server sent it,
  // rather than being masked by a parse failure.
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = {
    async in_(options = {}) {
      const { files = {}, ...fields } = options;
      this.incomings = fields;
      return 'OK|123';
    },
    async res() {
      return JSON.stringify({ status: 1, request: 'not-json-at-all' });
    },
  };

  const result = await solver.capy(CAPTCHA_KEY, URL);

  assert.strictEqual(result.code, 'not-json-at-all');
  assert.ok(!('answer' in result));
});
