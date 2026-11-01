'use strict';

/**
 * Pass a DataDome challenge and fetch the page with the cookie.
 *
 * DataDome answers a request it doubts with a block page (status 403, sometimes
 * 401) instead of the site. That page carries a `var dd={...}` object and loads
 * the challenge in an iframe from geo.captcha-delivery.com: a slider under
 * /captcha/, or a few-second device check under /interstitial/. CapSkip passes
 * either and returns the `datadome` cookie.
 *
 * The cookie belongs to one IP address and one User-Agent, so:
 *
 *   * solve through the proxy your requests use (or none, if they leave from
 *     the machine running CapSkip), and
 *   * send the User-Agent CapSkip reports back with every request.
 *
 * When you send no proxy and the CapSkip app has its own DataDome proxy list,
 * it solves through one of those and the result names it as `proxy`
 * (host:port): the cookie then only works through that proxy.
 *
 * Requests go out with Node's built-in fetch. Sending them through a proxy
 * needs undici's ProxyAgent (`npm install undici`); without it, the example
 * prints what to do instead of re-fetching through the proxy.
 *
 * Environment:
 *   TARGET_URL         a page behind DataDome (default: https://www.example.com/)
 *   DATADOME_PROXY     optional, e.g. http://login:password@203.0.113.10:8080
 *   CAPSKIP_API_KEY / CAPSKIP_HOST / CAPSKIP_PORT
 */

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: Number(process.env.CAPSKIP_PORT || 8080),
});

const PAGE_URL = process.env.TARGET_URL || 'https://www.example.com/';
const PROXY = process.env.DATADOME_PROXY; // scheme://[login:password@]host:port, or unset

let ProxyAgent;
try {
  ({ ProxyAgent } = require('undici'));
} catch (error) {
  ProxyAgent = undefined;
}

/** The challenge iframe address, as the block page's own script builds it. */
function captchaUrlFromBlockPage(html, pageUrl) {
  const iframe = html.match(/<iframe[^>]+src="(https:\/\/[^"]*captcha-delivery\.com\/[^"]+)"/);
  if (iframe) {
    return iframe[1]; // HTML-escaped &amp; is fine, CapSkip decodes it
  }
  const match = html.match(/var dd=(\{[^}]*\})/);
  if (!match) {
    return null;
  }
  const dd = JSON.parse(match[1].replace(/'/g, '"'));
  const path = dd.rt === 'i' ? 'interstitial' : 'captcha';
  const query = new URLSearchParams({ initialCid: dd.cid, hash: dd.hsh, cid: dd.cookie });
  if (dd.t) {
    query.set('t', dd.t);
  }
  query.set('referer', pageUrl);
  query.set('s', String(dd.s));
  for (const key of ['e', 'b']) {
    if (dd[key]) {
      query.set(key, String(dd[key]));
    }
  }
  query.set('dm', 'cd');
  return `https://${dd.host || 'geo.captcha-delivery.com'}/${path}/?${query}`;
}

/** fetch, through `proxyUrl` when one is given and undici is installed. */
function get(url, { proxyUrl, headers } = {}) {
  const options = { headers, redirect: 'follow' };
  if (proxyUrl) {
    options.dispatcher = new ProxyAgent(proxyUrl);
  }
  return fetch(url, options);
}

async function main() {
  if (PROXY && !ProxyAgent) {
    console.log('DATADOME_PROXY is set: run `npm install undici` so the requests use it.');
    return;
  }

  // 1. Request the page. A 403/401 with a dd object is DataDome's block page.
  const response = await get(PAGE_URL, { proxyUrl: PROXY });
  const html = await response.text();
  const captchaUrl = captchaUrlFromBlockPage(html, PAGE_URL);
  if (![401, 403].includes(response.status) || !captchaUrl) {
    console.log(`No DataDome block page at ${PAGE_URL} (HTTP ${response.status}).`);
    return;
  }
  console.log('Block page:', `${captchaUrl.slice(0, 90)}...`);

  // 2. Solve it. 2Captcha's argument order: datadome(captcha_url, pageurl,
  //    userAgent, proxy), with userAgent and proxy as options. No userAgent:
  //    CapSkip uses its own browser's and reports it. With one, it must be
  //    Chrome for Windows with the same major version as that browser.
  const options = {};
  if (PROXY) {
    const scheme = PROXY.includes('://') ? PROXY.split('://', 1)[0] : 'http';
    options.proxy = { type: scheme.toUpperCase(), uri: PROXY.split('://').pop() };
  }
  const result = await solver.dataDome(captchaUrl, PAGE_URL, options);

  console.log('Captcha ID:', result.captchaId);
  console.log('Cookie:    ', `${result.cookie.slice(0, 60)}...`);
  console.log('User-Agent:', result.userAgent);
  if (result.proxy) {
    console.log('Proxy:     ', result.proxy, '(from the CapSkip app DataDome list; the cookie only works through it)');
  }

  // 3. Repeat the request with the cookie, the same User-Agent and the same IP.
  let proxyUrl = PROXY;
  if (result.proxy && !PROXY) {
    // Named without its login: add yours if that list entry has one.
    if (!ProxyAgent) {
      console.log(`Send the cookie through http://${result.proxy}: run \`npm install undici\` to do it here.`);
      return;
    }
    proxyUrl = `http://${result.proxy}`;
  }
  // `cookie` is the datadome=... pair, ready for the Cookie header; `code`
  // keeps the attributes (Domain, Max-Age...) for a cookie jar.
  const again = await get(PAGE_URL, {
    proxyUrl,
    headers: { 'User-Agent': result.userAgent, Cookie: result.cookie },
  });
  console.log('With the cookie: HTTP', again.status);
}

main().catch((error) => {
  console.error(`${error.name}: ${error.message}`);
  process.exitCode = 1;
});
