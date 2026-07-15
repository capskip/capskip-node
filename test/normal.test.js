'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { makeSolver, assertSent, assertResult } = require('./helpers/mockApiClient');

test('normal: base64 body', async () => {
  const solver = makeSolver();
  const body = 'A'.repeat(60);

  const result = await solver.normal(body);

  assertSent(solver, { method: 'base64', body });
  assertResult(result);
});

test('normal: data-URI', async () => {
  const solver = makeSolver();
  const body = 'A'.repeat(60);

  const result = await solver.normal(`data:image/png;base64,${body}`);

  assertSent(solver, { method: 'base64', body });
  assertResult(result);
});

test('normal: invalid file rejects', async () => {
  const solver = makeSolver();
  await assert.rejects(solver.normal('lost_file.png'), solver.exceptions);
});

test('normal: rejects unsupported params', async () => {
  const solver = makeSolver();
  await assert.rejects(
    solver.normal('A'.repeat(60), { numeric: 1 }),
    solver.exceptions,
  );
});

test('normal: rejects proxy', async () => {
  const solver = makeSolver();
  await assert.rejects(
    solver.normal('A'.repeat(60), { proxy: { type: 'HTTP', uri: '1.2.3.4:3128' } }),
    solver.exceptions,
  );
});
