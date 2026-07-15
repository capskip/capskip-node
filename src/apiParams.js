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

const PARAM_ALIASES = {
  url: 'pageurl',
  score: 'min_score',
  minScore: 'min_score',
  datas: 'data-s',
  data_s: 'data-s',
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

function prepareSubmitParams(params, captchaType, version = 'v2') {
  let prepared = applyParamAliases(params);
  prepared = applyProxy(prepared);

  if (captchaType === 'normal') {
    validateNormalSubmit(prepared);
  } else if (captchaType === 'recaptcha') {
    validateRecaptchaSubmit(prepared, version);
  } else if (captchaType === 'turnstile') {
    validateTurnstileSubmit(prepared);
  }

  return prepared;
}

module.exports = {
  NORMAL_SUBMIT,
  RECAPTCHA_V2_SUBMIT,
  RECAPTCHA_V3_SUBMIT,
  TURNSTILE_SUBMIT,
  PARAM_ALIASES,
  applyParamAliases,
  applyProxy,
  validateNormalSubmit,
  validateRecaptchaSubmit,
  validateTurnstileSubmit,
  prepareSubmitParams,
};
