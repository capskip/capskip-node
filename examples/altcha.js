'use strict';

/**
 * Solve an ALTCHA proof-of-work challenge.
 *
 * ALTCHA is not a recognition captcha -- there is nothing to read. The site
 * issues a challenge and the browser must brute-force a number that satisfies
 * it. CapSkip does that work for you, in milliseconds.
 *
 * You need the challenge, in one of two forms:
 *
 *   * `challengeUrl`  - the endpoint that serves it; CapSkip fetches it for you
 *   * `challengeJson` - the challenge document itself, if you already have it
 *
 * To find them, open DevTools -> Network on the target page and look for the
 * request the `<altcha-widget>` makes for its challenge (often something like
 * `/altcha/challenge`). The request URL is your `challengeUrl`; its JSON
 * response is your `challengeJson`.
 *
 * Note the widget attribute that names the endpoint changed between versions:
 * v1/v2 use `challengeurl="..."`, while v3+ uses `challenge="..."` for both a
 * URL and inline data. Read the page source rather than assuming.
 *
 * Challenges expire fast -- some sites inside two minutes -- so fetch one
 * immediately before solving and post the token promptly. An expired challenge
 * is rejected with a bare "verification failed" that looks exactly like a wrong
 * answer.
 *
 * This example issues its own challenge the way a site's server would, so it
 * runs as-is with no third-party dependency. Swap in your target's endpoint to
 * use it for real.
 */

const crypto = require('crypto');

const { CapSkip } = require('../src');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

const PAGE_URL = 'https://example.com/signup';

/**
 * Mint an ALTCHA challenge, exactly as a site's own server would.
 *
 * Replace this with a fetch of your target's challenge endpoint -- or skip it
 * entirely and pass `challengeUrl` so CapSkip does the fetching.
 */
function issueChallenge(number = 54321) {
  const salt = `${crypto.randomBytes(12).toString('hex')}?expires=${
    Math.floor(Date.now() / 1000) + 600}`;
  return {
    algorithm: 'SHA-256',
    challenge: crypto.createHash('sha256').update(`${salt}${number}`).digest('hex'),
    salt,
    signature: '0'.repeat(64),
    maxnumber: 100000,
  };
}

(async () => {
  // --- Option A: you already have the challenge document ---------------------
  // No network request at all: CapSkip solves it locally.
  const result = await solver.altcha(PAGE_URL, { challengeJson: issueChallenge() });

  console.log('Captcha ID:', result.captchaId);
  console.log('Number:    ', result.number);
  console.log('Token:     ', `${result.token.slice(0, 60)}...`);

  // --- Option B: let CapSkip fetch the challenge ------------------------------
  // Point it at the endpoint the widget calls. Add `proxy` if the endpoint
  // should be fetched from a particular IP -- the proxy is used only for that
  // fetch, never for the solve itself.
  //
  //   const result = await solver.altcha(PAGE_URL, {
  //     challengeUrl: 'https://example.com/captcha/api/altcha/challenge',
  //     proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  //   });

  // Post the token back in the form field the widget uses, named `altcha`:
  //
  //   await fetch(SIGNUP_URL, {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       email: 'someone@example.com',
  //       altcha: result.token,
  //     }),
  //   });
  //
  // Do not re-encode, trim or re-order it. The token is base64 of a JSON
  // document whose fields are covered by the server's HMAC signature, so any
  // modification invalidates it.

  // `code` holds the same string as `token`, which is what you forward if you
  // are porting code written against another solver's API.
  console.assert(result.code === result.token);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
