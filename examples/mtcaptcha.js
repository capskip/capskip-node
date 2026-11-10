'use strict';

/**
 * Solve an MTCaptcha text captcha.
 *
 * MTCaptcha is a text captcha used on login, sign-up and contact forms: the
 * visitor types the distorted characters in a picture, and the widget writes
 * a verified token into a hidden form field named `mtcaptcha-verifiedtoken`.
 * CapSkip takes the sitekey and page address and returns that token.
 *
 * You need two values, both read off the target page:
 *
 *   * sitekey - starts with `MTPublic-`. Most pages set it in a
 *     `mtcaptchaConfig` object in the page source:
 *
 *       var mtcaptchaConfig = { "sitekey": "MTPublic-KzqLY1cKH", "action": "login" };
 *
 *     When the widget is on screen it is also the `sitekey` query parameter
 *     of its iframe on `service.mtcaptcha.com`.
 *   * url - the full URL of the page the widget is on. MTCaptcha issues
 *     tokens only for the domains the sitekey is registered for.
 *
 * If `mtcaptchaConfig` also sets `action`, send that value too.
 */

const assert = require('node:assert');
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

// 2Captcha's public MTCaptcha demo page and its sitekey.
const SITEKEY = 'MTPublic-KzqLY1cKH';
const PAGE_URL = 'https://2captcha.com/demo/mtcaptcha';

async function main() {
  const result = await solver.mtcaptcha(SITEKEY, PAGE_URL);

  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', `${result.token.slice(0, 60)}...`);

  // --- Optional parameters -------------------------------------------------
  //
  //   const result = await solver.mtcaptcha(SITEKEY, PAGE_URL, {
  //     action: 'login',                // the action mtcaptchaConfig sets
  //     userAgent: 'Mozilla/5.0 ...',   // the User-Agent to present to MTCaptcha
  //     proxy: { type: 'HTTP', uri: 'login:password@203.0.113.10:8080' },
  //   });
  //
  // --- Submitting the token ------------------------------------------------
  // Put the token in the form's mtcaptcha-verifiedtoken field and submit the
  // form as the page would. With Puppeteer or Playwright:
  //
  //   await page.$eval('[name="mtcaptcha-verifiedtoken"]',
  //     (el, token) => { el.value = token; }, result.token);
  //
  // Without a browser, post it as that form field:
  //
  //   await fetch(FORM_URL, {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       email: 'someone@example.com',
  //       'mtcaptcha-verifiedtoken': result.token,
  //     }),
  //   });

  // `code` holds the same string as `token`, which is what you forward if you
  // are porting code written against another solver's API.
  assert.strictEqual(result.code, result.token);
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
