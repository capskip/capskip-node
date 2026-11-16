'use strict';

/**
 * Solve a GeeTest v4 CAPTCHA.
 *
 * GeeTest v4 identifies its widget with a single public `captcha_id`. Unlike v3
 * there is no per-request challenge to fetch first: the ID is the same for
 * every visitor, so read it once and reuse it.
 *
 * The page loads `https://static.geetest.com/v4/gt4.js` and passes the ID to
 * `initGeetest4` as `captchaId`:
 *
 *   initGeetest4({ captchaId: "e392e1d7fd421dc63325744d5a2b9c73", product: "bind" }, ...);
 *
 * If the call is built at runtime, open the Network tab and find the request to
 * `gcaptcha4.geetest.com/load`: the ID is its `captcha_id` query parameter.
 *
 * A passed check produces five values, which the site verifies with GeeTest on
 * its server: `captcha_id`, `lot_number`, `pass_token`, `gen_time` and
 * `captcha_output`. CapSkip returns all five.
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

// GeeTest's own public v4 demo page and its captcha_id.
const CAPTCHA_ID = '54088bb07d2df3c46b79f80300b0abbe';
const PAGE_URL = 'https://gt4.geetest.com/';

async function main() {
  const result = await solver.geetestV4(CAPTCHA_ID, PAGE_URL);

  console.log('Captcha ID:    ', result.captchaId);
  console.log('captcha_id:    ', result.captcha_id);
  console.log('lot_number:    ', result.lot_number);
  console.log('pass_token:    ', result.pass_token);
  console.log('gen_time:      ', result.gen_time);
  console.log('captcha_output:', `${result.captcha_output.slice(0, 40)}...`);

  // --- Optional parameters -------------------------------------------------
  //
  //   const result = await solver.geetestV4(CAPTCHA_ID, PAGE_URL, {
  //     risk_type: 'slide',   // slide, icon, nine, word, phrase, match, winlinze,
  //                           // svg_seed, svg_icon or ai; applied only where the
  //                           // site allows it
  //     proxy: { type: 'HTTP', uri: 'login:password@203.0.113.10:8080' },
  //   });
  //
  // --- Submitting the result -----------------------------------------------
  //
  // Send the five values under the same names in the request the page's own
  // submit makes, unchanged, and solve again for every submission:
  //
  //   await fetch(LOGIN_URL, {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       captcha_id: result.captcha_id,
  //       lot_number: result.lot_number,
  //       pass_token: result.pass_token,
  //       gen_time: result.gen_time,
  //       captcha_output: result.captcha_output,
  //     }),
  //   });
  //
  // If GeeTest itself could not be reached, the result also carries
  // result.isOffline === true, and the site decides whether to accept it.
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
