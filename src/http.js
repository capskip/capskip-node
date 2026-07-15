'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { URL } = require('url');

// Zero-dependency HTTP layer built on Node's core http/https modules. CapSkip
// only ever talks to a local endpoint (in.php / res.php) plus the occasional
// image download, so a small request helper is all the SDK needs.

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function stringifyValue(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
}

/** Encode an object as an application/x-www-form-urlencoded body / query string. */
function encodeParams(params) {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(stringifyValue(value))}`)
    .join('&');
}

/** Build a `?a=b&c=d` query string (empty string when there are no params). */
function buildQuery(params) {
  const query = encodeParams(params);
  return query ? `?${query}` : '';
}

/** Encode form fields plus file parts as a multipart/form-data body. */
function encodeMultipart(fields, files) {
  const boundary = `----CapSkipFormBoundary${crypto.randomBytes(16).toString('hex')}`;
  const parts = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${name}"\r\n\r\n`
      + `${stringifyValue(value)}\r\n`,
      'utf-8',
    ));
  }

  for (const file of files) {
    const contentType = file.contentType || 'application/octet-stream';
    parts.push(Buffer.from(
      `--${boundary}\r\n`
      + `Content-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\n`
      + `Content-Type: ${contentType}\r\n\r\n`,
      'utf-8',
    ));
    parts.push(file.content);
    parts.push(Buffer.from('\r\n', 'utf-8'));
  }

  parts.push(Buffer.from(`--${boundary}--\r\n`, 'utf-8'));

  return {
    body: Buffer.concat(parts),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

/**
 * Perform a single HTTP request, following redirects for safe methods.
 * Resolves with `{ statusCode, headers, body }` where `body` is a Buffer.
 */
function request(method, urlString, { headers = {}, body = null, maxRedirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    let url;
    try {
      url = new URL(urlString);
    } catch (err) {
      reject(err);
      return;
    }

    const lib = url.protocol === 'https:' ? https : http;
    const options = {
      method,
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      headers,
    };

    const req = lib.request(options, (res) => {
      if (REDIRECT_STATUSES.has(res.statusCode) && res.headers.location && maxRedirects > 0) {
        res.resume();
        const nextUrl = new URL(res.headers.location, url).toString();
        const nextMethod = res.statusCode === 303 ? 'GET' : method;
        request(nextMethod, nextUrl, {
          headers,
          body: nextMethod === 'GET' ? null : body,
          maxRedirects: maxRedirects - 1,
        }).then(resolve, reject);
        return;
      }

      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });

    req.on('error', reject);
    if (body !== null && body !== undefined) {
      req.write(body);
    }
    req.end();
  });
}

/** POST an application/x-www-form-urlencoded body. */
function postForm(url, fields) {
  const body = encodeParams(fields);
  return request('POST', url, {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body,
  });
}

/** POST a multipart/form-data body carrying one or more file parts. */
function postMultipart(url, fields, files) {
  const { body, contentType } = encodeMultipart(fields, files);
  return request('POST', url, {
    headers: {
      'Content-Type': contentType,
      'Content-Length': body.length,
    },
    body,
  });
}

/** GET with an object of query parameters. */
function get(url, params = {}) {
  return request('GET', `${url}${buildQuery(params)}`);
}

module.exports = {
  request,
  postForm,
  postMultipart,
  get,
  encodeParams,
  buildQuery,
  encodeMultipart,
};
