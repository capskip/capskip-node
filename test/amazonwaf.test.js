'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { applyAmazonWafSolution, applyCapySolution } = require('../src/solver');
const { isAmazonWafScriptUrl } = require('../src/apiParams');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://www.example.com/';
const SITEKEY = 'AQIDAHjcYuEXAMPLEghicBgQ/7bFaQZ+m5FKCMDnO+vTbNg96AHDh0IR5vgzHNceHYqZR+GOAAAAfjB8';
const IV = 'CgAFRDIjfgAAA5yY';
const CONTEXT = 'Rbp3r8fvbuhmrCqpUe8Mh1TLvs8OSKJZiSs2vCF4dt9rxVZI7xYJa2n5k/9r+XaXe7KUIu2I8nXTDHHkDvIOTDc2';
const CHALLENGE_JS = 'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/challenge.js';
const CAPTCHA_JS = 'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/captcha.js';
const WIDGET_KEY = 'Xr9kEXAMPLE2bWQx1vTq8LmZ0aYc4dHs7nFp3gJt6uKw5eRi9AbCdEfGh=_0_1';
const JSAPI_JS = 'https://5b7e0a19c3d8.us-east-1.captcha-sdk.awswaf.com/5b7e0a19c3d8/jsapi.js';

// What CapSkip hands back: not a token, but the pair AWS WAF trades for the
// aws-waf-token cookie on its own /voucher endpoint.
const SOLUTION = {
  captcha_voucher: 'eyJ2b3VjaGVyIjoiRVhBTVBMRSJ9.9QwZcEXAMPLEvoucherJk4LmN0pQ',
  existing_token: '7d4c2a91-EXAMPLE-4f0b-9e6d-3a1b5c8e2f70:EQoAeXAMPLEtokenAAAA:Wm9wc2E=',
};

// Mock client returning a realistic AWS WAF answer (an object, not a token).
// Unlike Capy's, the json=1 reply carries no createTask `solution` key.
class AmazonWafApiClient {
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
      return JSON.stringify({ status: 1, request: this.request });
    }
    return `OK|${JSON.stringify(this.request)}`;
  }
}

function makeSolver(request) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new AmazonWafApiClient(request);
  return solver;
}

// The challenge-page call every refusal test starts from.
function solve(solver, options = {}) {
  return solver.amazonWaf(SITEKEY, URL, { iv: IV, context: CONTEXT, ...options });
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

// -- what goes out ----------------------------------------------------------

test('amazonWaf submits a challenge page', async () => {
  const solver = makeSolver();

  const result = await solve(solver, { challenge_script: CHALLENGE_JS, captcha_script: CAPTCHA_JS });

  assertSent(solver, {
    method: 'amazon_waf',
    sitekey: SITEKEY,
    iv: IV,
    context: CONTEXT,
    pageurl: URL,
    challenge_script: CHALLENGE_JS,
    captcha_script: CAPTCHA_JS,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('amazonWaf may leave iv and context out', async () => {
  // Left out, CapSkip reads them from pageurl at solve time -- and an unset one
  // must not reach the server as the string "undefined".
  const solver = makeSolver();

  await solver.amazonWaf(SITEKEY, URL, { iv: undefined, context: null });

  assertSent(solver, {
    method: 'amazon_waf',
    sitekey: SITEKEY,
    pageurl: URL,
  });
});

test('amazonWaf treats empty iv and context as not sent', async () => {
  // The server treats '' exactly like an absent value.
  const solver = makeSolver();

  await solver.amazonWaf(SITEKEY, URL, { iv: '', context: '', challenge_script: '' });

  assertSent(solver, {
    method: 'amazon_waf',
    sitekey: SITEKEY,
    pageurl: URL,
  });
});

test('amazonWaf submits a widget page', async () => {
  const solver = makeSolver();

  await solver.amazonWaf(WIDGET_KEY, URL, { jsapiScript: JSAPI_JS });

  assertSent(solver, {
    method: 'amazon_waf',
    sitekey: WIDGET_KEY,
    pageurl: URL,
    jsapiScript: JSAPI_JS,
  });
});

test('amazonWaf accepts the other spelling of each script parameter', async () => {
  // createTask callers arrive with challengeScript / captchaScript, and
  // jsapi_script is the snake-case spelling of the documented jsapiScript.
  const solver = makeSolver();

  await solve(solver, { challengeScript: CHALLENGE_JS, captchaScript: CAPTCHA_JS });
  const sent = solver.apiClient.incomings;
  assert.strictEqual(sent.challenge_script, CHALLENGE_JS);
  assert.strictEqual(sent.captcha_script, CAPTCHA_JS);
  assert.ok(!('challengeScript' in sent));
  assert.ok(!('captchaScript' in sent));

  await solver.amazonWaf(WIDGET_KEY, URL, { jsapi_script: JSAPI_JS });
  assert.strictEqual(solver.apiClient.incomings.jsapiScript, JSAPI_JS);
  assert.ok(!('jsapi_script' in solver.apiClient.incomings));
});

test('amazonWaf refuses an alias that conflicts with its canonical name', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solve(solver, { challengeScript: CHALLENGE_JS, challenge_script: `${CHALLENGE_JS}?v=2` }),
    ValidationException,
  );
});

test('amazonWaf splits a proxy object into proxy and proxytype', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: { type: 'SOCKS5H', uri: 'login:pass@1.2.3.4:8080' } });

  const sent = solver.apiClient.incomings;
  assert.strictEqual(sent.proxy, 'login:pass@1.2.3.4:8080');
  assert.strictEqual(sent.proxytype, 'SOCKS5H');
});

test('amazonWaf uses the browser timeout', async () => {
  // A browser mints the token the voucher belongs to, so the solve gets
  // recaptchaTimeout like the other browser-backed methods.
  const solver = makeSolver();
  solver.recaptchaTimeout = 654;
  let captured;
  const original = solver.solve.bind(solver);
  solver.solve = (options) => {
    captured = options;
    return original(options);
  };

  await solve(solver);
  assert.strictEqual(captured.timeout, 654);

  await solve(solver, { timeout: 42 });
  assert.strictEqual(captured.timeout, 42);
});

// -- what is refused before it costs a round-trip ---------------------------

test('amazonWaf refuses a missing sitekey', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.amazonWaf('', URL, { iv: IV, context: CONTEXT }), ValidationException);
  assert.strictEqual(solver.apiClient.incomings, undefined);
});

test('amazonWaf refuses a missing pageurl', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.amazonWaf(SITEKEY, undefined, { iv: IV, context: CONTEXT }), ValidationException);
  await assert.rejects(() => solver.amazonWaf(SITEKEY, '', { iv: IV, context: CONTEXT }), ValidationException);
});

test('amazonWaf refuses a pageurl that is not a full http(s) URL', async () => {
  const solver = makeSolver();

  for (const url of ['ftp://example.com/', 'example.com']) {
    await assert.rejects(
      () => solver.amazonWaf(SITEKEY, url, { iv: IV, context: CONTEXT }),
      ValidationException,
      url,
    );
  }
});

test('amazonWaf refuses iv without context', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solve(solver, { context: null }),
    (error) => error instanceof ValidationException && /context/.test(error.message),
  );
});

test('amazonWaf refuses context without iv', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solve(solver, { iv: '' }), ValidationException);
});

test('amazonWaf refuses scripts that are not on awswaf.com', async () => {
  // CapSkip POSTs the solution to the host the script names, so it refuses any
  // script that is not a genuine AWS WAF one.
  const bad = [
    'https://evil.example.com/abc/challenge.js',
    'http://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/challenge.js',
    'https://awswaf.com.evil.example/3f2a9c7d41b0/challenge.js',
    'https://user:pw@3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/challenge.js',
    'https://3f2a9c7d41b0.edge.sdk.awswaf.com:8443/3f2a9c7d41b0/challenge.js',
    'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/other.js',
    'https://3f2a9c7d41b0.edge.sdk.awswaf.com/challenge.js',
    'not a url',
  ];
  const solver = makeSolver();

  for (const url of bad) {
    for (const key of ['challenge_script', 'captcha_script', 'jsapiScript']) {
      await assert.rejects(
        () => solve(solver, { [key]: url }),
        (error) => error instanceof ValidationException
          && error.message.includes(key)
          && /not an AWS WAF integration/.test(error.message),
        `${key}=${url}`,
      );
    }
  }
  assert.strictEqual(solver.apiClient.incomings, undefined);
});

test('amazonWaf accepts a script with a query string or an explicit :443', async () => {
  const solver = makeSolver();

  await solve(solver, { challenge_script: `${CHALLENGE_JS}?v=2` });
  assert.strictEqual(solver.apiClient.incomings.challenge_script, `${CHALLENGE_JS}?v=2`);

  assert.ok(isAmazonWafScriptUrl(CHALLENGE_JS.replace('.com/', '.com:443/')));
  assert.ok(isAmazonWafScriptUrl(CHALLENGE_JS.replace('awswaf.com', 'AWSWAF.COM')));
  assert.ok(isAmazonWafScriptUrl(JSAPI_JS));
  assert.ok(isAmazonWafScriptUrl(CAPTCHA_JS));
});

test('amazonWaf refuses an unknown parameter', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solve(solver, { gt: 'x' }), ValidationException);
});

test('amazonWaf refuses SOCKS4 rather than silently going direct', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solve(solver, { proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } }),
    ValidationException,
  );
});

// -- what comes back --------------------------------------------------------

test('amazonWaf expands its answer into the voucher pair', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assert.strictEqual(result.captcha_voucher, SOLUTION.captcha_voucher);
  assert.strictEqual(result.existing_token, SOLUTION.existing_token);
  assert.ok(!('solution' in result));
});

test('amazonWaf keeps the raw answer as code', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  const raw = typeof result.code === 'string' ? JSON.parse(result.code) : result.code;
  assert.deepStrictEqual(raw, SOLUTION);
});

test('amazonWaf expands a JSON-string answer too', () => {
  // Plain-text res.php sends the same object as one line after OK|.
  const result = applyAmazonWafSolution({
    captchaId: '123',
    code: JSON.stringify(SOLUTION),
  });

  assert.strictEqual(result.captcha_voucher, SOLUTION.captcha_voucher);
  assert.strictEqual(result.existing_token, SOLUTION.existing_token);
});

test('amazonWaf leaves an unparseable answer untouched', async () => {
  // A reply the SDK cannot read must reach the caller as the server sent it,
  // rather than being masked by a parse failure.
  const solver = makeSolver('not-json-at-all');

  const result = await solve(solver);

  assert.strictEqual(result.code, 'not-json-at-all');
  assert.ok(!('captcha_voucher' in result));
  assert.ok(!('existing_token' in result));
});

test('the shared expansion keeps each method to its own fields', () => {
  // Capy and AWS WAF share one expansion; neither may pick up the other's keys.
  const both = { ...SOLUTION, captchakey: 'PUZZLE_x', answer: 'path' };

  const waf = applyAmazonWafSolution({ captchaId: '1', code: { ...both } });
  assert.ok(!('answer' in waf) && !('captchakey' in waf));

  const capy = applyCapySolution({ captchaId: '1', code: { ...both } });
  assert.ok(!('captcha_voucher' in capy) && !('existing_token' in capy));
  assert.strictEqual(capy.answer, 'path');
});
