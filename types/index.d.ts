// Type definitions for the CapSkip Node.js SDK.

/** Proxy passed to reCAPTCHA / Turnstile solves. */
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
  /** Seconds to poll reCAPTCHA / Turnstile before timing out. Default `300`. */
  recaptchaTimeout?: number;
  /** Max seconds between polls; starts at `0.25` and backs off to this. Default `5`. */
  pollingInterval?: number;
}

/** The dictionary every solve method resolves to. */
export interface SolveResult {
  /** CapSkip's internal id for this solve. */
  captchaId: string;
  /** The solution: recognized text for images, a token otherwise. */
  code: string;
  /** Turnstile only — the User-Agent to use when submitting the token. */
  userAgent?: string;
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
