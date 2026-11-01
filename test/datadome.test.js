'use strict';

const { test } = require('node:test');
const assert = require('node:assert');

const { CapSkip } = require('../src');
const { applyDataDomeSolution } = require('../src/solver');
const { parseDataDomeCaptchaUrl, isDataDomeUserAgent } = require('../src/apiParams');
const { ValidationException } = require('../src/exceptions');

const PAGE_URL = 'https://www.example.com/';
const CAPTCHA_URL = 'https://geo.captcha-delivery.com/captcha/?initialCid=AHrlqAAAAAMA7KBvCr0n4cEAG330MA%3D%3D'
  + '&hash=D013AA612AB2224D03B2318D0F5B19&cid=KzE6_pZBBTHdCdvZkauT9VAshi0wS7~v5_M_MacEtdw8'
  + '&t=fe&referer=https%3A%2F%2Fwww.example.com%2F&s=45225&e=549255a0289eaf17af60822309ab8db4&dm=cd';
const INTERSTITIAL_URL = 'https://geo.captcha-delivery.com/interstitial/?initialCid=AHrlqAAAAAMA7KBvCr0n4cEAG330MA%3D%3D'
  + '&hash=D013AA612AB2224D03B2318D0F5B19&cid=KzE6_pZBBTHdCdvZkauT9VAshi0wS7~v5_M_MacEtdw8'
  + '&referer=https%3A%2F%2Fwww.example.com%2F&s=45225&b=1612345&dm=cd';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36';

// What CapSkip hands back: the cookie exactly as DataDome set it, the
// User-Agent it was earned with, and the proxy its own list supplied.
const COOKIE = 'datadome=FAPPpli4jkT1MZGtgF8ez7mjSz8MrJ9fGRNE51Gj79cq9fXp5xn~F1P5APWjqvJojf4U9dq0R81Xaj2hpYtjle95mkg; '
  + 'Max-Age=31536000; Domain=.example.com; Path=/; Secure; SameSite=Lax';
const COOKIE_PAIR = 'datadome=FAPPpli4jkT1MZGtgF8ez7mjSz8MrJ9fGRNE51Gj79cq9fXp5xn~F1P5APWjqvJojf4U9dq0R81Xaj2hpYtjle95mkg';
const LIST_PROXY = '203.0.113.10:8080';

// Mock client answering as CapSkip does for a DataDome task.
class DataDomeApiClient {
  constructor(proxy = LIST_PROXY) {
    this.proxy = proxy;
  }

  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    this.incomings = fields;
    this.incomingFiles = files;
    return 'OK|123';
  }

  async res(params = {}) {
    this.polled = params;
    if (params.json === 1 || params.json === '1') {
      const reply = { status: 1, request: COOKIE, userAgent: USER_AGENT };
      if (this.proxy) {
        reply.proxy = this.proxy;
      }
      return JSON.stringify(reply);
    }
    return `OK|${COOKIE}`;
  }
}

function makeSolver(proxy) {
  const solver = new CapSkip({ apiKey: 'API_KEY', pollingInterval: 1 });
  solver.apiClient = new DataDomeApiClient(proxy);
  return solver;
}

// The minimal call every refusal test starts from.
function solve(solver, options = {}) {
  const { captcha_url: captchaUrl = CAPTCHA_URL, pageurl = PAGE_URL, ...rest } = options;
  return solver.dataDome(captchaUrl, pageurl, rest);
}

function assertSent(solver, expected) {
  assert.deepStrictEqual(solver.apiClient.incomings, { ...expected, key: 'API_KEY' });
}

// -- what goes out ----------------------------------------------------------

test('dataDome submits the minimal task', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assertSent(solver, {
    method: 'datadome',
    captcha_url: CAPTCHA_URL,
    pageurl: PAGE_URL,
  });
  assert.strictEqual(result.captchaId, '123');
  // Polled as JSON, so userAgent and proxy come back with the cookie.
  assert.strictEqual(solver.apiClient.polled.json, 1);
});

test('dataDome takes the arguments in 2Captcha order', async () => {
  // 2Captcha's datadome(captcha_url, pageurl, userAgent, proxy), with userAgent
  // and proxy as options as on every other Node method.
  const solver = makeSolver();

  await solver.dataDome(CAPTCHA_URL, PAGE_URL, {
    userAgent: USER_AGENT,
    proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  });

  assertSent(solver, {
    method: 'datadome',
    captcha_url: CAPTCHA_URL,
    pageurl: PAGE_URL,
    useragent: USER_AGENT,
    proxy: 'login:password@1.2.3.4:8080',
    proxytype: 'HTTP',
  });
});

test('dataDome accepts pageurl in options in place of url', async () => {
  const solver = makeSolver();

  await solver.dataDome(CAPTCHA_URL, undefined, { pageurl: PAGE_URL });

  assert.strictEqual(solver.apiClient.incomings.pageurl, PAGE_URL);
});

test('dataDome accepts camel-case captchaUrl', async () => {
  const solver = makeSolver();

  await solver.dataDome(undefined, PAGE_URL, { captchaUrl: CAPTCHA_URL });
  assert.strictEqual(solver.apiClient.incomings.captcha_url, CAPTCHA_URL);

  await solver.dataDome(null, PAGE_URL, { captchaURL: CAPTCHA_URL });
  assert.strictEqual(solver.apiClient.incomings.captcha_url, CAPTCHA_URL);
});

test('dataDome refuses a captchaUrl that conflicts with the argument', async () => {
  const solver = makeSolver();

  await assert.rejects(
    () => solver.dataDome(CAPTCHA_URL, PAGE_URL, { captchaUrl: INTERSTITIAL_URL }),
    ValidationException,
  );
});

test('dataDome submits an interstitial device check', async () => {
  const solver = makeSolver();

  await solve(solver, { captcha_url: INTERSTITIAL_URL });

  assert.strictEqual(solver.apiClient.incomings.captcha_url, INTERSTITIAL_URL);
});

test('dataDome accepts an HTML-escaped iframe src and sends it unchanged', async () => {
  // An iframe src copied out of the page source carries &amp;; the server
  // decodes it, so it is not refused here either.
  const solver = makeSolver();
  const escaped = CAPTCHA_URL.split('&').join('&amp;');

  await solve(solver, { captcha_url: escaped });

  assert.strictEqual(solver.apiClient.incomings.captcha_url, escaped);
});

test('dataDome accepts a scheme-relative captcha_url and a trailing-slash-free path', async () => {
  assert.ok(parseDataDomeCaptchaUrl(CAPTCHA_URL.replace('https:', '')));
  assert.ok(parseDataDomeCaptchaUrl(CAPTCHA_URL.replace('/captcha/?', '/captcha?')));
  assert.ok(parseDataDomeCaptchaUrl(CAPTCHA_URL.replace('geo.captcha-delivery.com', 'GEO.Captcha-Delivery.COM')));
  assert.ok(parseDataDomeCaptchaUrl(CAPTCHA_URL.replace('geo.captcha-delivery.com', 'captcha-delivery.com')));
});

test('dataDome treats empty optionals as not sent', async () => {
  const solver = makeSolver();

  await solve(solver, { userAgent: '', proxy: '' });

  assertSent(solver, {
    method: 'datadome',
    captcha_url: CAPTCHA_URL,
    pageurl: PAGE_URL,
  });
});

test('dataDome defaults a string proxy to HTTP', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: '1.2.3.4:8080' });

  const sent = solver.apiClient.incomings;
  assert.strictEqual(sent.proxy, '1.2.3.4:8080');
  assert.strictEqual(sent.proxytype, 'HTTP');
});

test('dataDome takes a SOCKS5H proxy', async () => {
  const solver = makeSolver();

  await solve(solver, { proxy: { type: 'SOCKS5H', uri: '1.2.3.4:1080' } });

  assert.strictEqual(solver.apiClient.incomings.proxytype, 'SOCKS5H');
});

test('dataDome uses the browser timeout', async () => {
  const solver = makeSolver();
  solver.recaptchaTimeout = 321;
  let seen;
  const original = solver.waitResult.bind(solver);
  solver.waitResult = (id, timeout, pollingInterval, json) => {
    seen = timeout;
    return original(id, timeout, pollingInterval, json);
  };

  await solve(solver);
  assert.strictEqual(seen, 321);

  await solve(solver, { timeout: 42 });
  assert.strictEqual(seen, 42);
});

// -- what comes back --------------------------------------------------------

test('dataDome result carries the cookie, User-Agent and list proxy', async () => {
  const solver = makeSolver();

  const result = await solve(solver);

  assert.strictEqual(result.code, COOKIE);
  assert.strictEqual(result.cookie, COOKIE_PAIR);
  assert.strictEqual(result.userAgent, USER_AGENT);
  assert.strictEqual(result.proxy, LIST_PROXY);
});

test('dataDome result has no proxy when CapSkip used none', async () => {
  const solver = makeSolver(null);

  const result = await solve(solver);

  assert.ok(!('proxy' in result));
  assert.strictEqual(result.cookie, COOKIE_PAIR);
});

test('dataDome expansion leaves a non-string answer alone', () => {
  const result = applyDataDomeSolution({ captchaId: '1', code: { x: 1 } });
  assert.ok(!('cookie' in result));
  assert.deepStrictEqual(result.code, { x: 1 });

  const empty = applyDataDomeSolution({ captchaId: '1', code: '' });
  assert.ok(!('cookie' in empty));
});

test('dataDome expansion of a bare cookie', () => {
  const result = applyDataDomeSolution({ captchaId: '1', code: 'datadome=abc' });
  assert.strictEqual(result.cookie, 'datadome=abc');
});

// -- refused locally, as the server would refuse them -----------------------

async function assertRefused(options, pattern) {
  const solver = makeSolver();
  let message;
  await assert.rejects(
    () => solve(solver, options),
    (error) => {
      message = error.message;
      return error instanceof ValidationException;
    },
  );
  assert.strictEqual(solver.apiClient.incomings, undefined);
  if (pattern) {
    assert.match(message, pattern);
  }
}

test('dataDome refuses a missing captcha_url', async () => {
  await assertRefused({ captcha_url: null }, /captcha_url/);
  await assertRefused({ captcha_url: '' }, /captcha_url/);
});

test('dataDome refuses a missing pageurl', async () => {
  await assertRefused({ pageurl: null }, /pageurl/);
  await assertRefused({ pageurl: '' }, /pageurl/);
});

test('dataDome refuses a captcha_url off DataDome', async () => {
  await assertRefused({ captcha_url: CAPTCHA_URL.replace('captcha-delivery.com', 'evil.example') });
});

test('dataDome refuses a lookalike captcha_url host', async () => {
  await assertRefused({ captcha_url: CAPTCHA_URL.replace('geo.captcha-delivery.com', 'evilcaptcha-delivery.com') });
});

test('dataDome refuses a captcha_url over http', async () => {
  await assertRefused({ captcha_url: CAPTCHA_URL.replace('https://', 'http://') });
});

test('dataDome refuses a captcha_url on another path', async () => {
  await assertRefused({ captcha_url: CAPTCHA_URL.replace('/captcha/', '/other/') });
});

test('dataDome refuses a captcha_url without the challenge ids', async () => {
  await assertRefused({ captcha_url: 'https://geo.captcha-delivery.com/captcha/?initialCid=A&hash=B' });
});

test('dataDome refuses a block page that bans the address (t=bv)', async () => {
  await assertRefused({ captcha_url: CAPTCHA_URL.replace('t=fe', 't=bv') }, /t=bv/);
});

test('dataDome refuses a pageurl that is not http(s)', async () => {
  await assertRefused({ pageurl: 'ftp://www.example.com/' });
  await assertRefused({ pageurl: 'www.example.com' });
});

test('dataDome refuses a pageurl on the challenge host', async () => {
  await assertRefused({ pageurl: 'https://geo.captcha-delivery.com/' });
});

test('dataDome refuses a Firefox User-Agent', async () => {
  await assertRefused(
    { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0' },
    /stock Chrome for Windows/,
  );
});

test('dataDome refuses a Mac Chrome User-Agent', async () => {
  await assertRefused({ userAgent: USER_AGENT.replace('Windows NT 10.0; Win64; x64', 'Macintosh; Intel Mac OS X 10_15_7') });
});

test('dataDome refuses an Edge User-Agent', async () => {
  await assertRefused({ userAgent: `${USER_AGENT} Edg/156.0.0.0` });
});

test('dataDome refuses an Android Chrome User-Agent', async () => {
  await assertRefused({
    userAgent: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 '
      + '(KHTML, like Gecko) Chrome/156.0.0.0 Mobile Safari/537.36',
  });
});

test('dataDome User-Agent check takes stock Windows Chrome only', () => {
  assert.ok(isDataDomeUserAgent(USER_AGENT));
  assert.ok(!isDataDomeUserAgent(USER_AGENT.replace('Chrome/156.0.0.0', 'Chrome/156')));
  assert.ok(!isDataDomeUserAgent(USER_AGENT.replace('Chrome/', 'HeadlessChrome/')));
  assert.ok(!isDataDomeUserAgent(`${USER_AGENT} OPR/120.0.0.0`));
});

test('dataDome refuses a SOCKS4 proxy', async () => {
  await assertRefused({ proxy: { type: 'SOCKS4', uri: '1.2.3.4:1080' } });
});

test('dataDome refuses an unknown parameter', async () => {
  await assertRefused({ sitekey: 'nope' }, /Unsupported parameters for DataDome/);
});
