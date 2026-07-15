'use strict';

/** Base error for all CapSkip SDK failures. */
class CapSkipError extends Error {
  constructor(message) {
    if (message instanceof Error) {
      super(message.message, { cause: message });
    } else {
      super(message);
    }
    this.name = this.constructor.name;
  }
}

/** Alias kept for API parity with the CapSkip clients (`solver.exceptions`). */
const SolverExceptions = CapSkipError;

/** Invalid or unsupported parameters. */
class ValidationException extends CapSkipError {}

/** Connection failure or captcha not ready. */
class NetworkException extends CapSkipError {}

/** CapSkip API returned an error. */
class ApiException extends CapSkipError {}

/** Polling exceeded the configured timeout. */
class TimeoutException extends CapSkipError {}

module.exports = {
  CapSkipError,
  SolverExceptions,
  ValidationException,
  NetworkException,
  ApiException,
  TimeoutException,
};
