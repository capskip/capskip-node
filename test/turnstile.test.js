'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const {
  makeSolver, assertSent, assertResult, CODE,
} = require('./helpers/mockApiClient');

const SITEKEY = '0x4AAAAAAABUYP0XeMJF0xoy';
const URL = 'https://mysite.com/page/with/turnstile';

test('turnstile: basic widget', async () => {
  const solver = makeSolver();

  const result = await solver.turnstile(SITEKEY, URL);

  assertSent(solver, { method: 'turnstile', sitekey: SITEKEY, pageurl: URL });
  assertResult(result);
});

test('turnstile: challenge page', async () => {
  const solver = makeSolver();

  const result = await solver.turnstile(SITEKEY, URL, {
    action: 'managed',
    data: 'cdata_value',
    pagedata: 'chlpagedata_value',
  });

  assertSent(solver, {
    method: 'turnstile',
    sitekey: SITEKEY,
    pageurl: URL,
    action: 'managed',
    data: 'cdata_value',
    pagedata: 'chlpagedata_value',
  });
  assertResult(result);
});

test('turnstile: proxy', async () => {
  const solver = makeSolver();

  const result = await solver.turnstile(SITEKEY, URL, {
    proxy: { type: 'HTTP', uri: '1.2.3.4:3128' },
  });

  assertSent(solver, {
    method: 'turnstile',
    sitekey: SITEKEY,
    pageurl: URL,
    proxy: '1.2.3.4:3128',
    proxytype: 'HTTP',
  });
  assertResult(result);
});

test('turnstile: returns the User-Agent', async () => {
  const solver = makeSolver();

  const result = await solver.turnstile(SITEKEY, URL);

  assert.strictEqual(result.code, CODE);
  assert.strictEqual(result.userAgent, 'TestAgent/1.0');
});
