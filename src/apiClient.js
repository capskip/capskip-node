'use strict';

const fs = require('fs/promises');
const path = require('path');

const { ApiException, NetworkException } = require('./exceptions');
const { postForm, postMultipart, get } = require('./http');

/** Low-level HTTP client for the CapSkip in.php / res.php endpoints. */
class ApiClient {
  constructor({ host = '127.0.0.1', port = 8080 } = {}) {
    this.host = host;
    this.port = port;
  }

  get baseUrl() {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Submit a captcha to `in.php`.
   *
   * @param {object} options Form fields for the request. A `files` map
   *   (`{ field: path }`) or a single `file` path triggers a multipart upload;
   *   otherwise the fields are sent url-encoded.
   * @returns {Promise<string>} The raw `in.php` response text.
   */
  async in_(options = {}) {
    const { files = {}, ...fields } = options;
    const url = `${this.baseUrl}/in.php`;

    // File reads happen before the request so a missing file surfaces as a
    // filesystem error rather than being masked as a NetworkException.
    let requestPromise;
    if (Object.keys(files).length > 0) {
      const parts = [];
      for (const [name, filePath] of Object.entries(files)) {
        parts.push({ name, filename: path.basename(filePath), content: await fs.readFile(filePath) });
      }
      requestPromise = () => postMultipart(url, fields, parts);
    } else if (Object.prototype.hasOwnProperty.call(fields, 'file')) {
      const filePath = fields.file;
      delete fields.file;
      const content = await fs.readFile(filePath);
      requestPromise = () => postMultipart(url, fields, [
        { name: 'file', filename: path.basename(filePath), content },
      ]);
    } else {
      requestPromise = () => postForm(url, fields);
    }

    let resp;
    try {
      resp = await requestPromise();
    } catch (err) {
      throw new NetworkException(err);
    }

    if (resp.statusCode !== 200) {
      throw new NetworkException(`bad response: ${resp.statusCode}`);
    }

    const text = resp.body.toString('utf-8');
    if (text.includes('ERROR')) {
      throw new ApiException(text);
    }
    return text;
  }

  /**
   * Poll a result from `res.php`.
   *
   * @param {object} params Query parameters (`key`, `action`, `id`, `json`).
   * @returns {Promise<string>} The raw `res.php` response text.
   */
  async res(params = {}) {
    let resp;
    try {
      resp = await get(`${this.baseUrl}/res.php`, params);
    } catch (err) {
      throw new NetworkException(err);
    }

    if (resp.statusCode !== 200) {
      throw new NetworkException(`bad response: ${resp.statusCode}`);
    }

    const text = resp.body.toString('utf-8');
    if (text.includes('ERROR')) {
      throw new ApiException(text);
    }
    return text;
  }
}

module.exports = { ApiClient };
