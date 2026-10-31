'use strict';

// CapSkip API parameter validation (https://capskip.com/api-docs/).

const { ValidationException } = require('./exceptions');

const NORMAL_SUBMIT = new Set(['method', 'body', 'json', 'file']);

const RECAPTCHA_V2_SUBMIT = new Set([
  'method', 'googlekey', 'pageurl', 'enterprise', 'invisible', 'data-s', 'json',
  'proxy', 'proxytype',
]);

const RECAPTCHA_V3_SUBMIT = new Set([
  'method', 'version', 'googlekey', 'pageurl', 'enterprise', 'action', 'min_score',
  'json', 'proxy', 'proxytype',
]);

const TURNSTILE_SUBMIT = new Set([
  'method', 'sitekey', 'pageurl', 'action', 'data', 'pagedata', 'json',
  'proxy', 'proxytype',
]);

const GEETEST_SUBMIT = new Set([
  'method', 'gt', 'challenge', 'pageurl', 'api_server', 'json',
  'proxy', 'proxytype',
]);

const ALTCHA_SUBMIT = new Set([
  'method', 'pageurl', 'challenge_url', 'challenge_json', 'json',
  'proxy', 'proxytype',
]);

const CAPY_SUBMIT = new Set([
  'method', 'captchakey', 'pageurl', 'api_server', 'version', 'useragent', 'json',
  'proxy', 'proxytype',
]);

const CAPTCHAFOX_SUBMIT = new Set([
  'method', 'sitekey', 'pageurl', 'api_server', 'useragent', 'json',
  'proxy', 'proxytype',
]);

const FRIENDLY_CAPTCHA_SUBMIT = new Set([
  'method', 'sitekey', 'pageurl', 'version', 'module_script', 'nomodule_script',
  'api_server', 'useragent', 'json', 'proxy', 'proxytype',
]);

const AMAZON_WAF_SUBMIT = new Set([
  'method', 'sitekey', 'pageurl', 'iv', 'context', 'challenge_script',
  'captcha_script', 'jsapiScript', 'json', 'proxy', 'proxytype',
]);

// The script parameters of an AWS WAF task. CapSkip POSTs the solution to the
// host these name, so it refuses any that is not a genuine AWS WAF one.
const AMAZON_WAF_SCRIPTS = ['challenge_script', 'captcha_script', 'jsapiScript'];

// The server's own test: one or more [A-Za-z0-9_-] path segments, then one of
// the three AWS WAF script files.
const AMAZON_WAF_SCRIPT_PATH = /^(\/[A-Za-z0-9_-]+)+\/(challenge|captcha|jsapi)\.js$/;

// CapSkip solves the puzzle family only. `avatar` is a different challenge
// behind a different endpoint; the server refuses it at submit time rather than
// answering it with a puzzle answer, which would bill for a solve the target
// site rejects.
const CAPY_VERSIONS = ['puzzle'];

// Both spellings the server accepts, and the bare digits it also takes.
const FRIENDLY_CAPTCHA_VERSIONS = ['v1', 'v2', '1', '2'];

// The only values CapSkip maps to a proxy scheme; it answers
// ERROR_BAD_PARAMETERS for anything else, SOCKS4 included. Matched
// case-insensitively, as the server does.
const PROXY_TYPES = ['HTTP', 'HTTPS', 'SOCKS5', 'SOCKS5H'];

const PARAM_ALIASES = {
  url: 'pageurl',
  score: 'min_score',
  minScore: 'min_score',
  datas: 'data-s',
  data_s: 'data-s',
  apiServer: 'api_server',
  api_subdomain: 'api_server',
  challengeUrl: 'challenge_url',
  challengeURL: 'challenge_url',
  challengeJson: 'challenge_json',
  challengeJSON: 'challenge_json',
  // The server reads userAgent and useragent interchangeably on every method
  // that takes one, so the SDK settles on the lowercase spelling its parameter
  // tables document and accepts the camelCase one callers arrive with.
  userAgent: 'useragent',
  user_agent: 'useragent',
  captchaKey: 'captchakey',
  moduleScript: 'module_script',
  nomoduleScript: 'nomodule_script',
  noModuleScript: 'nomodule_script',
  // AWS WAF: the API documents challenge_script / captcha_script in snake case
  // and jsapiScript in camel case, as 2Captcha does. Accept the other spelling
  // of each, which is what createTask-style callers arrive with.
  challengeScript: 'challenge_script',
  captchaScript: 'captcha_script',
  jsapi_script: 'jsapiScript',
};

function has(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

/** Format a list the way Python's `sorted(...)` repr does, for message parity. */
function reprList(values) {
  return `[${values.map((value) => `'${value}'`).join(', ')}]`;
}

function applyParamAliases(params) {
  const out = { ...params };
  for (const [alias, apiName] of Object.entries(PARAM_ALIASES)) {
    if (has(out, alias)) {
      if (has(out, apiName) && out[alias] !== out[apiName]) {
        throw new ValidationException(`Conflicting parameters: '${alias}' and '${apiName}'`);
      }
      out[apiName] = out[alias];
      delete out[alias];
    }
  }
  return out;
}

function isEmptyProxy(proxy) {
  if (proxy === null || proxy === undefined || proxy === '' || proxy === false || proxy === 0) {
    return true;
  }
  if (typeof proxy === 'object' && !Array.isArray(proxy) && Object.keys(proxy).length === 0) {
    return true;
  }
  return false;
}

function applyProxy(params) {
  const out = { ...params };
  const proxy = out.proxy;
  delete out.proxy;

  if (isEmptyProxy(proxy)) {
    return out;
  }

  if (typeof proxy === 'object' && !Array.isArray(proxy)) {
    if (!has(proxy, 'uri') || !has(proxy, 'type')) {
      throw new ValidationException("proxy dict must contain 'type' and 'uri' keys");
    }
    out.proxy = proxy.uri;
    out.proxytype = proxy.type;
  } else {
    out.proxy = proxy;
    if (!has(out, 'proxytype')) {
      out.proxytype = 'HTTP';
    }
  }
  return out;
}

function unknownKeys(params, allowed) {
  const excluded = new Set([...allowed, 'key', 'file', 'files']);
  return Object.keys(params).filter((key) => !excluded.has(key)).sort();
}

function validateNormalSubmit(params) {
  const unknown = unknownKeys(params, NORMAL_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for image captcha: ${reprList(unknown)}. `
      + 'CapSkip only supports: method, file/body, json.',
    );
  }
  if (has(params, 'proxy') || has(params, 'proxytype')) {
    throw new ValidationException(
      'Proxy is not supported for image captcha. '
      + 'Use proxy only with reCAPTCHA or Turnstile.',
    );
  }
}

function validateRecaptchaSubmit(params, version) {
  const normalized = String(version || 'v2').toLowerCase();
  let allowed;

  if (normalized === 'v3') {
    allowed = RECAPTCHA_V3_SUBMIT;
    if (params.invisible) {
      throw new ValidationException('invisible is only supported for reCAPTCHA v2.');
    }
  } else {
    allowed = RECAPTCHA_V2_SUBMIT;
    if (params.version === 'v3') {
      throw new ValidationException("Use version='v3' for reCAPTCHA v3.");
    }
    for (const key of ['action', 'min_score']) {
      if (has(params, key)) {
        throw new ValidationException(`'${key}' is only supported for reCAPTCHA v3.`);
      }
    }
  }

  const unknown = unknownKeys(params, allowed);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for reCAPTCHA ${normalized}: ${reprList(unknown)}.`,
    );
  }
}

function validateTurnstileSubmit(params) {
  const unknown = unknownKeys(params, TURNSTILE_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for Turnstile: ${reprList(unknown)}.`,
    );
  }
}

function validateGeetestSubmit(params) {
  // All three are documented as required. gt is static per site, challenge is
  // single-use and expires in about a minute; without them CapSkip answers
  // ERROR_BAD_PARAMETERS, and without pageurl ERROR_PAGEURL. Fail locally so a
  // missing value does not cost a round-trip.
  for (const key of ['gt', 'challenge', 'pageurl']) {
    if (!params[key]) {
      throw new ValidationException(`'${key}' is required for GeeTest v3.`);
    }
  }

  const unknown = unknownKeys(params, GEETEST_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for GeeTest: ${reprList(unknown)}.`,
    );
  }
}

/**
 * Drop unset challenge params and serialize an inline challenge document.
 *
 * `altcha(url, { challengeUrl, challengeJson })` is normally called with one of
 * the two left out, and the form body can only carry a string -- so a document
 * passed as an object is serialized rather than stringified into
 * "[object Object]". Mirrors the server, which reads a JSON-body `null` as
 * "not sent".
 */
function normalizeAltchaSubmit(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }

  const challenge = out.challenge_json;
  if (typeof challenge === 'object') {
    out.challenge_json = JSON.stringify(challenge);
  }

  return out;
}

function validateAltchaSubmit(params) {
  if (!params.pageurl) {
    throw new ValidationException("'pageurl' is required for ALTCHA.");
  }

  // CapSkip answers ERROR_BAD_PARAMETERS when neither is sent. Sending both is
  // deliberately allowed -- the inline document simply wins, because fetching
  // would only re-obtain what the caller already supplied.
  if (!params.challenge_url && !params.challenge_json) {
    throw new ValidationException(
      "ALTCHA needs a challenge: pass 'challenge_url' for CapSkip to fetch it, "
      + "or 'challenge_json' with the challenge document itself.",
    );
  }

  const unknown = unknownKeys(params, ALTCHA_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for ALTCHA: ${reprList(unknown)}.`,
    );
  }
}

/**
 * Drop parameters left unset so an omitted optional is not sent as "undefined".
 *
 * The form body can only carry strings, so a default of undefined would
 * otherwise reach the server stringified. Mirrors the server, which reads a
 * JSON-body `null` as "not sent".
 */
function dropUnset(params) {
  const out = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      out[key] = value;
    }
  }
  return out;
}

function validateCapySubmit(params) {
  // Both are documented as required; without captchakey the server answers
  // ERROR_BAD_PARAMETERS and without pageurl ERROR_PAGEURL. Fail locally so a
  // missing value does not cost a round-trip.
  for (const key of ['captchakey', 'pageurl']) {
    if (!params[key]) {
      throw new ValidationException(`'${key}' is required for Capy.`);
    }
  }

  const version = params.version;
  if (version !== undefined && version !== null && version !== ''
      && !CAPY_VERSIONS.includes(String(version).toLowerCase())) {
    throw new ValidationException(
      `Unsupported Capy version '${version}'. CapSkip solves the puzzle family `
      + "only -- 'avatar' is a different challenge behind a different endpoint, "
      + 'and the server refuses it rather than returning a puzzle answer the '
      + 'target site would reject.',
    );
  }

  const unknown = unknownKeys(params, CAPY_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for Capy: ${reprList(unknown)}.`,
    );
  }
}

function validateCaptchaFoxSubmit(params) {
  for (const key of ['sitekey', 'pageurl']) {
    if (!params[key]) {
      throw new ValidationException(`'${key}' is required for CaptchaFox.`);
    }
  }

  const unknown = unknownKeys(params, CAPTCHAFOX_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for CaptchaFox: ${reprList(unknown)}.`,
    );
  }
}

function validateFriendlyCaptchaSubmit(params) {
  for (const key of ['sitekey', 'pageurl']) {
    if (!params[key]) {
      throw new ValidationException(`'${key}' is required for Friendly Captcha.`);
    }
  }

  const version = params.version;
  if (version !== undefined && version !== null && version !== ''
      && !FRIENDLY_CAPTCHA_VERSIONS.includes(String(version).toLowerCase())) {
    throw new ValidationException(
      `Unsupported Friendly Captcha version '${version}'. Use 'v1' or 'v2' `
      + '(a bare 1 or 2 is accepted too). The two are different protocols '
      + 'sharing one sitekey namespace, so solving the wrong one returns a '
      + 'well-formed token the target site rejects.',
    );
  }

  const unknown = unknownKeys(params, FRIENDLY_CAPTCHA_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for Friendly Captcha: ${reprList(unknown)}.`,
    );
  }
}

/**
 * True for a script URL CapSkip will accept on an AWS WAF task.
 *
 * Mirrors the server: https, a host under .awswaf.com, no credentials or
 * explicit port, and a path ending in challenge.js, captcha.js or jsapi.js.
 * The server only applies the check once the task is queued, so failing here
 * saves a submit that could never solve.
 */
function isAmazonWafScriptUrl(url) {
  let parsed;
  try {
    parsed = new URL(String(url).trim());
  } catch (error) {
    return false;
  }
  // WHATWG URL already lowercases the scheme and host, and drops a :443 on an
  // https URL, so `port` is empty for both the default and an explicit 443.
  return parsed.protocol === 'https:'
    && parsed.hostname.toLowerCase().endsWith('.awswaf.com')
    && parsed.username === ''
    && parsed.password === ''
    && (parsed.port === '' || parsed.port === '443')
    && AMAZON_WAF_SCRIPT_PATH.test(parsed.pathname);
}

/**
 * Drop unset optionals, and the empty ones too: an AWS WAF optional left as ''
 * means "not sent" to the server, exactly like an absent one, so it is dropped
 * rather than tripping the iv/context pairing.
 */
function normalizeAmazonWafSubmit(params) {
  const out = {};
  for (const [key, value] of Object.entries(dropUnset(params))) {
    if (value !== '') {
      out[key] = value;
    }
  }
  return out;
}

function validateAmazonWafSubmit(params) {
  // Without sitekey the server answers ERROR_BAD_PARAMETERS and without
  // pageurl ERROR_PAGEURL. Fail locally so a missing value costs no round-trip.
  for (const key of ['sitekey', 'pageurl']) {
    if (!params[key]) {
      throw new ValidationException(`'${key}' is required for Amazon WAF.`);
    }
  }

  const pageurl = String(params.pageurl).trim();
  if (!/^https?:\/\//i.test(pageurl)) {
    throw new ValidationException(
      `'pageurl' must be a full http or https URL for Amazon WAF, got '${pageurl}'.`,
    );
  }

  // iv and context come off the same challenge page and only work as a pair;
  // the server refuses one without the other with ERROR_BAD_PARAMETERS.
  if (Boolean(params.iv) !== Boolean(params.context)) {
    throw new ValidationException(
      "Amazon WAF 'iv' and 'context' go together: send both (a challenge "
      + 'page) or neither (a widget page, or let CapSkip read them from pageurl).',
    );
  }

  for (const key of AMAZON_WAF_SCRIPTS) {
    const value = params[key];
    if (value && !isAmazonWafScriptUrl(value)) {
      throw new ValidationException(
        `'${key}' must be the https URL of an AWS WAF script on an awswaf.com `
        + `host (challenge.js, captcha.js or jsapi.js), got '${value}'. CapSkip `
        + 'refuses any other script, because it is not an AWS WAF integration.',
      );
    }
  }

  const unknown = unknownKeys(params, AMAZON_WAF_SUBMIT);
  if (unknown.length > 0) {
    throw new ValidationException(
      `Unsupported parameters for Amazon WAF: ${reprList(unknown)}.`,
    );
  }
}

function validateProxyType(params) {
  const proxytype = params.proxytype;
  if (proxytype === undefined || proxytype === null || proxytype === '') {
    return;
  }
  if (!PROXY_TYPES.includes(String(proxytype).toUpperCase())) {
    throw new ValidationException(
      `Unsupported proxytype '${proxytype}'. `
      + `CapSkip accepts: ${PROXY_TYPES.join(', ')}.`,
    );
  }
}

function prepareSubmitParams(params, captchaType, version = 'v2') {
  let prepared = applyParamAliases(params);
  prepared = applyProxy(prepared);

  if (captchaType === 'normal') {
    validateNormalSubmit(prepared);
  } else if (captchaType === 'recaptcha') {
    validateRecaptchaSubmit(prepared, version);
  } else if (captchaType === 'turnstile') {
    validateTurnstileSubmit(prepared);
  } else if (captchaType === 'geetest') {
    validateGeetestSubmit(prepared);
  } else if (captchaType === 'altcha') {
    prepared = normalizeAltchaSubmit(prepared);
    validateAltchaSubmit(prepared);
  } else if (captchaType === 'capy') {
    prepared = dropUnset(prepared);
    validateCapySubmit(prepared);
  } else if (captchaType === 'captchafox') {
    prepared = dropUnset(prepared);
    validateCaptchaFoxSubmit(prepared);
  } else if (captchaType === 'friendly_captcha') {
    prepared = dropUnset(prepared);
    validateFriendlyCaptchaSubmit(prepared);
  } else if (captchaType === 'amazon_waf') {
    prepared = normalizeAmazonWafSubmit(prepared);
    validateAmazonWafSubmit(prepared);
  }

  // Skipped for 'normal', which rejects proxy outright with a clearer message.
  if (captchaType !== 'normal') {
    validateProxyType(prepared);
  }

  return prepared;
}

module.exports = {
  NORMAL_SUBMIT,
  RECAPTCHA_V2_SUBMIT,
  RECAPTCHA_V3_SUBMIT,
  TURNSTILE_SUBMIT,
  GEETEST_SUBMIT,
  ALTCHA_SUBMIT,
  CAPY_SUBMIT,
  CAPTCHAFOX_SUBMIT,
  FRIENDLY_CAPTCHA_SUBMIT,
  AMAZON_WAF_SUBMIT,
  AMAZON_WAF_SCRIPTS,
  CAPY_VERSIONS,
  FRIENDLY_CAPTCHA_VERSIONS,
  PROXY_TYPES,
  PARAM_ALIASES,
  applyParamAliases,
  applyProxy,
  validateNormalSubmit,
  validateRecaptchaSubmit,
  validateTurnstileSubmit,
  validateGeetestSubmit,
  normalizeAltchaSubmit,
  validateAltchaSubmit,
  dropUnset,
  validateCapySubmit,
  validateCaptchaFoxSubmit,
  validateFriendlyCaptchaSubmit,
  isAmazonWafScriptUrl,
  normalizeAmazonWafSubmit,
  validateAmazonWafSubmit,
  validateProxyType,
  prepareSubmitParams,
};
