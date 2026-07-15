'use strict';

const path = require('path');
const { CapSkip } = require('capskip');

const solver = new CapSkip({
  apiKey: process.env.CAPSKIP_API_KEY || 'capskip',
  host: process.env.CAPSKIP_HOST || '127.0.0.1',
  port: parseInt(process.env.CAPSKIP_PORT || '8080', 10),
});

// Sample captcha image shipped alongside this script — resolved relative to the
// file so it works no matter which directory you run from.
const IMAGE = path.join(__dirname, 'captcha.png');

(async () => {
  const result = await solver.normal(IMAGE);
  console.log('Captcha ID:', result.captchaId);
  console.log('Solution:  ', result.code);
})();
