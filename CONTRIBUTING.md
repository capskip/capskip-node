# Contributing to CapSkip Node.js SDK

Thank you for helping improve the CapSkip Node.js SDK. This document explains how to set up your environment, run tests, and submit changes.

---

## Prerequisites

- Node.js 18 or newer
- Git
- CapSkip desktop app (for integration testing against a live instance)

---

## Development setup

```bash
# Clone the repository
git clone https://github.com/capskip/capskip-node.git
cd capskip-node

# Install (there are no runtime dependencies; this sets up the workspace)
npm install
```

---

## Running tests

Tests use Node's built-in test runner and mock the HTTP layer — CapSkip does not need to be running.

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch
```

### Test structure

| File | Description |
|---|---|
| `test/helpers/mockApiClient.js` | Mock `ApiClient` + shared assertions |
| `test/helpers/mockServer.js` | Local mock CapSkip server |
| `test/normal.test.js` | Image captcha unit tests |
| `test/recaptcha.test.js` | reCAPTCHA unit tests |
| `test/turnstile.test.js` | Turnstile unit tests |
| `test/pollParsing.test.js` | `res.php` response parsing |
| `test/integration.test.js` | End-to-end tests driving the real HTTP layer |

Unit tests verify that SDK methods send the correct parameters to the CapSkip API.
Integration tests spin up a local mock server and exercise the full submit/poll
round trip — no CapSkip app or network access required.

---

## Code style

- Match the existing code style in `src/`
- Keep changes focused — one feature or fix per pull request
- Add or update tests for any behavior change
- Update documentation in `docs/` and `README.md` when adding features
- Keep the SDK dependency-free — it relies only on the Node standard library

---

## Pull request process

1. Fork the repository and create a feature branch:

   ```bash
   git checkout -b feature/my-improvement
   ```

2. Make your changes and ensure tests pass:

   ```bash
   npm test
   ```

3. Update `CHANGELOG.md` under `[Unreleased]` if applicable.

4. Push and open a pull request against `main`.

5. Fill in the pull request template completely.

---

## Reporting bugs

Use the [Bug Report issue template](.github/ISSUE_TEMPLATE/bug_report.yml) and include:

- Node.js version
- SDK version
- CapSkip port and captcha type
- Minimal reproduction steps
- Full error / stack trace (redact secrets)

---

## Feature requests

CapSkip only supports: **image captcha**, **reCAPTCHA v2/v3**, and **Cloudflare Turnstile**.

Before requesting a new captcha type, confirm it is supported by [CapSkip API docs](https://capskip.com/api-docs/). Use the [Feature Request template](.github/ISSUE_TEMPLATE/feature_request.yml) for SDK improvements.

---

## Project structure

```
src/                  # Package source
types/                # TypeScript definitions
docs/                 # Documentation
examples/             # Runnable example scripts
test/                 # Unit and integration tests
.github/              # GitHub Actions and templates
```

---

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
