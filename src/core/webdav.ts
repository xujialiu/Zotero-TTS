import { withTimeout } from './timeout';

/**
 * A WebDAV client just large enough to keep a few files in one folder: the
 * settings backups — one per machine since #41 — and the shared reading
 * positions (#40). Plain fetch with Basic authentication, which every
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

export interface WebDAVFile {
  /** The file's name inside the folder, percent-decoding undone. */
  name: string;
  /** The server's getlastmodified for it, verbatim (RFC 1123), or null. */
  lastModified: string | null;
}

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXML(text: string): string {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-z]+);/g, (whole, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      try {
        return String.fromCodePoint(code);
      } catch {
        return whole;
      }
    }
    return XML_ENTITIES[body] ?? whole;
  });
}

/** One tag's text inside a block, whatever namespace prefix the server chose. */
function tagText(block: string, local: string): string | null {
  const m = block.match(new RegExp(`<(?:[\\w.-]+:)?${local}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[\\w.-]+:)?${local}>`, 'i'));
  return m ? m[1].trim() : null;
}

/**
 * The files of a PROPFIND Depth 1 multistatus, parsed without a DOM — the
 * sandbox has DOMParser but the tests' Node does not, and multistatus is
 * machine-written XML: one <response> per entry, href and getlastmodified
 * as flat text. Namespace prefixes are not assumed (Nextcloud writes d:,
 * Apache D: with lp1: on the props, others none). Collections — the
 * folder's own entry included — are skipped by their trailing slash or a
 * <collection/> resourcetype.
 */
export function parseMultistatus(xml: string): WebDAVFile[] {
  const out: WebDAVFile[] = [];
  for (const [, block] of xml.matchAll(/<(?:[\w.-]+:)?response[\s>]([\s\S]*?)<\/(?:[\w.-]+:)?response>/gi)) {
    const href = tagText(block, 'href');
    if (!href) continue;
    const path = decodeXML(href);
    if (path.endsWith('/') || /<(?:[\w.-]+:)?collection[\s/>]/i.test(block)) continue;
    const segment = path.slice(path.lastIndexOf('/') + 1);
    let name = segment;
    try {
      name = decodeURIComponent(segment);
    } catch {
      // A server that does not percent-encode leaves the segment as is
    }
    if (!name) continue;
    out.push({ name, lastModified: tagText(block, 'getlastmodified') });
  }
  return out;
}

/** What list() asks the server for; allprop replies still parse, this just keeps them small. */
const PROPFIND_BODY = '<?xml version="1.0" encoding="utf-8"?><propfind xmlns="DAV:"><prop><getlastmodified/><resourcetype/></prop></propfind>';

export interface WebDAVClient {
  /** The folder the files live in, normalized. */
  readonly url: string;
  /** Proves the URL and the credentials: the folder answers a PROPFIND. */
  check(): Promise<void>;
  /** Writes a file, creating the folder when the server says it is missing. */
  upload(name: string, text: string): Promise<void>;
  /** Reads a file; `not-found` when the server has none. */
  download(name: string): Promise<string>;
  /** The folder's files with their last-modified dates; `not-found` when the folder itself is missing. */
  list(): Promise<WebDAVFile[]>;
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

    async list() {
      const response = await request('PROPFIND', url, { headers: { Depth: '1', 'Content-Type': 'application/xml' }, body: PROPFIND_BODY });
      if (response.status === 404) {
        throw new WebDAVError('not-found', `The folder ${url} does not exist. It is created on the first upload.`, 404);
      }
      if (!response.ok) throw failed('PROPFIND', response);
      return parseMultistatus(await response.text());
    },
  };
}
