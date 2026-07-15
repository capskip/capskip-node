'use strict';

// CapSkip Node.js SDK — local captcha solver client.

const { CapSkip } = require('./solver');
const { ApiClient } = require('./apiClient');
const {
  CapSkipError,
  SolverExceptions,
  ValidationException,
  NetworkException,
  ApiException,
  TimeoutException,
} = require('./exceptions');

// Node I/O is asynchronous by nature, so every CapSkip method already returns a
// Promise. `AsyncCapSkip` / `AsyncApiClient` are exported as aliases so code
// ported from other CapSkip SDKs keeps working unchanged.
module.exports = {
  CapSkip,
  AsyncCapSkip: CapSkip,
  ApiClient,
  AsyncApiClient: ApiClient,
  CapSkipError,
  SolverExceptions,
  ValidationException,
  NetworkException,
  ApiException,
  TimeoutException,
  version: '1.0.2',
};
