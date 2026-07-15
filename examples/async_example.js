'use strict';

const { AsyncCapSkip } = require('capskip');

// Official public test keys and demo pages — safe to run as-is.
const RECAPTCHA_SITEKEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'; // Google reCAPTCHA v2 test key
const RECAPTCHA_URL = 'https://www.google.com/recaptcha/api2/demo';
const TURNSTILE_SITEKEY = '1x00000000000000000000AA'; // Cloudflare Turnstile test key (always passes)
const TURNSTILE_URL = 'https://demo.turnstile.workers.dev/';

async function main() {
  const solver = new AsyncCapSkip({
    apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
    host: process.env.CAPSKIP_HOST || '127.0.0.1',
    port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
  });

  // Promise.allSettled lets one failure not cancel the others.
  const results = await Promise.allSettled([
    solver.recaptcha(RECAPTCHA_SITEKEY, RECAPTCHA_URL),
    solver.recaptcha(RECAPTCHA_SITEKEY, RECAPTCHA_URL, { version: 'v3', action: 'submit', score: 0.7 }),
    solver.turnstile(TURNSTILE_SITEKEY, TURNSTILE_URL),
  ]);

  const names = ['recaptcha v2', 'recaptcha v3', 'turnstile'];
  results.forEach((result, index) => {
    const value = result.status === 'fulfilled'
      ? JSON.stringify(result.value)
      : String(result.reason);
    console.log(`${names[index]}: ${value}`);
  });
}

main();
