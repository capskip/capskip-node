'use strict';

const fsSync = require('fs');

const { ApiClient } = require('./apiClient');
const { request } = require('./http');
const {
  applyParamAliases,
  applyProxy,
  prepareSubmitParams,
} = require('./apiParams');
const {
  CapSkipError,
  ApiException,
  NetworkException,
  TimeoutException,
  ValidationException,
} = require('./exceptions');

// First poll fires this soon after submitting (in seconds), then the interval
// backs off (doubling) up to the configured pollingInterval ceiling. Keeps
// latency low for fast local solves (e.g. image captchas) without hammering on
// slow ones.
const INITIAL_POLLING_INTERVAL = 0.25;

function sleep(seconds) {
  return new Promise((resolve) => { setTimeout(resolve, seconds * 1000); });
}

function nextPollInterval(interval, ceiling) {
  return Math.min(interval * 2, ceiling);
}

function reprList(values) {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

function parsePollResponse(response, jsonMode = 0) {
  const text = (response || '').trim();

  // CapSkip returns an empty body whenever no result is available yet: briefly
  // right after submit (before it starts reporting CAPCHA_NOT_READY), for an
  // unknown id, and after a solved token has already been read once. Treat it
  // like CAPCHA_NOT_READY so the caller keeps polling instead of failing.
  if (!text) {
    throw new NetworkException();
  }

  if (jsonMode) {
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new ApiException(`invalid JSON response: ${response}`);
    }

    if (data.status === 0 && data.request === 'CAPCHA_NOT_READY') {
      throw new NetworkException();
    }

    if (data.status !== 1) {
      throw new ApiException(`cannot recognize response ${JSON.stringify(data)}`);
    }

    return data;
  }

  if (text === 'CAPCHA_NOT_READY') {
    throw new NetworkException();
  }

  if (!text.startsWith('OK|')) {
    throw new ApiException(`cannot recognize response ${response}`);
  }

  return text.slice(3);
}

function applyPollResult(result, polled) {
  if (polled !== null && typeof polled === 'object') {
    result.code = polled.request !== undefined ? polled.request : '';
    const userAgent = polled.useragent || polled.userAgent;
    if (userAgent) {
      result.userAgent = userAgent;
    }
    // ALTCHA's createTask-shaped `solution` object. Carried through so
    // applyAltchaSolution can read the counter the server already worked out,
    // which is the only reliable source for a proof-of-work v2 answer; that
    // function deletes it, so it never reaches the caller.
    if (polled.solution !== null && typeof polled.solution === 'object') {
      result.solution = polled.solution;
    }
  } else {
    result.code = polled;
  }
  return result;
}

// GeeTest answers come back as a JSON string in `request`, keyed with the
// geetest_ prefix that the target site's own form fields use.
const GEETEST_FIELDS = [
  ['challenge', 'geetest_challenge'],
  ['validate', 'geetest_validate'],
  ['seccode', 'geetest_seccode'],
];

/**
 * Expand the GeeTest answer into `challenge` / `validate` / `seccode`.
 *
 * `code` keeps the raw JSON string so callers that forward it verbatim (or that
 * were written against another solver's API) keep working. If it does not parse,
 * the result is returned untouched rather than masking the server's reply.
 */
function applyGeetestSolution(result) {
  let payload;
  try {
    payload = JSON.parse(result.code || '');
  } catch (err) {
    return result;
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return result;
  }

  for (const [short, prefixed] of GEETEST_FIELDS) {
    const value = payload[prefixed] !== undefined ? payload[prefixed] : payload[short];
    if (value !== undefined && value !== null) {
      result[short] = value;
    }
  }

  return result;
}

// ALTCHA answers come back as a base64 payload: the challenge document with the
// winning counter added. That payload is what the site's own `altcha` form field
// carries, so it is posted back verbatim.

/**
 * Expose the answer as `token`, and the winning counter as `number`.
 *
 * `code` keeps the raw answer so callers that forward it verbatim (or that were
 * written against another solver's API) keep working; `token` is the same string,
 * named for the form field it goes into. If the payload does not decode, the
 * result is returned untouched rather than masking the server's reply.
 */
/**
 * Dig the winning counter out of a token, whichever scheme produced it.
 *
 * The two ALTCHA generations nest it differently: a legacy payload is the
 * challenge document with a top-level `number` added, while a proof-of-work v2
 * payload is `{ challenge: {...}, solution: { counter: N, ... } }` and has no
 * `number` at all. Returns undefined if the payload does not decode.
 */
function tokenCounter(code) {
  let payload;
  try {
    const decoded = Buffer.from(code, 'base64');
    // Buffer.from is lenient: it drops invalid characters instead of throwing,
    // so round-trip to confirm the input really was base64 before trusting it.
    if (decoded.toString('base64').replace(/=+$/, '') !== code.replace(/=+$/, '')) {
      return undefined;
    }
    payload = JSON.parse(decoded.toString('utf8'));
  } catch (err) {
    return undefined;
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return undefined;
  }

  if (payload.number !== undefined) {
    return payload.number;
  }

  if (payload.solution !== null && typeof payload.solution === 'object') {
    return payload.solution.counter;
  }

  return undefined;
}

/**
 * Expose the answer as `token`, and the winning counter as `number`.
 *
 * `code` keeps the raw answer so callers that forward it verbatim (or that were
 * written against another solver's API) keep working; `token` is the same
 * string, named for the form field it goes into.
 *
 * The counter comes from the server's own `solution` object when the poll
 * carried one, because that is the single field both ALTCHA generations report
 * the same way. Only if it is absent — a plain-text poll — is it dug out of the
 * token, which is shaped differently per scheme. If neither yields one, the
 * result keeps its token and simply has no `number`, rather than masking the
 * server's reply.
 */
function applyAltchaSolution(result) {
  const code = result.code || '';
  result.token = code;

  const { solution } = result;
  delete result.solution;

  let number = solution !== null && typeof solution === 'object'
    ? solution.number
    : undefined;
  if (number === undefined) {
    number = tokenCounter(code);
  }

  if (number !== undefined) {
    result.number = number;
  }

  return result;
}

// A Capy solution is not a token. It is three values that together go into the
// target form, under the capy_ prefixed names the widget would have filled in.
const CAPY_FIELDS = ['captchakey', 'challengekey', 'answer', 'respKey'];

/**
 * Expand the Capy answer into `captchakey` / `challengekey` / `answer`.
 *
 * `code` keeps the raw answer -- an object when polled with json=1, where the
 * server puts it straight into `request`, or the JSON string it sends after
 * `OK|` in plain-text mode -- so callers that forward it verbatim (or that were
 * written against another solver's API) keep working.
 *
 * If the answer does not parse, the result is returned untouched rather than
 * masking the server's reply.
 */
function applyCapySolution(result) {
  let payload = result.solution;
  delete result.solution;

  if (payload === null || typeof payload !== 'object') {
    const { code } = result;
    if (code !== null && typeof code === 'object') {
      payload = code;
    } else {
      try {
        payload = JSON.parse(code || '');
      } catch (error) {
        return result;
      }
    }
  }

  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return result;
  }

  for (const field of CAPY_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(payload, field)) {
      result[field] = payload[field];
    }
  }

  return result;
}

/**
 * Expose a single-token answer as `token`, named for the form field it fills.
 *
 * `code` keeps the raw answer so callers that forward it verbatim keep working;
 * `token` is the same string. The server's createTask-shaped `solution` object
 * carries that same string, so it is consumed here rather than handed back as a
 * second copy -- but it is read first when `request` came through empty, so a
 * client is never left without the token the poll actually carried.
 */
function applyTokenSolution(result) {
  const { solution } = result;
  delete result.solution;

  let code = result.code;

  if (!code && solution !== null && typeof solution === 'object') {
    code = solution.token || '';
    result.code = code;
  }

  result.token = code || '';
  return result;
}

// CapSkip's in.php returns OK|<id> by default, or {"status":1,"request":"<id>"}
// when the submit carried json=1. Accept both so submitting with json=1 works.
function parseSubmitResponse(response) {
  const text = (response || '').trim();

  if (text.startsWith('OK|')) {
    return text.slice(3);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    data = null;
  }

  if (data !== null && typeof data === 'object' && data.status === 1 && data.request !== undefined) {
    return String(data.request);
  }

  throw new ApiException(`cannot recognize response ${response}`);
}

/** Client for the CapSkip local captcha solver (image, reCAPTCHA, Turnstile, GeeTest v3, ALTCHA). */
class CapSkip {
  constructor({
    apiKey = 'capskip',
    host = '127.0.0.1',
    port = 8080,
    defaultTimeout = 120,
    recaptchaTimeout = 300,
    pollingInterval = 5,
  } = {}) {
    this.apiKey = apiKey;
    this.defaultTimeout = defaultTimeout;
    this.recaptchaTimeout = recaptchaTimeout;
    this.pollingInterval = pollingInterval;
    this.apiClient = new ApiClient({ host, port });
    this.exceptions = CapSkipError;
  }

  async normal(file, options = {}) {
    const unsupported = Object.keys(options).filter((key) => key !== 'json').sort();
    if (unsupported.length > 0) {
      throw new ValidationException(
        `Unsupported parameters for image captcha: ${reprList(unsupported)}. `
        + 'Only json is supported besides the image input.',
      );
    }
    const method = await this.getMethod(file);
    return this.solve({ ...method, ...options });
  }

  async recaptcha(sitekey, url, options = {}) {
    const { version = 'v2', enterprise = 0, ...rest } = options;
    const params = {
      googlekey: sitekey,
      url,
      method: 'userrecaptcha',
      enterprise,
      ...rest,
    };
    if (String(version).toLowerCase() === 'v3') {
      params.version = 'v3';
    }
    return this.solve({ timeout: this.recaptchaTimeout, ...params });
  }

  async turnstile(sitekey, url, options = {}) {
    return this.solve({
      sitekey,
      url,
      ...options,
      method: 'turnstile',
      poll_json: 1,
    });
  }

  /**
   * Solve a GeeTest v3 slider.
   *
   * `gt` is static per site; `challenge` is single-use and expires in about a
   * minute, so fetch a fresh pair immediately before calling this. Pass
   * `api_server` when the site uses a non-default GeeTest API server domain.
   *
   * The result carries the raw answer as `code` (a JSON string) plus the parsed
   * `challenge`, `validate`, and `seccode` fields to post back to the target site.
   */
  async geetest(gt, challenge, url, options = {}) {
    // Like reCAPTCHA, this is a real browser solve (load, slide, verify) and can
    // retry internally, so it gets the longer of the two timeouts unless the
    // caller asked for a specific one.
    const result = await this.solve({
      timeout: this.recaptchaTimeout,
      gt,
      challenge,
      url,
      ...options,
      method: 'geetest',
      poll_json: 1,
    });
    return applyGeetestSolution(result);
  }

  /**
   * Solve an ALTCHA proof-of-work challenge.
   *
   * Pass `challengeUrl` for CapSkip to fetch the challenge itself, or
   * `challengeJson` with the document you already have (a JSON string, or an
   * object which is serialized for you). Sending both is allowed -- the inline
   * document wins. A proxy applies only to the `challengeUrl` fetch.
   *
   * Challenges expire fast -- some sites inside two minutes -- and an expired one
   * is refused with a bare "verification failed" that looks exactly like a wrong
   * answer. Fetch the challenge immediately before calling, and post the token
   * promptly.
   *
   * The result carries the raw answer as `code`, the same string as `token`
   * (what the site's `altcha` form field expects, verbatim), and the counter
   * that solved it as `number`.
   */
  async altcha(url, options = {}) {
    // An unset challenge param is dropped rather than sent as undefined, so
    // `altcha(url, { challengeUrl, challengeJson })` works with either left out.
    const given = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        given[key] = value;
      }
    }

    // Unlike GeeTest and reCAPTCHA this is CPU proof-of-work measured in
    // milliseconds, not a browser solve, so it keeps the default timeout.
    const result = await this.solve({
      url,
      ...given,
      method: 'altcha',
      poll_json: 1,
    });
    return applyAltchaSolution(result);
  }

  /**
   * Solve a Capy Puzzle captcha.
   *
   * `sitekey` is the site's public Capy key, conventionally prefixed `PUZZLE_`;
   * it is sent as the `captchakey` the API documents. Pass `api_server` when the
   * widget script points somewhere other than `https://jp.api.capy.me`.
   *
   * The result is not a token. It carries `captchakey`, `challengekey` and
   * `answer`, which go into the target form's `capy_captchakey`,
   * `capy_challengekey` and `capy_answer` fields, plus the raw answer as `code`.
   * Submit `answer` verbatim -- it is the drag path the widget would have
   * recorded, so trimming or re-encoding it invalidates the solve.
   *
   * The challenge key is single-use and short-lived, so submit promptly rather
   * than caching the three values for a later request.
   */
  async capy(sitekey, url, options = {}) {
    // An unset optional is dropped rather than sent as undefined, so
    // `capy(key, url, { apiServer: undefined })` behaves as if it were omitted.
    const given = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        given[key] = value;
      }
    }

    // A Capy solve is one HTTP fetch plus pixel math, not a browser session, so
    // it keeps the default timeout. It is held back to roughly two seconds
    // before the answer is released -- Capy refuses answers that arrive faster
    // than a human could have produced them -- which the default absorbs.
    const result = await this.solve({
      captchakey: sitekey,
      url,
      ...given,
      method: 'capy',
      poll_json: 1,
    });
    return applyCapySolution(result);
  }

  /**
   * Solve a CaptchaFox challenge.
   *
   * `sitekey` is the public key the widget renders with, conventionally prefixed
   * `sk_`, and `url` has to be the page the widget actually runs on: CaptchaFox
   * checks it against the domains the key is registered for and refuses a
   * mismatch permanently rather than intermittently.
   *
   * Pass `api_server` only when the target page does not load the default
   * widget. A page loading the MAM package expects a `MAM_` prefixed token, and
   * sending the wrong source still succeeds -- it just returns a token in a
   * format the site will not accept, which reads as a silent verification
   * failure rather than an error.
   *
   * The result carries the token as both `code` and `token`, for the form's
   * `cf-captcha-response` field, and `userAgent` when the solve reported one.
   * That User-Agent is the browser's own, not any you sent, so submit the token
   * under it.
   */
  async captchafox(sitekey, url, options = {}) {
    const given = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        given[key] = value;
      }
    }

    // A real browser session, like reCAPTCHA and GeeTest, and longer again when
    // an interactive challenge is drawn -- so it gets the longer of the two
    // timeouts unless the caller asked for a specific one.
    const result = await this.solve({
      timeout: this.recaptchaTimeout,
      sitekey,
      url,
      ...given,
      method: 'captchafox',
      poll_json: 1,
    });
    return applyTokenSolution(result);
  }

  /**
   * Solve a Friendly Captcha proof-of-work challenge.
   *
   * Two different protocols ship under this name and a sitekey does not tell you
   * which one a site uses, so say which: pass `version: 'v1'` or `version: 'v2'`,
   * or pass `moduleScript` with the src of the widget's `type="module"` script
   * tag and let CapSkip read the version off the build the site actually loads.
   * With neither, v1 is assumed. Solving the wrong version returns a well-formed
   * token the target site rejects, with nothing to indicate the version was the
   * problem.
   *
   * Pass `api_server: 'eu'` for a sitekey on the EU data-residency tenant; both
   * tenants mint a token for the same sitekey, so the wrong one is only caught
   * by the site's own verification.
   *
   * The result carries the token as both `code` and `token`. It goes into
   * `frc-captcha-solution` on v1 and `frc-captcha-response` on v2 -- the field
   * names differ, which is what catches an integration moved from one to the
   * other. A v2 token is roughly six kilobytes, so size whatever carries it
   * accordingly.
   */
  async friendlyCaptcha(sitekey, url, options = {}) {
    const given = {};
    for (const [key, value] of Object.entries(options)) {
      if (value !== undefined && value !== null) {
        given[key] = value;
      }
    }

    // Proof-of-work, but not the millisecond kind ALTCHA does: the service sets
    // the difficulty per request and raises it for addresses it has seen a lot
    // of, and v2 always solves in a browser. Both make solve time variable
    // enough to want the longer timeout.
    const result = await this.solve({
      timeout: this.recaptchaTimeout,
      sitekey,
      url,
      ...given,
      method: 'friendly_captcha',
      poll_json: 1,
    });
    return applyTokenSolution(result);
  }

  async solve(options = {}) {
    const {
      timeout = 0,
      polling_interval: pollingInterval = 0,
      poll_json: pollJson = 0,
      ...params
    } = options;

    const useJson = Number(pollJson) || 0;
    const captchaId = await this.send(params);
    const result = { captchaId };
    const solveTimeout = timeout || this.defaultTimeout;
    const interval = pollingInterval || this.pollingInterval;
    const polled = await this.waitResult(captchaId, solveTimeout, interval, useJson);
    return applyPollResult(result, polled);
  }

  async waitResult(id, timeout, pollingInterval, json = 0) {
    const deadline = Date.now() + timeout * 1000;
    let interval = Math.min(INITIAL_POLLING_INTERVAL, pollingInterval);
    while (Date.now() < deadline) {
      try {
        return await this.getResult(id, json);
      } catch (err) {
        if (!(err instanceof NetworkException)) {
          throw err;
        }
        await sleep(interval);
        interval = nextPollInterval(interval, pollingInterval);
      }
    }
    throw new TimeoutException(`timeout ${timeout} exceeded`);
  }

  async getMethod(file) {
    if (!file) {
      throw new ValidationException('File required');
    }
    if (file.startsWith('data:')) {
      return { method: 'base64', body: file.slice(file.indexOf(',') + 1) };
    }
    if (!file.includes('.') && file.length > 50) {
      return { method: 'base64', body: file };
    }
    if (file.startsWith('http')) {
      const resp = await request('GET', file);
      if (resp.statusCode !== 200) {
        throw new ValidationException(`File could not be downloaded from url: ${file}`);
      }
      return { method: 'base64', body: resp.body.toString('base64') };
    }
    if (!fsSync.existsSync(file)) {
      throw new ValidationException(`File not found: ${file}`);
    }
    return { method: 'post', file };
  }

  async send(params = {}) {
    const prepared = this._prepareSendParams({ ...params, key: this.apiKey });
    const files = prepared.files || {};
    delete prepared.files;
    const response = await this.apiClient.in_({ files, ...prepared });
    return parseSubmitResponse(response);
  }

  async getResult(id, json = 0) {
    const query = { key: this.apiKey, action: 'get', id };
    if (json) {
      query.json = 1;
    }
    const response = await this.apiClient.res(query);
    return parsePollResponse(response, json ? 1 : 0);
  }

  _prepareSendParams(params) {
    const { method } = params;
    if (method === 'post' || method === 'base64') {
      return prepareSubmitParams(params, 'normal');
    }
    if (method === 'userrecaptcha') {
      return prepareSubmitParams(params, 'recaptcha', params.version || 'v2');
    }
    if (method === 'turnstile') {
      return prepareSubmitParams(params, 'turnstile');
    }
    if (method === 'geetest') {
      return prepareSubmitParams(params, 'geetest');
    }
    if (method === 'altcha') {
      return prepareSubmitParams(params, 'altcha');
    }
    if (method === 'capy') {
      return prepareSubmitParams(params, 'capy');
    }
    if (method === 'captchafox') {
      return prepareSubmitParams(params, 'captchafox');
    }
    if (method === 'friendly_captcha') {
      return prepareSubmitParams(params, 'friendly_captcha');
    }
    return applyProxy(applyParamAliases(params));
  }
}

module.exports = {
  CapSkip,
  INITIAL_POLLING_INTERVAL,
  nextPollInterval,
  parsePollResponse,
  parseSubmitResponse,
  applyPollResult,
  applyGeetestSolution,
  applyAltchaSolution,
  applyCapySolution,
  applyTokenSolution,
};
