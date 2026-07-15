'use strict';

const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});

// Google's official reCAPTCHA v2 test key and demo page — safe to run as-is.
const SITEKEY = '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';
const PAGE_URL = 'https://www.google.com/recaptcha/api2/demo';

(async () => {
  const result = await solver.recaptcha(SITEKEY, PAGE_URL);
  console.log('Captcha ID:', result.captchaId);
  console.log('Token:     ', result.code);
})();
