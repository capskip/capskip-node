'use strict';

/**
 * Solve a GeeTest v3 slider.
 *
 * GeeTest v3 needs two values from the target site:
 *
 *   - `gt`        static per site
 *   - `challenge` single-use, expires in about a minute
 *
 * The site fetches them itself from an endpoint that returns
 * `{"gt": "...", "challenge": "..."}` (often `.../register.php` or a
 * `gettype`/`get.php` request). Open DevTools -> Network to find that request,
 * then request a *fresh* pair right before solving, as this example does.
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

// A public GeeTest v3 demo page, and the endpoint that page calls to issue a
// fresh gt/challenge pair. Safe to run as-is.
const PAGE_URL = 'https://2captcha.com/demo/geetest';
const REGISTER_URL = 'https://2captcha.com/api/v1/captcha-demo/gee-test/init-params';

/** Get a fresh gt/challenge pair. Replace with the endpoint your target uses. */
async function fetchChallenge() {
  const resp = await fetch(REGISTER_URL);
  if (!resp.ok) {
    throw new Error(`Could not fetch a gt/challenge pair: HTTP ${resp.status}`);
  }
  return resp.json();
}

(async () => {
  const { gt, challenge } = await fetchChallenge();

  const result = await solver.geetest(gt, challenge, PAGE_URL);

  console.log('Captcha ID:', result.captchaId);
  console.log('Challenge: ', result.challenge);
  console.log('Validate:  ', result.validate);
  console.log('Seccode:   ', result.seccode);

  // `code` holds the same answer as a raw JSON string, which is what you forward
  // if you are porting code written against another solver's API.
  console.log('Raw code:  ', result.code);

  // Post these back exactly as the site's own front-end would, e.g.:
  //
  //   await fetch(LOGIN_URL, {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       geetest_challenge: result.challenge,
  //       geetest_validate:  result.validate,
  //       geetest_seccode:   result.seccode,
  //     }),
  //   });
  console.log('Form fields:', {
    geetest_challenge: result.challenge,
    geetest_validate: result.validate,
    geetest_seccode: result.seccode,
  });
})();
