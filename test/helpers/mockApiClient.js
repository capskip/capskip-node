'use strict';

// Mock ApiClient that records the params it was sent and returns canned
// responses, mirroring tests/abstract.py from the Python SDK.

const assert = require('node:assert');
const { CapSkip } = require('../../src');

const CAPTCHA_ID = '123';
const CODE = 'abcd';

class MockApiClient {
  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    this.incomings = fields;
    this.incomingFiles = files;
    return `OK|${CAPTCHA_ID}`;
  }

  async res(params = {}) {
    if (params.json === 1 || params.json === '1') {
      return `{"status":1,"request":"${CODE}","useragent":"TestAgent/1.0"}`;
    }
    return `OK|${CODE}`;
  }
}

function makeSolver() {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new MockApiClient();
  return solver;
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

function assertResult(result) {
  assert.ok(result && typeof result === 'object');
  assert.strictEqual(result.captchaId, CAPTCHA_ID);
  assert.strictEqual(result.code, CODE);
}

module.exports = {
  CAPTCHA_ID,
  CODE,
  MockApiClient,
  makeSolver,
  assertSent,
  assertResult,
};
