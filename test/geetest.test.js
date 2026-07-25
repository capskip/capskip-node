'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const GT = '81388ea1fc187e0c335c0a8907ff2625';
const CHALLENGE = '7cf6a8b1a2c34d5e6f7089abcdef0123';
const URL = 'https://mysite.com/page/with/geetest';

const SOLUTION = {
  geetest_challenge: CHALLENGE,
  geetest_validate: '9b1f4a2c8e7d6b5a4938271605f4e3d2',
  geetest_seccode: '9b1f4a2c8e7d6b5a4938271605f4e3d2|jordan',
};

// Mock client returning a realistic GeeTest v3 answer (JSON string in `request`).
class GeetestApiClient {
  constructor(request = JSON.stringify(SOLUTION)) {
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
      return JSON.stringify({ status: 1, request: this.request });
    }
    return `OK|${this.request}`;
  }
}

function makeSolver(request) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new GeetestApiClient(request);
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

test('geetest: basic solve', async () => {
  const solver = makeSolver();

  const result = await solver.geetest(GT, CHALLENGE, URL);

  assertSent(solver, {
    method: 'geetest',
    gt: GT,
    challenge: CHALLENGE,
    pageurl: URL,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('geetest: api_server domain override', async () => {
  const solver = makeSolver();

  await solver.geetest(GT, CHALLENGE, URL, { api_server: 'api-na.geetest.com' });

  assertSent(solver, {
    method: 'geetest',
    gt: GT,
    challenge: CHALLENGE,
    pageurl: URL,
    api_server: 'api-na.geetest.com',
  });
});

test('geetest: apiServer camelCase alias', async () => {
  const solver = makeSolver();

  await solver.geetest(GT, CHALLENGE, URL, { apiServer: 'api-na.geetest.com' });

  assertSent(solver, {
    method: 'geetest',
    gt: GT,
    challenge: CHALLENGE,
    pageurl: URL,
    api_server: 'api-na.geetest.com',
  });
});

test('geetest: proxy', async () => {
  const solver = makeSolver();

  await solver.geetest(GT, CHALLENGE, URL, {
    proxy: { type: 'HTTP', uri: '1.2.3.4:3128' },
  });

  assertSent(solver, {
    method: 'geetest',
    gt: GT,
    challenge: CHALLENGE,
    pageurl: URL,
    proxy: '1.2.3.4:3128',
    proxytype: 'HTTP',
  });
});

test('geetest: keeps the raw JSON answer in code', async () => {
  const solver = makeSolver();

  const result = await solver.geetest(GT, CHALLENGE, URL);

  assert.deepStrictEqual(JSON.parse(result.code), SOLUTION);
});

test('geetest: expands the solution fields', async () => {
  const solver = makeSolver();

  const result = await solver.geetest(GT, CHALLENGE, URL);

  assert.strictEqual(result.challenge, SOLUTION.geetest_challenge);
  assert.strictEqual(result.validate, SOLUTION.geetest_validate);
  assert.strictEqual(result.seccode, SOLUTION.geetest_seccode);
});

test('geetest: a non-JSON answer is left alone', async () => {
  const solver = makeSolver('not-json');

  const result = await solver.geetest(GT, CHALLENGE, URL);

  assert.strictEqual(result.code, 'not-json');
  assert.strictEqual(result.validate, undefined);
});

test('geetest: missing challenge is rejected', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest(GT, '', URL),
    ValidationException,
  );
});

test('geetest: missing gt is rejected', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest('', CHALLENGE, URL),
    ValidationException,
  );
});

test('geetest: missing pageurl is rejected', async () => {
  // pageurl is documented as required; fail locally rather than paying a
  // round-trip for ERROR_PAGEURL.
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest(GT, CHALLENGE, ''),
    ValidationException,
  );
});

test('geetest: unsupported parameter is rejected', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest(GT, CHALLENGE, URL, { sitekey: 'not-a-geetest-param' }),
    ValidationException,
  );
});

test('geetest: accepted proxy types', async () => {
  for (const proxytype of ['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS5H', 'socks5h']) {
    const solver = makeSolver();
    await solver.geetest(GT, CHALLENGE, URL, {
      proxy: { type: proxytype, uri: '1.2.3.4:3128' },
    });
    assert.strictEqual(solver.apiClient.incomings.proxytype, proxytype);
  }
});

test('geetest: SOCKS4 is rejected', async () => {
  // CapSkip maps only HTTP/HTTPS/SOCKS5/SOCKS5H and answers
  // ERROR_BAD_PARAMETERS for SOCKS4, so fail before the round-trip.
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest(GT, CHALLENGE, URL, {
      proxy: { type: 'SOCKS4', uri: '1.2.3.4:3128' },
    }),
    ValidationException,
  );
});

test('geetest: unknown proxy type is rejected', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.geetest(GT, CHALLENGE, URL, { proxy: '1.2.3.4:3128', proxytype: 'FTP' }),
    ValidationException,
  );
});
