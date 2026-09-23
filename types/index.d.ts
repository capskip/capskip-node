// Type definitions for the CapSkip Node.js SDK.

/** Proxy passed to any solve except image captcha. */
export interface Proxy {
  /** Proxy type: `HTTP`, `HTTPS`, `SOCKS5`, or `SOCKS5H`. */
  type: string;
  /** Proxy address: `login:password@host:port` or bare `host:port`. */
  uri: string;
}

/** Options accepted by the {@link CapSkip} constructor. */
export interface CapSkipOptions {
  /** CapSkip API key (any string when key validation is disabled). Default `"capskip"`. */
  apiKey?: string;
  /** CapSkip host. Default `"127.0.0.1"`. */
  host?: string;
  /** CapSkip port. Default `8080`. */
  port?: number;
  /** Seconds to poll an image captcha before timing out. Default `120`. */
  defaultTimeout?: number;
  /**
   * Seconds to poll reCAPTCHA / Turnstile / GeeTest / CaptchaFox / Friendly
   * Captcha before timing out. Default `300`. ALTCHA and Capy use
   * `defaultTimeout` instead — neither is a browser solve.
   */
  recaptchaTimeout?: number;
  /** Max seconds between polls; starts at `0.25` and backs off to this. Default `5`. */
  pollingInterval?: number;
}

/** The dictionary every solve method resolves to. */
export interface SolveResult {
  /** CapSkip's internal id for this solve. */
  captchaId: string;
  /**
   * The solution: recognized text for images, a token otherwise. For GeeTest
   * this is the raw JSON string CapSkip returns — prefer the parsed
   * `challenge` / `validate` / `seccode` fields below. For ALTCHA it is the
   * base64 token, also exposed as `token`. For Capy it is the raw answer
   * object, expanded into the three fields below.
   */
  code: string | Record<string, unknown>;
  /**
   * Turnstile and CaptchaFox — the User-Agent to use when submitting the token.
   * For CaptchaFox this is the browser's own, not one you sent, and it is absent
   * when the solve captured none rather than guessed.
   */
  userAgent?: string;
  /** GeeTest only — the `geetest_challenge` value to post back. */
  challenge?: string;
  /** GeeTest only — the `geetest_validate` value to post back. */
  validate?: string;
  /** GeeTest only — the `geetest_seccode` value to post back. */
  seccode?: string;
  /**
   * ALTCHA only — the base64 payload to post back in the site's `altcha` form
   * field. The same string as `code`, named for where it goes.
   */
  token?: string;
  /** ALTCHA only — the counter that solved the challenge. */
  number?: number;
  /** Capy only — the value for the target form's `capy_captchakey` field. */
  captchakey?: string;
  /** Capy only — the value for the target form's `capy_challengekey` field. */
  challengekey?: string;
  /**
   * Capy only — the value for the target form's `capy_answer` field. The drag
   * path the widget would have recorded; submit it verbatim.
   */
  answer?: string;
  /**
   * Capy only — empty for a puzzle solve. Present for shape compatibility with
   * 2Captcha's documented response; it carries nothing.
   */
  respKey?: string;
}

/** Extra options for {@link CapSkip.normal}. */
export interface NormalOptions {
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
}

/** Extra options for {@link CapSkip.recaptcha}. */
export interface RecaptchaOptions {
  /** `"v2"` (default) or `"v3"`. */
  version?: string;
  /** `1` for reCAPTCHA Enterprise. Default `0`. */
  enterprise?: number;
  /** `1` for invisible reCAPTCHA v2. */
  invisible?: number;
  /** v3 action from `grecaptcha.execute()`. */
  action?: string;
  /** v3 minimum acceptable score (alias for `min_score`). */
  score?: number;
  /** v3 minimum acceptable score (alias for `min_score`). */
  minScore?: number;
  /** v3 minimum acceptable score. */
  min_score?: number;
  /** Google Search / services `data-s` value (alias for `data-s`). */
  datas?: string;
  /** Google Search / services `data-s` value (alias for `data-s`). */
  data_s?: string;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy used for solving. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.turnstile}. */
export interface TurnstileOptions {
  /** Action from `data-action` or `turnstile.render()`. */
  action?: string;
  /** `cData` / `data-cdata` value for challenge pages. */
  data?: string;
  /** `chlPageData` value for challenge pages. */
  pagedata?: string;
  /** Proxy used for solving. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.geetest}. */
export interface GeetestOptions {
  /** GeeTest API server domain (alias for `api_server`). */
  apiServer?: string;
  /** GeeTest API server domain (alias for `api_server`). */
  api_subdomain?: string;
  /** GeeTest API server domain, e.g. `"api-na.geetest.com"`. */
  api_server?: string;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy used for solving. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.altcha}. */
export interface AltchaOptions {
  /** Endpoint CapSkip fetches the challenge from. */
  challengeUrl?: string;
  /** Endpoint CapSkip fetches the challenge from. */
  challenge_url?: string;
  /**
   * The challenge document itself. An object is serialized for you; a string is
   * sent as-is.
   */
  challengeJson?: string | Record<string, unknown>;
  /** The challenge document itself. */
  challenge_json?: string | Record<string, unknown>;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy — used only for the `challengeUrl` fetch, never for the solve. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.capy}. */
export interface CapyOptions {
  /** Root of the Capy API the key lives behind (alias for `api_server`). */
  apiServer?: string;
  /** Root of the Capy API the key lives behind. Default `https://jp.api.capy.me`. */
  api_server?: string;
  /**
   * The challenge family. Only `"puzzle"` (the default) is solved — `"avatar"`
   * is refused before the request is made.
   */
  version?: string;
  /** User-Agent to send with the puzzle request (alias for `useragent`). */
  userAgent?: string;
  /** User-Agent to send with the puzzle request. */
  useragent?: string;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy — used for the puzzle-image fetch, the only request a Capy solve makes. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.captchafox}. */
export interface CaptchaFoxOptions {
  /** Widget entry point (alias for `api_server`). */
  apiServer?: string;
  /**
   * Widget entry point. Default `https://cdn.captchafox.com/`. The MAM package
   * path returns a `MAM_` prefixed token instead.
   */
  api_server?: string;
  /** Accepted for compatibility and not applied (alias for `useragent`). */
  userAgent?: string;
  /** Accepted for compatibility and not applied — CapSkip uses its own browser. */
  useragent?: string;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy used for solving. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Extra options for {@link CapSkip.friendlyCaptcha}. */
export interface FriendlyCaptchaOptions {
  /** Protocol version: `"v1"` (default) or `"v2"`; a bare `1` or `2` works too. */
  version?: string | number;
  /** `src` of the widget script tag carrying `type="module"` (alias). */
  moduleScript?: string;
  /** `src` of the widget script tag carrying `type="module"`. */
  module_script?: string;
  /** `src` of the widget script tag carrying `nomodule` (alias). */
  nomoduleScript?: string;
  /** `src` of the widget script tag carrying `nomodule`. */
  nomodule_script?: string;
  /** Data residency tenant (alias for `api_server`). */
  apiServer?: string;
  /** Data residency tenant: `"global"` (default), `"eu"`, or a full URL. */
  api_server?: string;
  /** User-Agent to send with the request (alias for `useragent`). */
  userAgent?: string;
  /** User-Agent to send with the request. */
  useragent?: string;
  /** `1` to request the raw JSON response from CapSkip. */
  json?: number;
  /** Proxy used for solving. */
  proxy?: Proxy | string;
  /** Proxy type when `proxy` is a bare string. */
  proxytype?: string;
  [key: string]: unknown;
}

/** Options for the {@link CapSkip.solve} manual workflow. */
export interface SolveOptions {
  /** Poll timeout in seconds (falls back to the configured default). */
  timeout?: number;
  /** Max seconds between polls (falls back to the configured default). */
  polling_interval?: number;
  /** `1` to poll with `json=1`. */
  poll_json?: number;
  [key: string]: unknown;
}

/** Client for the CapSkip local captcha solver. */
export class CapSkip {
  constructor(options?: CapSkipOptions);
  apiKey: string;
  defaultTimeout: number;
  recaptchaTimeout: number;
  pollingInterval: number;
  apiClient: ApiClient;
  exceptions: typeof CapSkipError;

  /** Solve an image captcha from a file path, URL, base64 string, or data-URI. */
  normal(file: string, options?: NormalOptions): Promise<SolveResult>;
  /** Solve reCAPTCHA v2/v3 (invisible, enterprise, proxy). */
  recaptcha(sitekey: string, url: string, options?: RecaptchaOptions): Promise<SolveResult>;
  /** Solve Cloudflare Turnstile (widget or challenge page). */
  turnstile(sitekey: string, url: string, options?: TurnstileOptions): Promise<SolveResult>;
  /**
   * Solve a GeeTest v3 slider.
   *
   * `gt` is static per site; `challenge` is single-use and expires in about a
   * minute, so fetch a fresh pair immediately before calling this.
   */
  geetest(
    gt: string,
    challenge: string,
    url: string,
    options?: GeetestOptions,
  ): Promise<SolveResult>;
  /**
   * Solve an ALTCHA proof-of-work challenge.
   *
   * Pass `challengeUrl` for CapSkip to fetch the challenge, or `challengeJson`
   * with the document itself. Sending both is allowed — the inline document
   * wins. Challenges expire fast, so fetch one immediately before calling.
   */
  altcha(url: string, options?: AltchaOptions): Promise<SolveResult>;
  /**
   * Solve a Capy Puzzle captcha.
   *
   * `sitekey` is the site's public Capy key, conventionally prefixed `PUZZLE_`,
   * and is sent as the `captchakey` the API documents. The result is not a
   * token: it carries `captchakey`, `challengekey` and `answer`, all three of
   * which go into the target form.
   */
  capy(sitekey: string, url: string, options?: CapyOptions): Promise<SolveResult>;
  /**
   * Solve a CaptchaFox challenge.
   *
   * `url` has to be the page the widget actually runs on — CaptchaFox checks it
   * against the domains the key is registered for. The result carries `token`
   * for the form's `cf-captcha-response` field.
   */
  captchafox(
    sitekey: string,
    url: string,
    options?: CaptchaFoxOptions,
  ): Promise<SolveResult>;
  /**
   * Solve a Friendly Captcha proof-of-work challenge.
   *
   * Two different protocols ship under this name and a sitekey does not say
   * which, so pass `version`, or pass `moduleScript` and let CapSkip read it off
   * the build the site loads. The token goes into `frc-captcha-solution` on v1
   * or `frc-captcha-response` on v2.
   */
  friendlyCaptcha(
    sitekey: string,
    url: string,
    options?: FriendlyCaptchaOptions,
  ): Promise<SolveResult>;
  /** Submit then poll to completion. Used by the higher-level solve methods. */
  solve(options?: SolveOptions): Promise<SolveResult>;
  /** Submit a captcha without polling; resolves to the captcha id. */
  send(params?: Record<string, unknown>): Promise<string>;
  /** Poll a result once; rejects with `NetworkException` while not ready. */
  getResult(id: string, json?: number): Promise<string | Record<string, unknown>>;
  /** Poll until solved or the timeout (seconds) elapses. */
  waitResult(
    id: string,
    timeout: number,
    pollingInterval: number,
    json?: number,
  ): Promise<string | Record<string, unknown>>;
  /** Resolve an image input into the `in.php` `method`/`body`/`file` fields. */
  getMethod(file: string): Promise<Record<string, string>>;
}

/** Alias of {@link CapSkip}; Node is async-native, so there is no separate sync client. */
export const AsyncCapSkip: typeof CapSkip;

/** Options accepted by the {@link ApiClient} constructor. */
export interface ApiClientOptions {
  host?: string;
  port?: number;
}

/** Low-level HTTP client for the CapSkip in.php / res.php endpoints. */
export class ApiClient {
  constructor(options?: ApiClientOptions);
  host: string;
  port: number;
  readonly baseUrl: string;
  in_(options?: Record<string, unknown>): Promise<string>;
  res(params?: Record<string, unknown>): Promise<string>;
}

/** Alias of {@link ApiClient}. */
export const AsyncApiClient: typeof ApiClient;

/** Base error for all CapSkip SDK failures. */
export class CapSkipError extends Error {}
/** Alias of {@link CapSkipError}. */
export const SolverExceptions: typeof CapSkipError;
/** Invalid or unsupported parameters. */
export class ValidationException extends CapSkipError {}
/** Connection failure or captcha not ready. */
export class NetworkException extends CapSkipError {}
/** CapSkip API returned an error. */
export class ApiException extends CapSkipError {}
/** Polling exceeded the configured timeout. */
export class TimeoutException extends CapSkipError {}

/** Installed SDK version. */
export const version: string;
