'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { makeSolver, assertSent, assertResult } = require('./helpers/mockApiClient');

const SITEKEY = '6Le-wvkSVVABCPBMRTvw0Q4Muexq1bi0DJwx_mJ-';
const URL = 'https://mysite.com/page/with/recaptcha';

test('recaptcha: v2 (invisible + data-s)', async () => {
  const solver = makeSolver();

  const result = await solver.recaptcha(SITEKEY, URL, {
    invisible: 1,
    datas: 'Crb7VsRAQaBqoaQQtHQQ',
  });

  assertSent(solver, {
    method: 'userrecaptcha',
    googlekey: SITEKEY,
    pageurl: URL,
    invisible: 1,
    enterprise: 0,
    'data-s': 'Crb7VsRAQaBqoaQQtHQQ',
  });
  assertResult(result);
});

test('recaptcha: v2 rejects a v3 action', async () => {
  const solver = makeSolver();
  await assert.rejects(
    solver.recaptcha('6Le-wvkS...', 'https://example.com', { action: 'verify' }),
    solver.exceptions,
  );
});

test('recaptcha: v2 enterprise', async () => {
  const solver = makeSolver();

  const result = await solver.recaptcha(SITEKEY, URL, { enterprise: 1 });

  assertSent(solver, {
    method: 'userrecaptcha',
    googlekey: SITEKEY,
    pageurl: URL,
    enterprise: 1,
  });
  assertResult(result);
});

test('recaptcha: v3', async () => {
  const solver = makeSolver();

  const result = await solver.recaptcha(SITEKEY, URL, {
    action: 'verify',
    version: 'v3',
    score: 0.7,
  });

  assertSent(solver, {
    method: 'userrecaptcha',
    googlekey: SITEKEY,
    pageurl: URL,
    enterprise: 0,
    action: 'verify',
    version: 'v3',
    min_score: 0.7,
  });
  assertResult(result);
});

test('recaptcha: proxy', async () => {
  const solver = makeSolver();

  const result = await solver.recaptcha(SITEKEY, URL, {
    proxy: { type: 'HTTPS', uri: 'login:password@1.2.3.4:3128' },
  });

  assertSent(solver, {
    method: 'userrecaptcha',
    googlekey: SITEKEY,
    pageurl: URL,
    enterprise: 0,
    proxy: 'login:password@1.2.3.4:3128',
    proxytype: 'HTTPS',
  });
  assertResult(result);
});
