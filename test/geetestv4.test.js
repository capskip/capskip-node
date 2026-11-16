'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');
const { applyGeetestV4Solution } = require('../src/solver');

const URL = 'https://gt4.geetest.com/';
const CAPTCHA_ID = '54088bb07d2df3c46b79f80300b0abbe';
const SOLUTION = {
  captcha_id: CAPTCHA_ID,
  lot_number: '7c1a4f0e9b2d48a6b3e5f7d9c1a3b5e7',
  pass_token: '2f6c0e4a8b1d5f9e3c7a0b4d8e2f6a1c5b9d3e7f0a4c8b2e6d1f5a9c3e7b0d4f8',
  gen_time: '1793001600',
  captcha_output: 'TM-rSt-9GZ_6s_5-dyAo3ZzQxZ3nhs8agozV1dXHM52rdKikcSbx6m9Z_vx1YtexMiou'
    + 'zC-83byvGlGzNTrsCk6EaDdzrugpzIevLISL7vRvwymvNEQ-NUfQM_PoUHAgWIs1w==',
};
const CODE = JSON.stringify(SOLUTION);

// Mock client answering as CapSkip's res.php does for GeeTest v4: `request` is
// the five values as a JSON string, after OK| or inside the JSON envelope, where
// the server escapes the inner quotes as ".
class GeetestV4ApiClient {
  constructor({ code = CODE, rawJson = null } = {}) {
    this.code = code;
    this.rawJson = rawJson;
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
      if (this.rawJson !== null) {
        return this.rawJson;
      }
      return JSON.stringify({ status: 1, request: this.code }).replace(/\\"/g, '\\u0022');
    }
    return `OK|${this.code}`;
  }
}

function makeSolver(clientOptions) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new GeetestV4ApiClient(clientOptions);
  return solver;
}

function solve(solver, options = {}) {
  return solver.geetestV4(CAPTCHA_ID, URL, options);
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

const MINIMAL = { method: 'geetest_v4', captcha_id: CAPTCHA_ID, pageurl: URL };

// -- what goes out ----------------------------------------------------------

test('geetestV4 submits the minimal task', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assertSent(solver, MINIMAL);
  assert.strictEqual(result.captchaId, '123');
});

test('geetestV4 sends every option', async () => {
  const solver = makeSolver();

  await solve(solver, {
    risk_type: 'slide',
    proxy: { type: 'HTTPS', uri: 'login:password@203.0.113.7:3128' },
  });

  assertSent(solver, {
    ...MINIMAL,
    risk_type: 'slide',
    proxy: 'login:password@203.0.113.7:3128',
    proxytype: 'HTTPS',
  });
});

test('geetestV4 accepts the captchaId and riskType spellings', async () => {
  // The API documents riskType and also reads captchaId; both are accepted.
  const solver = makeSolver();

  await solver.geetestV4(undefined, URL, { captchaId: CAPTCHA_ID, riskType: 'icon' });

  const sent = solver.apiClient.incomings;
  assert.strictEqual(sent.captcha_id, CAPTCHA_ID);
  assert.strictEqual(sent.risk_type, 'icon');
  assert.ok(!('captchaId' in sent));
  assert.ok(!('riskType' in sent));
});

test('geetestV4 accepts captcha_id in options in place of the argument', async () => {
  const solver = makeSolver();

  await solver.geetestV4(null, URL, { captcha_id: CAPTCHA_ID });

  assert.strictEqual(solver.apiClient.incomings.captcha_id, CAPTCHA_ID);
});

test('geetestV4 accepts pageurl in options in place of url', async () => {
  const solver = makeSolver();

  await solver.geetestV4(CAPTCHA_ID, undefined, { pageurl: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);

  await solver.geetestV4(CAPTCHA_ID, null, { url: URL });
  assert.strictEqual(solver.apiClient.incomings.pageurl, URL);
});

test('geetestV4 trims captcha_id and risk_type', async () => {
  const solver = makeSolver();

  await solver.geetestV4(`  ${CAPTCHA_ID} `, URL, { risk_type: ' slide\n' });

  assert.strictEqual(solver.apiClient.incomings.captcha_id, CAPTCHA_ID);
  assert.strictEqual(solver.apiClient.incomings.risk_type, 'slide');
});

test('geetestV4 does not send unset or empty optionals', async () => {
  const solver = makeSolver();

  await solve(solver, { risk_type: '', riskType: undefined, proxy: null });
  assertSent(solver, MINIMAL);

  await solve(solver, { risk_type: '   ', proxy: '' });
  assertSent(solver, MINIMAL);
});

test('geetestV4 passes risk_type through as free text', async () => {
  // GeeTest adds challenge types, so the SDK does not enumerate them.
  const solver = makeSolver();

  await solve(solver, { risk_type: 'some_new_type' });

  assert.strictEqual(solver.apiClient.incomings.risk_type, 'some_new_type');
});

test('geetestV4 defaults a bare proxy string to HTTP', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: '203.0.113.7:3128' });

  assert.strictEqual(solver.apiClient.incomings.proxy, '203.0.113.7:3128');
  assert.strictEqual(solver.apiClient.incomings.proxytype, 'HTTP');
});

// -- what is refused before it costs a round-trip ---------------------------

test('geetestV4 refuses a missing or blank captcha_id', async () => {
  const solver = makeSolver();
  for (const captchaId of [undefined, null, '', '   ']) {
    await assert.rejects(
      () => solver.geetestV4(captchaId, URL),
      ValidationException,
      String(captchaId),
    );
  }
});

test('geetestV4 refuses a captcha_id that is not a string', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solver.geetestV4(12345, URL), ValidationException);
});

test('geetestV4 refuses a pageurl that is missing or not absolute http(s)', async () => {
  const solver = makeSolver();
  for (const url of [undefined, '', 'gt4.geetest.com/', 'ftp://example.com/', 'https://']) {
    await assert.rejects(() => solver.geetestV4(CAPTCHA_ID, url), ValidationException, String(url));
  }
});

test("geetestV4 refuses v3's parameters", async () => {
  const solver = makeSolver();
  for (const extra of [{ gt: 'abc' }, { challenge: 'abc' }, { api_server: 'api.geetest.com' }]) {
    await assert.rejects(() => solve(solver, extra), ValidationException, JSON.stringify(extra));
  }
});

test('geetestV4 refuses unknown parameters', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solve(solver, { userAgent: 'Mozilla/5.0' }), ValidationException);
});

test('geetestV4 refuses conflicting aliases', async () => {
  const solver = makeSolver();
  await assert.rejects(() => solve(solver, { captchaId: 'another-captcha-id' }), ValidationException);
  await assert.rejects(
    () => solve(solver, { risk_type: 'slide', riskType: 'icon' }),
    ValidationException,
  );
});

test('geetestV4 refuses a SOCKS4 proxy', async () => {
  const solver = makeSolver();
  await assert.rejects(
    () => solve(solver, { proxy: { type: 'SOCKS4', uri: '203.0.113.7:1080' } }),
    ValidationException,
  );
});

test('geetestV4 sends nothing when refused', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.geetestV4('', URL), ValidationException);
  await assert.rejects(() => solve(solver, { gt: 'abc' }), ValidationException);
  await assert.rejects(() => solver.geetestV4(CAPTCHA_ID, 'ftp://example.com/'), ValidationException);

  assert.strictEqual(solver.apiClient.incomings, undefined);
});

// -- what comes back --------------------------------------------------------

test('geetestV4 expands the five values from a \\u0022-escaped answer', async () => {
  const result = await solve(makeSolver());

  assert.strictEqual(result.code, CODE);
  for (const [field, value] of Object.entries(SOLUTION)) {
    assert.strictEqual(result[field], value, field);
  }
  assert.ok(!('isOffline' in result));
});

test('geetestV4 expands a plain-text answer', async () => {
  const solver = makeSolver();

  const id = await solver.send({ method: 'geetest_v4', captcha_id: CAPTCHA_ID, url: URL });
  const code = await solver.getResult(id);
  assert.strictEqual(code, CODE);

  const expanded = applyGeetestV4Solution({ captchaId: id, code });
  assert.strictEqual(expanded.code, CODE);
  assert.strictEqual(expanded.pass_token, SOLUTION.pass_token);
});

test('geetestV4 reports an offline pass', async () => {
  const solver = makeSolver({ code: JSON.stringify({ ...SOLUTION, isOffline: true }) });

  const result = await solve(solver);

  assert.strictEqual(result.isOffline, true);
  assert.strictEqual(result.lot_number, SOLUTION.lot_number);
});

test('geetestV4 expands an answer that is already an object', async () => {
  // Should the server ever put the object itself in `request`, it still parses.
  const solver = makeSolver({ rawJson: JSON.stringify({ status: 1, request: SOLUTION }) });

  const result = await solve(solver);

  assert.strictEqual(result.captcha_output, SOLUTION.captcha_output);
});

test('geetestV4 leaves an unparsable answer untouched', async () => {
  const result = await solve(makeSolver({ code: 'not-json' }));

  assert.strictEqual(result.code, 'not-json');
  assert.ok(!('lot_number' in result));
});

test('geetestV4 polls with json=1', async () => {
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

test('geetestV4 uses the reCAPTCHA timeout', async () => {
  // A real browser solve, like GeeTest v3, so it takes the longer timeout.
  const solver = makeSolver();
  solver.defaultTimeout = 77;
  solver.recaptchaTimeout = 321;
  const seen = recordTimeout(solver);

  await solve(solver);

  assert.strictEqual(seen.timeout, 321);
});

test('geetestV4 explicit timeout wins', async () => {
  const solver = makeSolver();
  const seen = recordTimeout(solver);

  await solve(solver, { timeout: 42 });

  assert.strictEqual(seen.timeout, 42);
});
