import { describe, expect, it, vi } from 'vitest';
import { basicAuthHeader, createWebDAVClient, normalizeWebDAVURL, WebDAVError } from '../../src/core/webdav';

const cfg = { url: 'https://dav.example.com/zotero-tts', username: 'ann', password: 'pw' };

function client(fetchImpl: unknown, overrides: Partial<typeof cfg> = {}, timeoutMs?: number) {
  return createWebDAVClient({ ...cfg, ...overrides }, { fetch: fetchImpl as typeof fetch, timeoutMs });
}

/** The i-th request the client made: its URL and init. */
function call(fetchImpl: unknown, i = 0) {
  const [url, init] = (fetchImpl as { mock: { calls: unknown[][] } }).mock.calls[i];
  return { url: url as string, init: init as RequestInit & { headers: Record<string, string> } };
}

const status = (code: number) => new Response(null, { status: code });

function kindOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return (e as WebDAVError).kind;
  }
  return undefined;
}

describe('normalizeWebDAVURL', () => {
  it('trims and ends the folder with exactly one slash', () => {
    expect(normalizeWebDAVURL('  https://dav.example.com/zotero-tts  ')).toBe('https://dav.example.com/zotero-tts/');
    expect(normalizeWebDAVURL('https://dav.example.com/zotero-tts///')).toBe('https://dav.example.com/zotero-tts/');
    expect(normalizeWebDAVURL('http://nas.local:5005/dav/')).toBe('http://nas.local:5005/dav/');
  });

  it('rejects an empty or non-http URL as a configuration error', () => {
    expect(kindOf(() => normalizeWebDAVURL(''))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('   '))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('dav.example.com/zotero-tts'))).toBe('config');
    expect(kindOf(() => normalizeWebDAVURL('ftp://dav.example.com/zotero-tts'))).toBe('config');
    expect(() => normalizeWebDAVURL('')).toThrow(WebDAVError);
  });
});

describe('basicAuthHeader', () => {
  it('encodes user:password as base64 of the UTF-8 bytes', () => {
    expect(basicAuthHeader('ann', 'pw')).toBe('Basic ' + Buffer.from('ann:pw', 'utf8').toString('base64'));
    expect(basicAuthHeader('ann', 'pässwörd')).toBe('Basic ' + Buffer.from('ann:pässwörd', 'utf8').toString('base64'));
  });
});

describe('check', () => {
  it('sends PROPFIND with Depth 0 and the credentials to the folder', async () => {
    const fetchImpl = vi.fn(async () => status(207));
    await client(fetchImpl).check();
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/');
    expect(init.method).toBe('PROPFIND');
    expect(init.headers.Depth).toBe('0');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
    expect(init.cache).toBe('no-store');
  });

  it('sends no Authorization header without a username', async () => {
    const fetchImpl = vi.fn(async () => status(207));
    await client(fetchImpl, { username: '', password: '' }).check();
    expect(call(fetchImpl).init.headers).not.toHaveProperty('Authorization');
  });

  it('reports 401 and 403 as rejected credentials', async () => {
    await expect(client(vi.fn(async () => status(401))).check()).rejects.toMatchObject({ kind: 'auth', status: 401 });
    await expect(client(vi.fn(async () => status(403))).check()).rejects.toMatchObject({ kind: 'auth', status: 403 });
  });

  it('reports a folder that does not exist yet', async () => {
    await expect(client(vi.fn(async () => status(404))).check()).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringContaining('https://dav.example.com/zotero-tts/'),
    });
  });

  it('reports any other status with its code', async () => {
    await expect(client(vi.fn(async () => status(500))).check()).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      message: expect.stringContaining('500'),
    });
  });

  it('reports a request that could not be made as a network error, with the reason', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('NetworkError when attempting to fetch resource.');
    });
    await expect(client(fetchImpl).check()).rejects.toMatchObject({
      kind: 'network',
      message: expect.stringContaining('NetworkError'),
    });
  });

  // The plugin sandbox has no AbortController, so a stalled request cannot
  // be cancelled — but it must still surface as an error, never hang
  it('gives up after the timeout', async () => {
    const never = vi.fn(() => new Promise<Response>(() => {}));
    await expect(client(never, {}, 20).check()).rejects.toMatchObject({ kind: 'network', message: expect.stringContaining('No reply') });
  });
});

describe('upload', () => {
  it('PUTs the text as JSON at the file URL', async () => {
    const fetchImpl = vi.fn(async () => status(201));
    await client(fetchImpl).upload('zotero-tts-settings.json', '{"a":1}');
    expect(fetchImpl).toHaveBeenCalledOnce();
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/zotero-tts-settings.json');
    expect(init.method).toBe('PUT');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
  });

  it('accepts 200 and 204 as well as 201', async () => {
    await expect(client(vi.fn(async () => status(200))).upload('f', 'x')).resolves.toBeUndefined();
    await expect(client(vi.fn(async () => status(204))).upload('f', 'x')).resolves.toBeUndefined();
  });

  // RFC 4918 answers 409 to a PUT whose parent collection is missing; some
  // servers say 404. Either way: make the folder, then write again.
  it('creates the folder and writes again when the server says the parent is missing', async () => {
    for (const missing of [409, 404]) {
      const fetchImpl = vi.fn().mockResolvedValueOnce(status(missing)).mockResolvedValueOnce(status(201)).mockResolvedValueOnce(status(201));
      await client(fetchImpl).upload('f.json', 'x');
      expect(fetchImpl).toHaveBeenCalledTimes(3);
      expect(call(fetchImpl, 1).init.method).toBe('MKCOL');
      expect(call(fetchImpl, 1).url).toBe('https://dav.example.com/zotero-tts/');
      expect(call(fetchImpl, 2).init.method).toBe('PUT');
      expect(call(fetchImpl, 2).init.body).toBe('x');
    }
  });

  it('treats a folder that turns out to exist (MKCOL 405) as created', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(404)).mockResolvedValueOnce(status(405)).mockResolvedValueOnce(status(204));
    await expect(client(fetchImpl).upload('f.json', 'x')).resolves.toBeUndefined();
  });

  it('fails when the folder cannot be created', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(status(409)).mockResolvedValueOnce(status(409));
    await expect(client(fetchImpl).upload('f.json', 'x')).rejects.toMatchObject({ kind: 'http', status: 409 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('reports rejected credentials and other failures', async () => {
    await expect(client(vi.fn(async () => status(401))).upload('f', 'x')).rejects.toMatchObject({ kind: 'auth' });
    await expect(client(vi.fn(async () => status(507))).upload('f', 'x')).rejects.toMatchObject({ kind: 'http', status: 507 });
  });
});

describe('download', () => {
  it('GETs the file and returns its text', async () => {
    const fetchImpl = vi.fn(async () => new Response('{"a":1}', { status: 200 }));
    await expect(client(fetchImpl).download('zotero-tts-settings.json')).resolves.toBe('{"a":1}');
    const { url, init } = call(fetchImpl);
    expect(url).toBe('https://dav.example.com/zotero-tts/zotero-tts-settings.json');
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(basicAuthHeader('ann', 'pw'));
    expect(init.cache).toBe('no-store');
  });

  it('reports a server without the file as not-found, naming the file', async () => {
    await expect(client(vi.fn(async () => status(404))).download('zotero-tts-settings.json')).rejects.toMatchObject({
      kind: 'not-found',
      message: expect.stringContaining('zotero-tts-settings.json'),
    });
  });

  it('reports rejected credentials and other failures', async () => {
    await expect(client(vi.fn(async () => status(403))).download('f')).rejects.toMatchObject({ kind: 'auth' });
    await expect(client(vi.fn(async () => status(502))).download('f')).rejects.toMatchObject({ kind: 'http', status: 502 });
  });
});

describe('createWebDAVClient', () => {
  it('rejects a bad URL up front, before any request', () => {
    const fetchImpl = vi.fn();
    expect(kindOf(() => client(fetchImpl, { url: '' }))).toBe('config');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exposes the normalized folder URL', () => {
    expect(client(vi.fn()).url).toBe('https://dav.example.com/zotero-tts/');
  });
});
