#!/usr/bin/env node
'use strict';

// Verify CapSkip is running and reachable.

const {
  ApiClient, ApiException, NetworkException, version,
} = require('capskip');

function parseArgs(argv) {
  const args = { host: '127.0.0.1', port: 8080, apiKey: 'capskip' };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--host') {
      args.host = argv[++i];
    } else if (arg === '--port') {
      args.port = parseInt(argv[++i], 10);
    } else if (arg === '--api-key') {
      args.apiKey = argv[++i];
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const client = new ApiClient({ host: args.host, port: args.port });

  console.log(`CapSkip SDK : ${version}`);
  console.log(`Target      : ${client.baseUrl}`);

  try {
    await client.res({ key: args.apiKey, action: 'get', id: '0' });
    console.log('Status      : OK — CapSkip is reachable');
  } catch (err) {
    if (err instanceof ApiException) {
      console.log('Status      : OK — CapSkip is reachable');
      console.log(`Response    : ${err.message}`);
    } else if (err instanceof NetworkException) {
      console.log(`Status      : FAILED — ${err.message}`);
      process.exitCode = 1;
    } else {
      throw err;
    }
  }

  console.log('Try: node examples/recaptcha.js');
}

main();
