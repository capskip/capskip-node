'use strict';

// Unit tests for res.php response parsing (parsePollResponse).

const { test } = require('node:test');
const assert = require('node:assert');

const { parsePollResponse } = require('../src/solver');
const { ApiException, NetworkException } = require('../src/exceptions');

for (const body of ['', '   ', '\n', null, undefined]) {
  for (const jsonMode of [0, 1]) {
    test(`empty body (${JSON.stringify(body)}, json=${jsonMode}) is retryable`, () => {
      // CapSkip returns an empty body before a result is available; it must be
      // signalled as "not ready" (NetworkException), never a fatal ApiException.
      assert.throws(() => parsePollResponse(body, jsonMode), NetworkException);
    });
  }
}

test('CAPCHA_NOT_READY marker is retryable', () => {
  assert.throws(() => parsePollResponse('CAPCHA_NOT_READY'), NetworkException);
});

test('OK| token is unwrapped', () => {
  assert.strictEqual(parsePollResponse('OK|thetoken'), 'thetoken');
});

test('OK| token is trimmed', () => {
  assert.strictEqual(parsePollResponse('OK|thetoken\n'), 'thetoken');
});

test('unrecognized response raises ApiException', () => {
  assert.throws(() => parsePollResponse('SOMETHING_UNEXPECTED'), ApiException);
});

test('json ready response returns the payload', () => {
  const data = parsePollResponse('{"status":1,"request":"tok"}', 1);
  assert.strictEqual(data.request, 'tok');
});

test('json not-ready response is retryable', () => {
  assert.throws(
    () => parsePollResponse('{"status":0,"request":"CAPCHA_NOT_READY"}', 1),
    NetworkException,
  );
});
