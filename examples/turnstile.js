'use strict';

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});

// Cloudflare's official Turnstile test key (always passes) and demo page — safe to run as-is.
const SITEKEY = '1x00000000000000000000AA';
const PAGE_URL = 'https://demo.turnstile.workers.dev/';

(async () => {
  const result = await solver.turnstile(SITEKEY, PAGE_URL);
  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', result.code);
  console.log('User-Agent:', result.userAgent);
})();
