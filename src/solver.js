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
  } else {
    result.code = polled;
  }
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

/** Client for the CapSkip local captcha solver (image, reCAPTCHA, Turnstile). */
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
};
