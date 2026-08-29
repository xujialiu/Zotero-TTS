import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { BACKUP_FILENAME, BACKUP_FORMAT, createBackup, parseBackup, serializeBackup } from '../../src/core/settings-backup';
import { WebDAVError, type WebDAVClient, type WebDAVConfig } from '../../src/core/webdav';
import { initWebDAVRows, WEBDAV_IDS, type WebDAVRowsDeps } from '../../src/ui/webdav-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  setAttribute(k: string, v: string) {
    this.attrs.set(k, String(v));
  }
  addEventListener(type: string, fn: () => unknown) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }
  /** Fires the handlers and waits for the async ones. */
  async fire(type: string) {
    await Promise.all((this.listeners.get(type) ?? []).map((fn) => fn()));
  }
}

const FOLDER = 'https://dav.example.com/zotero-tts/';

function setup(options: { prefs?: Record<string, unknown>; url?: string; confirm?: boolean; reading?: string[] } = {}) {
  const els = new Map((Object.values(WEBDAV_IDS) as string[]).map((id) => [id, new FakeElement()]));
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs({
    [PREF_PREFIX + 'webdav.url']: options.url ?? 'https://dav.example.com/zotero-tts',
    [PREF_PREFIX + 'webdav.username']: 'ann',
    [PREF_PREFIX + 'webdav.password']: 'pw',
    ...options.prefs,
  });
  const client = {
    url: FOLDER,
    check: vi.fn(async () => {}),
    upload: vi.fn(async (_name: string, _text: string) => {}),
    download: vi.fn(async (_name: string) => ''),
  };
  const deps = {
    prefs,
    createClient: vi.fn((cfg: WebDAVConfig): WebDAVClient => {
      if (!cfg.url) throw new WebDAVError('config', 'Set the WebDAV URL first.');
      return client;
    }),
    pluginVersion: '1.1.3',
    now: () => '2026-08-23T10:00:00.000Z',
    confirm: vi.fn(() => options.confirm ?? true),
    onRestored: vi.fn(),
    readingTabs: vi.fn(() => options.reading ?? []),
    warn: vi.fn((_message: string) => {}),
  } satisfies WebDAVRowsDeps;
  initWebDAVRows(doc, deps);
  return {
    prefs,
    deps,
    client,
    el: (id: string) => els.get(id)!,
    message: () => els.get(WEBDAV_IDS.message)!.attrs.get('value'),
  };
}

describe('Upload to WebDAV', () => {
  it('uploads the same file the Backup button writes, built from the settings as they are now', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.apiKey']: 'secret' } });
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({ url: 'https://dav.example.com/zotero-tts', username: 'ann', password: 'pw' });
    expect(t.client.upload).toHaveBeenCalledOnce();
    const [name, text] = t.client.upload.mock.calls[0];
    expect(name).toBe(BACKUP_FILENAME);
    const backup = JSON.parse(text);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, pluginVersion: '1.1.3', exportedAt: '2026-08-23T10:00:00.000Z' });
    expect(backup.settings['azure.apiKey']).toBe('secret');
    expect(backup.settings['webdav.password']).toBe('pw');
    expect(t.message()).toContain(FOLDER + BACKUP_FILENAME);
    expect(t.message()).toMatch(/API keys/);
  });

  it('reads the URL and credentials when clicked, not when the pane loaded', async () => {
    const t = setup();
    t.prefs.set(PREF_PREFIX + 'webdav.url', 'https://other.example.com/dav');
    t.prefs.set(PREF_PREFIX + 'webdav.password', 'new');
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({ url: 'https://other.example.com/dav', username: 'ann', password: 'new' });
  });

  it('asks for a URL before doing anything', async () => {
    const t = setup({ url: '' });
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.client.upload).not.toHaveBeenCalled();
    expect(t.message()).toBe('Upload failed: Set the WebDAV URL first.');
  });

  it('says what went wrong', async () => {
    const t = setup();
    t.client.upload.mockRejectedValueOnce(new WebDAVError('auth', 'The server rejected the username or password (HTTP 401).', 401));
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.message()).toBe('Upload failed: The server rejected the username or password (HTTP 401).');
  });

  it('ignores a click while another request is running', async () => {
    const t = setup();
    let finish!: () => void;
    t.client.upload.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const first = t.el(WEBDAV_IDS.upload).fire('command');
    await t.el(WEBDAV_IDS.download).fire('command');
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.client.download).not.toHaveBeenCalled();
    expect(t.client.upload).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(t.message()).toContain('Uploaded');
  });
});

describe('Download from WebDAV', () => {
  const file = serializeBackup(
    createBackup(fakePrefs({ [PREF_PREFIX + 'azure.region']: 'westeurope', [PREF_PREFIX + 'shortcuts.speedUp']: 'Ctrl+K' }), {
      exportedAt: '2026-08-20T08:00:00.000Z',
    }),
  );

  it('asks first, then applies the file and redraws the unbound rows', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining(FOLDER));
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('2026-08-20'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.prefs.store[PREF_PREFIX + 'shortcuts.speedUp']).toBe('Ctrl+K');
    expect(t.deps.onRestored).toHaveBeenCalledOnce();
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(`Restored ${count} settings from ${FOLDER}${BACKUP_FILENAME}.`);
  });

  it('changes nothing when the user declines', async () => {
    const t = setup({ confirm: false, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.onRestored).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  // The same guard the file restore has: a backup edits what the player
  // lists (issue #11)
  it('is refused while a tab is reading, and the settings stay as they were', async () => {
    const t = setup({ reading: ['Deep learning'], prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.deps.warn).toHaveBeenCalledWith(expect.stringContaining('Deep learning'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.onRestored).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  it('reports a server that has no backup yet', async () => {
    const t = setup();
    t.client.download.mockRejectedValueOnce(new WebDAVError('not-found', 'No backup on the server yet (x not found).', 404));
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Download failed: No backup on the server yet (x not found).');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a backup, leaving the settings alone', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce('garbage');
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Download failed: The file is not JSON');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('names the entries it had to skip', async () => {
    const t = setup();
    t.client.download.mockResolvedValueOnce(
      JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { 'azure.region': 'eastus', 'future.setting': 1 } }),
    );
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe(`Restored 1 settings from ${FOLDER}${BACKUP_FILENAME}. Skipped 1: future.setting.`);
  });
});

describe('Test connection', () => {
  it('reports success with the folder URL', async () => {
    const t = setup();
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.client.check).toHaveBeenCalledOnce();
    expect(t.message()).toBe(`Connected to ${FOLDER}.`);
  });

  it('reports a failure in the server’s terms', async () => {
    const t = setup();
    t.client.check.mockRejectedValueOnce(new WebDAVError('not-found', 'The folder x does not exist. It is created on the first upload.', 404));
    await t.el(WEBDAV_IDS.test).fire('command');
    expect(t.message()).toBe('Connection failed: The folder x does not exist. It is created on the first upload.');
  });
});

describe('initWebDAVRows', () => {
  it('tolerates a pane that lacks the rows', () => {
    const doc = { getElementById: () => null };
    expect(() => initWebDAVRows(doc, { prefs: fakePrefs(), createClient: () => ({}) as WebDAVClient })).not.toThrow();
  });
});
