'use strict';

/**
 * Solve a Yandex SmartCaptcha.
 *
 * Yandex SmartCaptcha is the CAPTCHA service of Yandex Cloud, used on sign-up,
 * login, contact and checkout forms. The visitor ticks "I'm not a robot" or
 * pulls a slider, and Yandex may then ask for a challenge. When the visitor
 * passes, the widget writes a token into a hidden form field named
 * `smart-token`. CapSkip takes the sitekey and page address and returns that
 * token, whatever challenges Yandex asks for on the way.
 *
 * You need two values, both read off the target page:
 *
 *   * sitekey - the `data-sitekey` of the widget's container:
 *
 *       <div class="smart-captcha" data-sitekey="ysc1_HrTv0IuXWNH5JxfcWnRozoir2pTFbxsaZbrbGI4e292406f2"></div>
 *
 *     Pages that render the widget from their own script pass the same key to
 *     `window.smartCaptcha.render` as `sitekey`. Client keys usually start
 *     with `ysc1_`.
 *   * url - the full URL of the page the widget is on. Yandex checks the
 *     sitekey against that domain.
 */

const assert = require('node:assert');
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

// Yandex's public SmartCaptcha demo page and its sitekey.
const SITEKEY = 'FEXfAbHQsToo97VidNVk3j4dC74nGW1DgdxjtNB9';
const PAGE_URL = 'https://smartcaptcha.yandexcloud.net/demo';

async function main() {
  const result = await solver.yandexSmart(SITEKEY, PAGE_URL);

  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', `${result.token.slice(0, 60)}...`);

  // --- Optional parameters -------------------------------------------------
  //
  //   const result = await solver.yandexSmart(SITEKEY, PAGE_URL, {
  //     userAgent: 'Mozilla/5.0 ...',   // the User-Agent to present to Yandex
  //     proxy: { type: 'HTTP', uri: 'login:password@203.0.113.10:8080' },
  //   });
  //
  // --- Submitting the token ------------------------------------------------
  // Put the token in the form's smart-token field and submit the form as the
  // page would. A token is valid for five minutes and can be checked only
  // once. With Puppeteer or Playwright:
  //
  //   await page.$eval('input[name="smart-token"]',
  //     (el, token) => { el.value = token; }, result.token);

  // `code` holds the same string as `token`, which is what you forward if you
  // are porting code written against another solver's API.
  assert.strictEqual(result.code, result.token);
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
