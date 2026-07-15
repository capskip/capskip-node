'use strict';

// Unit tests for in.php submit-response parsing (parseSubmitResponse).

const { test } = require('node:test');
const assert = require('node:assert');

const { parseSubmitResponse } = require('../src/solver');
const { ApiException } = require('../src/exceptions');

test('OK| submit response is unwrapped', () => {
  assert.strictEqual(parseSubmitResponse('OK|12345'), '12345');
});

test('OK| submit response is trimmed', () => {
  assert.strictEqual(parseSubmitResponse('OK|12345\n'), '12345');
});

test('json submit response returns the id', () => {
  // CapSkip returns this shape when the submit carried json=1.
  assert.strictEqual(parseSubmitResponse('{"status":1,"request":"12345"}'), '12345');
});

test('unrecognized submit response raises ApiException', () => {
  assert.throws(() => parseSubmitResponse('SOMETHING_UNEXPECTED'), ApiException);
});

test('json submit without success status raises ApiException', () => {
  assert.throws(() => parseSubmitResponse('{"status":0,"request":"ERROR"}'), ApiException);
});
