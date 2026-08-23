import { withTimeout } from './timeout';

/**
 * A WebDAV client just large enough to keep one file on a server: the
 * settings backup (core/settings-backup.ts), uploaded from one machine and
 * downloaded on another. Plain fetch with Basic authentication, which every
 * WebDAV host the plugin is likely to meet (Nextcloud, Synology, Jianguoyun,
 * Koofr, Apache or nginx with a password file) accepts over HTTPS; a server
 * that insists on Digest is not supported. Every request is bounded by a
 * timeout: the plugin sandbox has no AbortController, so a stalled request
 * cannot be cancelled, but it must still surface as an error, never hang.
 */

export type WebDAVConfig = { url: string; username: string; password: string };

export type WebDAVErrorKind =
  /** The settings are unusable — no URL, or not an http(s) one */
  | 'config'
  /** 401 or 403 */
  | 'auth'
  /** The folder (check) or the file (download) is not there */
  | 'not-found'
  /** The request could not be made, or got no reply in time */
  | 'network'
  /** Any other status */
  | 'http';

export class WebDAVError extends Error {
  constructor(
    public readonly kind: WebDAVErrorKind,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'WebDAVError';
  }
}

export const WEBDAV_TIMEOUT_MS = 15_000;

/** The folder URL with exactly one trailing slash; rejects anything that is not http(s). */
export function normalizeWebDAVURL(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) throw new WebDAVError('config', 'Set the WebDAV URL first.');
  if (!/^https?:\/\//i.test(trimmed)) throw new WebDAVError('config', 'The WebDAV URL must start with http:// or https://.');
  return trimmed.replace(/\/+$/, '') + '/';
}

/** `Basic` credentials: base64 of the UTF-8 bytes of `user:password` (RFC 7617). */
export function basicAuthHeader(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return `Basic ${btoa(binary)}`;
}

export interface WebDAVClient {
  /** The folder the file lives in, normalized. */
  readonly url: string;
  /** Proves the URL and the credentials: the folder answers a PROPFIND. */
  check(): Promise<void>;
  /** Writes the file, creating the folder when the server says it is missing. */
  upload(name: string, text: string): Promise<void>;
  /** Reads the file; `not-found` when the server has none. */
  download(name: string): Promise<string>;
}

export function createWebDAVClient(cfg: WebDAVConfig, deps: { fetch: typeof fetch; timeoutMs?: number }): WebDAVClient {
  const url = normalizeWebDAVURL(cfg.url);
  const timeoutMs = deps.timeoutMs ?? WEBDAV_TIMEOUT_MS;
  const auth: Record<string, string> = cfg.username ? { Authorization: basicAuthHeader(cfg.username, cfg.password) } : {};

  async function request(method: string, target: string, init: { headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
    let response: Response;
    try {
      response = await withTimeout(
        deps.fetch(target, { method, headers: { ...auth, ...init.headers }, body: init.body, cache: 'no-store' }),
        timeoutMs,
        () => new WebDAVError('network', `No reply from ${url} within ${Math.round(timeoutMs / 1000)} s.`),
      );
    } catch (e) {
      if (e instanceof WebDAVError) throw e;
      throw new WebDAVError('network', `Cannot reach ${url}: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (response.status === 401 || response.status === 403) {
      throw new WebDAVError('auth', `The server rejected the username or password (HTTP ${response.status}).`, response.status);
    }
    return response;
  }

  const failed = (what: string, response: Response) => new WebDAVError('http', `${what} failed: HTTP ${response.status}.`, response.status);

  return {
    url,

    async check() {
      const response = await request('PROPFIND', url, { headers: { Depth: '0' } });
      if (response.status === 404) {
        throw new WebDAVError('not-found', `The folder ${url} does not exist. It is created on the first upload.`, 404);
      }
      if (!response.ok) throw failed('PROPFIND', response);
    },

    async upload(name, text) {
      const target = url + name;
      const put = () => request('PUT', target, { headers: { 'Content-Type': 'application/json' }, body: text });
      let response = await put();
      // RFC 4918 answers 409 to a PUT whose parent collection is missing;
      // some servers say 404. Make the folder and write once more. A 405
      // from MKCOL means the folder exists after all.
      if (response.status === 404 || response.status === 409) {
        const made = await request('MKCOL', url);
        if (!made.ok && made.status !== 405) throw failed(`Creating the folder ${url}`, made);
        response = await put();
      }
      if (!response.ok) throw failed('Upload', response);
    },

    async download(name) {
      const target = url + name;
      const response = await request('GET', target);
      if (response.status === 404) throw new WebDAVError('not-found', `No backup on the server yet (${target} not found).`, 404);
      if (!response.ok) throw failed('Download', response);
      return response.text();
    },
  };
}
