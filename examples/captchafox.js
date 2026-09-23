'use strict';

/**
 * Solve a CaptchaFox challenge.
 *
 * CaptchaFox scores the browser itself rather than asking the visitor to read
 * anything, so most solves draw no puzzle at all. CapSkip drives the real widget
 * in a real browser and returns the verification token it would have produced.
 *
 * You need two values, both read off the target page:
 *
 *   * sitekey - the public key the widget renders with, conventionally prefixed
 *     `sk_`. It is on the widget container as `data-sitekey`, or in the
 *     `captchafox.render(...)` call. If the page builds the widget at runtime,
 *     open DevTools -> Network and find the request to api.captchafox.com: the
 *     key is the path segment after /captcha/.
 *   * pageurl - the full URL of the page the widget appears on
 *
 * The page URL has to match: CaptchaFox keys are registered against a list of
 * allowed domains and the service checks the host before it issues anything. A
 * key that is correct but used on a page outside that list is refused
 * permanently, not intermittently -- so if a sitekey fails immediately and
 * consistently, check that you are sending the page the widget actually runs on
 * rather than a search page, a redirect or a shortened link.
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

const SITEKEY = 'sk_xtNxpk6fCdFbxh1_xJeGflSdCE9tn99G';
const PAGE_URL = 'https://example.com/signup';

async function main() {
  const result = await solver.captchafox(SITEKEY, PAGE_URL);

  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', `${result.token.slice(0, 60)}...`);
  console.log('User-Agent:', result.userAgent || '(none reported)');

  // --- Choosing the widget source ------------------------------------------
  // CaptchaFox publishes its widget from two places, and which one a site loads
  // decides the shape of the token it expects back. Send api_server only when
  // the target page does not use the default (https://cdn.captchafox.com/).
  //
  //   await solver.captchafox(SITEKEY, PAGE_URL, {
  //     api_server: 'https://s.uicdn.com/mampkg/@mamdev/core.frontend.libs.captchafox/',
  //   });
  //
  // That one returns a MAM_ prefixed token. Read the value from the <script>
  // tag on the target page: if you send the wrong one the solve still succeeds,
  // but the token comes back in a format the site will not accept, which looks
  // like a silent verification failure rather than an error.
  //
  // --- With a per-request proxy --------------------------------------------
  // CapSkip does not force a proxy, but CaptchaFox scores the network a widget
  // runs on as well as the browser, so repeated solves from one address push
  // that address toward the interactive challenges and then toward refusals.
  //
  //   await solver.captchafox(SITEKEY, PAGE_URL, {
  //     proxy: { type: 'HTTP', uri: 'login:password@1.2.3.4:8080' },
  //   });

  // Post the token back in the form field the widget uses, named
  // `cf-captcha-response`. Treat it as opaque and pass it through unchanged --
  // it is verified server side against the session that produced it, so any
  // edit invalidates it.
  //
  //   await fetch(SIGNUP_URL, {
  //     method: 'POST',
  //     headers: { 'User-Agent': result.userAgent },
  //     body: new URLSearchParams({
  //       email: 'someone@example.com',
  //       'cf-captcha-response': result.token,
  //     }),
  //   });
  //
  // Some integrations read the token from a JSON body field instead, so check
  // what the page's own submit sends and mirror it.
  console.log('Form field:', { 'cf-captcha-response': `${result.token.slice(0, 40)}...` });

  // Submit under the User-Agent the token was minted with, not your own.
  // CapSkip solves in a real browser and uses that browser's identity, so the
  // UA it reports is the one the token is bound to.
  //
  // Tokens are short lived: submit promptly rather than holding one while a
  // user fills in a form, and solve again if the form is abandoned and resumed.

  // Two of CaptchaFox's challenge types are not solvable -- image-select and
  // the audio fallback, both rare. They are reported as unsolvable rather than
  // waited out, so treat a failure as a signal to resubmit into a fresh
  // challenge rather than as a permanent failure of the key.
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
