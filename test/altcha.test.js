'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { ValidationException } = require('../src/exceptions');

const URL = 'https://mysite.com/signup';
const CHALLENGE_URL = 'https://mysite.com/captcha/api/altcha/challenge';
const CHALLENGE_DOC = {
  algorithm: 'SHA-256',
  challenge: '3dd28253be6cc0c54d95f7f98c517e68',
  salt: '46d5b1c8871e5152d902ee3f?expires=1893456000',
  signature: '4b1cf0e0be0f4e5247e50b0f9a449830',
  maxnumber: 1000000,
};
const CHALLENGE_JSON = JSON.stringify(CHALLENGE_DOC);

// What CapSkip hands back: base64 of the solved challenge document, with the
// winning counter in `number`.
const NUMBER = 9661;
const TOKEN = Buffer.from(
  JSON.stringify({ ...CHALLENGE_DOC, number: NUMBER }),
).toString('base64');

// Mock client returning a realistic ALTCHA answer (base64 token in `request`).
class AltchaApiClient {
  constructor(request = TOKEN) {
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
        solution: { token: this.request, number: NUMBER },
      });
    }
    return `OK|${this.request}`;
  }
}

function makeSolver(request) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new AltchaApiClient(request);
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

test('altcha submits challengeUrl', async () => {
  const solver = makeSolver();

  const result = await solver.altcha(URL, { challengeUrl: CHALLENGE_URL });

  assertSent(solver, {
    method: 'altcha',
    pageurl: URL,
    challenge_url: CHALLENGE_URL,
  });
  assert.strictEqual(result.captchaId, '123');
});

test('altcha accepts the snake_case challenge_url too', async () => {
  const solver = makeSolver();

  await solver.altcha(URL, { challenge_url: CHALLENGE_URL });

  assertSent(solver, { method: 'altcha', pageurl: URL, challenge_url: CHALLENGE_URL });
});

test('altcha submits challengeJson as a string', async () => {
  const solver = makeSolver();

  await solver.altcha(URL, { challengeJson: CHALLENGE_JSON });

  assertSent(solver, { method: 'altcha', pageurl: URL, challenge_json: CHALLENGE_JSON });
});

test('altcha serializes an inline challenge object', async () => {
  // The form body can only carry a string, so an object has to be serialized
  // rather than stringified into "[object Object]".
  const solver = makeSolver();

  await solver.altcha(URL, { challengeJson: CHALLENGE_DOC });

  assert.deepStrictEqual(
    JSON.parse(solver.apiClient.incomings.challenge_json),
    CHALLENGE_DOC,
  );
});

test('altcha allows both challenge params, letting the inline one win', async () => {
  const solver = makeSolver();

  await solver.altcha(URL, {
    challengeUrl: CHALLENGE_URL,
    challengeJson: CHALLENGE_JSON,
  });

  assertSent(solver, {
    method: 'altcha',
    pageurl: URL,
    challenge_url: CHALLENGE_URL,
    challenge_json: CHALLENGE_JSON,
  });
});

test('altcha ignores an undefined challenge param', async () => {
  const solver = makeSolver();

  await solver.altcha(URL, { challengeUrl: CHALLENGE_URL, challengeJson: undefined });

  assertSent(solver, { method: 'altcha', pageurl: URL, challenge_url: CHALLENGE_URL });
});

test('altcha sends a proxy', async () => {
  const solver = makeSolver();

  await solver.altcha(URL, {
    challengeUrl: CHALLENGE_URL,
    proxy: { type: 'HTTP', uri: '1.2.3.4:3128' },
  });

  assertSent(solver, {
    method: 'altcha',
    pageurl: URL,
    challenge_url: CHALLENGE_URL,
    proxy: '1.2.3.4:3128',
    proxytype: 'HTTP',
  });
});

test('altcha exposes token and number', async () => {
  const solver = makeSolver();

  const result = await solver.altcha(URL, { challengeUrl: CHALLENGE_URL });

  assert.strictEqual(result.code, TOKEN);
  assert.strictEqual(result.token, TOKEN);
  assert.strictEqual(result.number, NUMBER);
});

test('altcha leaves an undecodable answer alone', async () => {
  const solver = makeSolver('not-base64-json');

  const result = await solver.altcha(URL, { challengeUrl: CHALLENGE_URL });

  assert.strictEqual(result.code, 'not-base64-json');
  assert.strictEqual(result.number, undefined);
});

test('altcha uses the default timeout, not the reCAPTCHA one', async () => {
  // ALTCHA is CPU proof-of-work measured in milliseconds, not a browser solve,
  // so it must not inherit reCAPTCHA's much longer budget.
  const solver = makeSolver();
  let seen;
  const original = solver.waitResult.bind(solver);
  solver.waitResult = (id, timeout, interval, json) => {
    seen = timeout;
    return original(id, timeout, interval, json);
  };

  await solver.altcha(URL, { challengeUrl: CHALLENGE_URL });

  assert.strictEqual(seen, solver.defaultTimeout);
  assert.notStrictEqual(seen, solver.recaptchaTimeout);
});

test('altcha rejects a missing url', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.altcha('', { challengeUrl: CHALLENGE_URL }),
    ValidationException,
  );
});

test('altcha rejects a missing challenge', async () => {
  const solver = makeSolver();

  await assert.rejects(() => solver.altcha(URL), ValidationException);
});

test('altcha rejects empty challenge params', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.altcha(URL, { challengeUrl: '', challengeJson: '' }),
    ValidationException,
  );
});

test('altcha rejects an unsupported parameter', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.altcha(URL, { challengeUrl: CHALLENGE_URL, sitekey: 'nope' }),
    ValidationException,
  );
});

test('altcha accepts every proxy type CapSkip maps', async () => {
  for (const proxytype of ['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS5H', 'socks5h']) {
    const solver = makeSolver();
    await solver.altcha(URL, {
      challengeUrl: CHALLENGE_URL,
      proxy: { type: proxytype, uri: '1.2.3.4:3128' },
    });
    assert.strictEqual(solver.apiClient.incomings.proxytype, proxytype);
  }
});

test('altcha rejects SOCKS4', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.altcha(URL, {
      challengeUrl: CHALLENGE_URL,
      proxy: { type: 'SOCKS4', uri: '1.2.3.4:3128' },
    }),
    ValidationException,
  );
});
