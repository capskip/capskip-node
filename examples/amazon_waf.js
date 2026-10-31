'use strict';

/**
 * Solve an AWS WAF CAPTCHA.
 *
 * AWS WAF shows up in two forms, and the values you need depend on which one
 * the target page uses:
 *
 *   * A challenge page -- the HTTP 405 interstitial that sets `window.gokuProps`
 *     in an inline script. `sitekey` is `gokuProps.key`; `iv` and `context` are
 *     `gokuProps.iv` and `gokuProps.context`. `challenge_script` and
 *     `captcha_script` are the full URLs of the page's challenge.js and
 *     captcha.js.
 *   * A widget page -- an ordinary page that calls
 *     `AwsWafCaptcha.renderCaptcha(container, { apiKey, ... })`. `sitekey` is
 *     that `apiKey`, and `jsapiScript` is the full URL of jsapi.js.
 *
 * Only `sitekey` and the page URL are required. `iv` and `context` travel
 * together: send both or neither. Left out, CapSkip reads them from the page
 * at solve time, which is the safer choice when your copy of the page is more
 * than a few minutes old.
 *
 * Every script URL must be an https URL on an awswaf.com host. CapSkip posts
 * the solution to the host the script names, so it refuses anything else
 * before the request is made.
 *
 * Unlike reCAPTCHA or Turnstile, the answer is NOT a token you put in a form.
 * It is a voucher pair that AWS trades for the `aws-waf-token` cookie.
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

const PAGE_URL = 'https://example.com/protected';

// From the challenge page's window.gokuProps.
const SITEKEY = 'AQIDAHjcYuEXAMPLEghicBgQ/7bFaQZ+m5FKCMDnO+vTbNg96AHDh0IR5vgzHNceHYqZR+GOAAAAfjB8';
const IV = 'CgAFRDIjfgAAA5yY';
const CONTEXT = 'Rbp3r8fvbuhmrCqpUe8Mh1TLvs8OSKJZiSs2vCF4dt9rxVZI7xYJa2n5k/9r+XaXe7KUIu2I8nXTDHHkDvIOTDc2';
const CHALLENGE_JS = 'https://3f2a9c7d41b0.edge.sdk.awswaf.com/3f2a9c7d41b0/8e51d0c7a2f4/challenge.js';

async function main() {
  const result = await solver.amazonWaf(SITEKEY, PAGE_URL, {
    iv: IV,
    context: CONTEXT,
    challenge_script: CHALLENGE_JS,
  });

  console.log('Captcha ID:    ', result.captchaId);
  console.log('Voucher:       ', `${result.captcha_voucher.slice(0, 32)}...`);
  console.log('Existing token:', `${result.existing_token.slice(0, 32)}...`);

  // --- A widget page -------------------------------------------------------
  // The widget's apiKey as the sitekey, and the jsapi.js it loads. No iv or
  // context: a widget page has none.
  //
  //   await solver.amazonWaf(
  //     'Xr9kEXAMPLE2bWQx1vTq8LmZ0aYc4dHs7nFp3gJt6uKw5eRi9AbCdEfGh=_0_1',
  //     PAGE_URL,
  //     { jsapiScript: 'https://5b7e0a19c3d8.us-east-1.captcha-sdk.awswaf.com/5b7e0a19c3d8/jsapi.js' },
  //   );
  //
  // --- With a per-request proxy --------------------------------------------
  //   await solver.amazonWaf(SITEKEY, PAGE_URL, {
  //     proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  //   });

  // Exchange the pair for the aws-waf-token cookie: POST both values as JSON
  // to the `voucher` endpoint that sits beside the page's challenge.js. The
  // response's `token` is the cookie value. Do this immediately -- the voucher
  // is short-lived, so do not store the pair for a later request.
  const voucherUrl = new URL('voucher', CHALLENGE_JS).href;
  console.log('Voucher URL:   ', voucherUrl);
  //
  //   const response = await fetch(voucherUrl, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify({
  //       captcha_voucher: result.captcha_voucher,
  //       existing_token: result.existing_token,
  //     }),
  //   });
  //   const { token } = await response.json();
  //
  //   // Then request the protected page with the cookie:
  //   await fetch(PAGE_URL, { headers: { Cookie: `aws-waf-token=${token}` } });
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
