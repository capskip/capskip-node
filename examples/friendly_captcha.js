'use strict';

/**
 * Solve a Friendly Captcha proof-of-work challenge.
 *
 * Friendly Captcha asks the visitor's browser to do a piece of arithmetic
 * instead of asking the visitor to do anything: there is no image, no slider and
 * no audio fallback. CapSkip does that work and returns the token the widget
 * would have written into your form.
 *
 * You need two values, and a third is worth sending whenever you can get it:
 *
 *   * sitekey      - the `data-sitekey` attribute of the widget element, which
 *                    is the one carrying class="frc-captcha"
 *   * pageurl      - the full URL of the page the widget appears on
 *   * moduleScript - the `src` of the widget script tag carrying type="module".
 *                    Not required, but it is what tells CapSkip which protocol
 *                    version the site uses.
 *
 * READ THE VERSION SECTION BELOW. It is the part that will cost you an afternoon
 * if you skip it.
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

const SITEKEY = 'FCMGEMUD2M567T8G';
const PAGE_URL = 'https://example.com/signup';

async function main() {
  // --- Version 1 and version 2 ---------------------------------------------
  // Two entirely different protocols ship under this one name, and a sitekey
  // does not tell you which one a site uses -- they share a brand and a sitekey
  // namespace and nothing else. Both are live and both are in use. Solve the
  // wrong one and you get a well-formed token that the target site rejects, with
  // no indication anywhere that the version was the problem.
  //
  //   v1  friendly-challenge    widget.module.min.js / widget.min.js  (default)
  //   v2  @friendlycaptcha/sdk  site.min.js
  //
  // CapSkip decides in this order: an explicit `version`, then the script URL,
  // then v1. So either say which version, or send the script URL and let it read
  // the version off the build the site actually loads.

  // Option A: say which version.
  const result = await solver.friendlyCaptcha(SITEKEY, PAGE_URL, { version: 'v2' });

  // Option B: let the script URL decide -- the most reliable signal there is.
  //
  //   await solver.friendlyCaptcha(SITEKEY, PAGE_URL, {
  //     moduleScript: 'https://cdn.example.com/@friendlycaptcha/sdk@0.1.6/site.min.js',
  //     nomoduleScript: 'https://cdn.example.com/@friendlycaptcha/sdk@0.1.6/site.compat.js',
  //   });

  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', `${result.token.slice(0, 60)}...`);
  console.log('Length:    ', result.token.length);

  // --- Data residency -------------------------------------------------------
  // Pass api_server for a sitekey on the EU tenant. Both tenants mint a token
  // for the same sitekey, so the wrong one is only caught by the site's own
  // verification -- which is the worst kind of silent.
  //
  //   await solver.friendlyCaptcha(SITEKEY, PAGE_URL, { version: 'v2', api_server: 'eu' });
  //
  // --- With a per-request proxy --------------------------------------------
  // You will want one sooner here than almost anywhere else. The service decides
  // how much work each request is worth and raises that figure for addresses it
  // has already seen a lot of -- the published range between a fresh address and
  // a heavily used one is close to thirty times the work for the same token.
  //
  //   await solver.friendlyCaptcha(SITEKEY, PAGE_URL, {
  //     version: 'v2',
  //     proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  //   });

  // Post the token back in the hidden field the widget would have filled in.
  // THE TWO VERSIONS DO NOT USE THE SAME FIELD NAME, which is what catches
  // people who move a working v1 integration onto a v2 site:
  //
  //   v1  ->  frc-captcha-solution
  //   v2  ->  frc-captcha-response
  //
  //   await fetch(SIGNUP_URL, {
  //     method: 'POST',
  //     body: new URLSearchParams({
  //       email: 'someone@example.com',
  //       'frc-captcha-response': result.token,   // v2
  //     }),
  //   });
  console.log('Form field:', { 'frc-captcha-response': `${result.token.slice(0, 40)}...` });

  // Submit the token verbatim. Do not trim it or re-encode it.
  //
  // The two versions produce tokens of very different shapes and sizes: a v1
  // token is four dot-separated parts and runs to a few hundred characters,
  // while a v2 token is a single opaque string beginning `AQQA.` and is roughly
  // six kilobytes long. Make sure whatever carries it -- a hidden field, a
  // database column, a proxied request -- is sized for that.

  // Solve time is not a constant for this method: the service decides how much
  // work a request is worth at the moment it is made, so the same sitekey can
  // cost noticeably more at one time than another. This is why the method uses
  // recaptchaTimeout rather than the shorter default.
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
