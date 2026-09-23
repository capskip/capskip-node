# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.3.0] - 2026-09-22

### Added

- **Capy Puzzle support** via `capy(sitekey, url, options)`. The site key
  (conventionally prefixed `PUZZLE_`) is sent as the `captchakey` the API
  documents. Optional `api_server` selects the Capy API the key lives behind,
  defaulting to `https://jp.api.capy.me`.
  A Capy answer is **not a token**: the result expands into `captchakey`,
  `challengekey` and `answer`, which go into the target form's `capy_captchakey`,
  `capy_challengekey` and `capy_answer` fields. `code` keeps the raw answer.
- **CaptchaFox support** via `captchafox(sitekey, url, options)`. The result
  exposes `token` (for the form's `cf-captcha-response` field) and, when the
  solve reported one, `userAgent` — the UA the browser actually minted the token
  under, which is not the one you sent. Optional `api_server` selects the widget
  source; the MAM package returns a `MAM_` prefixed token.
- **Friendly Captcha support** via `friendlyCaptcha(sitekey, url, options)`.
  Pass `version` (`v1`/`v2`, or a bare `1`/`2`), or `moduleScript` /
  `nomoduleScript` with the widget script URLs and let CapSkip read the version
  off the build the site actually loads. Optional `api_server` accepts `global`
  (the default), `eu`, or a full URL for the data-residency tenant. The result
  exposes `token`, for `frc-captcha-solution` on v1 or `frc-captcha-response` on
  v2.
- Parameter aliases `userAgent`/`user_agent` for `useragent`, `captchaKey` for
  `captchakey`, and `moduleScript`/`nomoduleScript` for `module_script` /
  `nomodule_script`.
- TypeScript definitions for `CapyOptions`, `CaptchaFoxOptions` and
  `FriendlyCaptchaOptions`, plus the new `SolveResult` fields.

### Notes

- `version: 'avatar'` is refused locally for Capy. CapSkip solves the puzzle
  family only, and answering an avatar request with a puzzle answer would bill
  for a solve the target site rejects, indistinguishably from a broken solver.
- An unknown Friendly Captcha `version` is refused locally too. The two versions
  are different protocols sharing one sitekey namespace, so solving the wrong one
  returns a well-formed token the site rejects with nothing to indicate why.
- CaptchaFox and Friendly Captcha use `recaptchaTimeout`: the first is a real
  browser solve, and the second has its difficulty set per request by the service
  (and always solves in a browser on v2). Capy uses `defaultTimeout` — it is one
  HTTP fetch plus pixel math, held back to roughly two seconds because Capy
  refuses answers that arrive faster than a human could have produced them.

## [1.2.0] - 2026-09-12

### Added

- **ALTCHA support** via `altcha(url, options)`. Pass `challengeUrl` for CapSkip
  to fetch the challenge, or `challengeJson` with the document itself (a JSON
  string, or an object which is serialized for you). Sending both is allowed —
  the inline document wins. The result exposes `token` (the value the site's
  `altcha` form field expects) and `number`, the counter that solved it; `code`
  keeps the same raw string.
- Parameter aliases `challengeUrl`/`challengeURL` for `challenge_url` and
  `challengeJson`/`challengeJSON` for `challenge_json`.
- `AltchaOptions` and the `token`/`number` result fields in the TypeScript
  definitions.
- Both ALTCHA generations are handled: the legacy scheme (SHA-1/256/384/512) and
  proof-of-work v2 (PBKDF2 or SHA). Their tokens are shaped differently — a v2
  payload carries no top-level `number`, its counter sitting at
  `solution.counter` — so the counter is taken from the server's own `solution`
  object, the one field both report the same way, and dug out of the token only
  when a poll did not carry it.

### Notes

- ALTCHA is CPU proof-of-work rather than a browser solve, so it uses
  `defaultTimeout` instead of the longer `recaptchaTimeout` that reCAPTCHA,
  Turnstile and GeeTest use.
- A proxy passed to `altcha()` applies only to the `challengeUrl` fetch; a task
  carrying its challenge inline never touches the network.

## [1.1.0] - 2026-07-26

### Added

- **GeeTest v3 (slide) support** via `geetest(gt, challenge, url, options)`.
  Accepts the optional `api_server` domain override and the usual `proxy`
  option. The result exposes the answer as the parsed `challenge`, `validate`,
  and `seccode` fields, while `code` keeps the raw JSON string CapSkip returns.
- Parameter aliases `apiServer` and `api_subdomain` for `api_server`.
- TypeScript definitions for `geetest()`, `GeetestOptions`, and the new
  `SolveResult` fields.
- `proxytype` is now validated against the values CapSkip accepts (`HTTP`,
  `HTTPS`, `SOCKS5`, `SOCKS5H`, case-insensitive) for every proxy-capable captcha
  type. `SOCKS4` and other values previously reached the server and came back as
  `ERROR_BAD_PARAMETERS`; they now raise `ValidationException` locally.

## [1.0.2] - 2026-07-15

### Fixed

- Submitting with `json=1` no longer fails with `ApiException: cannot recognize
  response`. With `json=1` CapSkip's `in.php` returns `{"status":1,"request":"<id>"}`
  instead of `OK|<id>`; `send()` now parses both forms, so `normal(file, { json: 1 })`
  and the equivalent reCAPTCHA/Turnstile calls submit and solve correctly.

## [1.0.1] - 2026-07-14

### Fixed

- Polling no longer crashes with `ApiException: cannot recognize response` when
  CapSkip returns an empty response body. CapSkip returns an empty body while no
  result is available yet — briefly right after a captcha is submitted (before it
  reports `CAPCHA_NOT_READY`), for an unknown id, and after a solved token has
  already been read. The SDK now treats an empty body as "not ready" and keeps
  polling, so `recaptcha()`, `turnstile()`, and `normal()` solve reliably instead
  of failing on the first poll.

## [1.0.0] - 2026-07-14

### Added

- Initial release of the CapSkip Node.js SDK
- `CapSkip` client for the local CapSkip API — every method returns a Promise
- `AsyncCapSkip` / `AsyncApiClient` exported as aliases for cross-SDK parity
- Image CAPTCHA solving via `normal()` (file, URL, base64, or data-URI)
- reCAPTCHA v2 / v3 solving via `recaptcha()` (invisible, enterprise, proxy)
- Cloudflare Turnstile solving via `turnstile()` (widget and challenge page)
- Turnstile automatically polls with `json=1` and returns `userAgent` when provided
- Manual workflow: `send()`, `getResult()`, `solve()`
- Adaptive result polling — starts at 0.25s and backs off (doubling) up to the
  configured `pollingInterval`, so fast solves (e.g. image captchas) return in a
  fraction of a second; `pollingInterval` also accepts sub-second values
- Familiar parameter aliases (`url`→`pageurl`, `score`→`min_score`, etc.)
- Proxy support via object format `{ type: '...', uri: '...' }`
- Strict per-captcha parameter validation — only documented parameters are accepted
- Error hierarchy: `ValidationException`, `NetworkException`, `ApiException`, `TimeoutException`
- Bundled TypeScript type definitions
- Example scripts for every supported captcha type
- Unit and integration tests using Node's built-in test runner — no runtime dependencies
- Documentation: Tutorial, Getting Started, API Reference, Troubleshooting

[1.0.2]: https://github.com/capskip/capskip-node/releases/tag/v1.0.2
[1.0.1]: https://github.com/capskip/capskip-node/releases/tag/v1.0.1
[1.0.0]: https://github.com/capskip/capskip-node/releases/tag/v1.0.0
