'use strict';

// A local mock CapSkip server exercising the full submit/poll round trip over
// real HTTP, mirroring tests/conftest.py from the Python SDK.

const http = require('http');
const { URL } = require('url');

const CODE = 'SOLVED_TOKEN_abc123';
const USER_AGENT = 'CapSkipUA/1.0';

// ALTCHA answers are base64 of the challenge document with the winning counter
// added, so the mock has to return a real one for the token/number parsing to
// mean anything.
const ALTCHA_NUMBER = 9661;
const ALTCHA_TOKEN = Buffer.from(JSON.stringify({
  algorithm: 'SHA-256',
  challenge: '3dd28253be6cc0c54d95f7f98c517e68',
  number: ALTCHA_NUMBER,
  salt: '46d5b1c8871e5152d902ee3f?expires=1893456000',
  signature: '4b1cf0e0be0f4e5247e50b0f9a449830',
  took: 16.58,
})).toString('base64');

// Capy answers are not a token: three values that together go into the target
// form. `answer` is the drag path the widget would have recorded, so the mock
// carries a realistic one -- the expansion is only meaningful against a real
// shape.
const CAPY_SOLUTION = {
  captchakey: 'PUZZLE_Abc1dEFghIJKLM2no34P56q7rStu8v',
  challengekey: 'BalY2gJaI8uA2SGVOZhqBQ3V0CYSNNGP',
  answer: '0xax8ex0xax84x0xkx7qx0x18x76x0x1ix6sx0x26x68x0x2gx5kx0x34x50x',
  respKey: '',
};

const CAPTCHAFOX_TOKEN = '177f50c25b845601e5c779cdb51b040d523e8ab69efb4d5b343e28df07d05076';
// The UA the browser actually minted the token under -- deliberately not one a
// caller could have sent, so a test can tell the two apart.
const CAPTCHAFOX_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

// A v1 token: four dot-separated parts. A v2 one is a single opaque string of
// roughly six kilobytes, which shape-wise changes nothing the SDK does with it.
const FRIENDLY_CAPTCHA_TOKEN = 'c62c4da36bbaf7f253873035832709ef.'
  + 'aqwpWwdbzRWKY/UQAQwwpgAAAAAAAAAAM7hBvJOzqjc=.AAAAAArcCQABAAAAxv8QAAIAAACKYRgA.AgAB';

// A minimal valid 1x1 PNG. The mock returns these bytes for /image.png and the
// SDK never inspects the content, so exact pixels do not matter.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

function send(res, text, ctype = 'text/plain') {
  const body = Buffer.from(text, 'utf-8');
  res.writeHead(200, { 'Content-Type': ctype, 'Content-Length': body.length });
  res.end(body);
}

function createMockServer() {
  let ids = 0;
  const idType = {};
  const pollCount = {};

  const handleRes = (res, query) => {
    const cid = query.id || '';
    const wantJson = String(query.json) === '1';
    pollCount[cid] = (pollCount[cid] || 0) + 1;

    // CapSkip returns an empty 200 body when no result is available yet
    // (briefly right after submit, for an unknown id, or once a solved token
    // has already been read). It must be treated as "not ready".
    if (cid.startsWith('empty') && pollCount[cid] < 3) {
      send(res, '');
      return;
    }

    const notReady = cid.startsWith('never')
      || (cid.startsWith('slow') && pollCount[cid] < 2);

    if (notReady) {
      send(
        res,
        wantJson ? '{"status":0,"request":"CAPCHA_NOT_READY"}' : 'CAPCHA_NOT_READY',
        wantJson ? 'application/json' : 'text/plain',
      );
    } else if (idType[cid] === 'altcha') {
      // CapSkip emits a superset: the legacy status/request pair plus the
      // createTask-shaped solution object.
      if (wantJson) {
        send(res, JSON.stringify({
          status: 1,
          request: ALTCHA_TOKEN,
          solution: { token: ALTCHA_TOKEN, number: ALTCHA_NUMBER },
        }), 'application/json');
      } else {
        send(res, `OK|${ALTCHA_TOKEN}`);
      }
    } else if (idType[cid] === 'capy') {
      // The one method whose answer is an object rather than a string: json=1
      // puts it straight into `request`, and plain text sends it as a single
      // line of JSON after OK|.
      if (wantJson) {
        send(res, JSON.stringify({
          status: 1,
          request: CAPY_SOLUTION,
          solution: CAPY_SOLUTION,
        }), 'application/json');
      } else {
        send(res, `OK|${JSON.stringify(CAPY_SOLUTION)}`);
      }
    } else if (idType[cid] === 'captchafox') {
      // The UA is the browser's own, and CapSkip reports it at the top level
      // and inside solution both.
      if (wantJson) {
        send(res, JSON.stringify({
          status: 1,
          request: CAPTCHAFOX_TOKEN,
          userAgent: CAPTCHAFOX_USER_AGENT,
          solution: { token: CAPTCHAFOX_TOKEN, userAgent: CAPTCHAFOX_USER_AGENT },
        }), 'application/json');
      } else {
        send(res, `OK|${CAPTCHAFOX_TOKEN}`);
      }
    } else if (idType[cid] === 'friendly_captcha') {
      if (wantJson) {
        send(res, JSON.stringify({
          status: 1,
          request: FRIENDLY_CAPTCHA_TOKEN,
          solution: { token: FRIENDLY_CAPTCHA_TOKEN },
        }), 'application/json');
      } else {
        send(res, `OK|${FRIENDLY_CAPTCHA_TOKEN}`);
      }
    } else if (wantJson && idType[cid] === 'turnstile') {
      send(res, `{"status":1,"request":"${CODE}","useragent":"${USER_AGENT}"}`, 'application/json');
    } else if (wantJson) {
      send(res, `{"status":1,"request":"${CODE}"}`, 'application/json');
    } else {
      send(res, `OK|${CODE}`);
    }
  };

  const handleIn = (res, body, contentType) => {
    let fields;
    let key;
    if (contentType.startsWith('multipart/form-data')) {
      fields = { method: 'post' };
      key = 'capskip';
    } else {
      fields = Object.fromEntries(new URLSearchParams(body.toString('utf-8')));
      key = fields.key || 'capskip';
    }

    if (key === 'badkey') {
      send(res, 'ERROR_WRONG_USER_KEY');
      return;
    }

    const pageurl = fields.pageurl || '';
    ids += 1;
    let cid;
    if (pageurl.includes('never')) {
      cid = `never${ids}`;
    } else if (pageurl.includes('slow')) {
      cid = `slow${ids}`;
    } else if (pageurl.includes('empty')) {
      cid = `empty${ids}`;
    } else {
      cid = String(ids);
    }
    idType[cid] = fields.method || '';
    // in.php returns JSON when the submit carried json=1, mirroring real CapSkip.
    if (String(fields.json) === '1') {
      send(res, `{"status":1,"request":"${cid}"}`, 'application/json');
    } else {
      send(res, `OK|${cid}`);
    }
  };

  return http.createServer((req, res) => {
    const parsed = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && parsed.pathname === '/image.png') {
      res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': PNG.length });
      res.end(PNG);
      return;
    }

    if (req.method === 'GET' && parsed.pathname === '/res.php') {
      handleRes(res, Object.fromEntries(parsed.searchParams.entries()));
      return;
    }

    if (req.method === 'POST' && parsed.pathname === '/in.php') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => handleIn(res, Buffer.concat(chunks), req.headers['content-type'] || ''));
      return;
    }

    send(res, 'ERROR_NOT_FOUND');
  });
}

/** Start the mock server on a random loopback port. */
function startMockServer() {
  const server = createMockServer();
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { address, port } = server.address();
      resolve({ server, host: address, port });
    });
  });
}

module.exports = {
  CODE,
  USER_AGENT,
  ALTCHA_TOKEN,
  ALTCHA_NUMBER,
  CAPY_SOLUTION,
  CAPTCHAFOX_TOKEN,
  CAPTCHAFOX_USER_AGENT,
  FRIENDLY_CAPTCHA_TOKEN,
  PNG,
  createMockServer,
  startMockServer,
};
