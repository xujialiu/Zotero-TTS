import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { BACKUP_FILENAME, BACKUP_FORMAT, createBackup, machineSettingsFilename, parseBackup, serializeBackup } from '../../src/core/settings-backup';
import { WebDAVError, type WebDAVClient, type WebDAVConfig, type WebDAVFile } from '../../src/core/webdav';
import { initWebDAVRows, settingsFileLabel, WEBDAV_IDS, type WebDAVRowsDeps } from '../../src/ui/webdav-rows';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

class FakeElement {
  attrs = new Map<string, string>();
  listeners = new Map<string, Array<() => unknown>>();
  value?: string;
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
const MACHINE_FILE = machineSettingsFilename('this-mac');

function setup(
  options: {
    prefs?: Record<string, unknown>;
    url?: string;
    confirm?: boolean;
    reading?: string[];
    verify?: () => Promise<string>;
    files?: WebDAVFile[];
    select?: (title: string, options: string[]) => number | null;
  } = {},
) {
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
    // The pre-1.11 shared file by default, so a one-file restore takes it
    list: vi.fn(async (): Promise<WebDAVFile[]> => options.files ?? [{ name: BACKUP_FILENAME, lastModified: null }]),
  };
  const deps = {
    prefs,
    createClient: vi.fn((cfg: WebDAVConfig): WebDAVClient => {
      if (!cfg.url) throw new WebDAVError('config', 'Set the WebDAV URL first.');
      return client;
    }),
    machineId: { get: vi.fn(() => 'this-mac'), set: vi.fn((raw: string) => (raw.trim() ? raw.trim() : 'this-mac')) },
    pluginVersion: '1.1.3',
    now: () => '2026-08-23T10:00:00.000Z',
    confirm: vi.fn(() => options.confirm ?? true),
    onRestored: vi.fn(),
    onMachineRenamed: vi.fn(),
    readingTabs: vi.fn(() => options.reading ?? []),
    warn: vi.fn((_message: string) => {}),
    ...(options.select ? { select: vi.fn(options.select) } : {}),
    ...(options.verify ? { verifyProviders: options.verify } : {}),
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

describe('Upload settings now', () => {
  it('uploads this machine’s own file, built from the settings as they are now', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.apiKey']: 'secret' } });
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({
      url: 'https://dav.example.com/zotero-tts',
      username: 'ann',
      password: 'pw',
      syncPositions: false,
      autoUploadSettings: false,
    });
    expect(t.client.upload).toHaveBeenCalledOnce();
    const [name, text] = t.client.upload.mock.calls[0];
    expect(name).toBe(MACHINE_FILE);
    const backup = JSON.parse(text);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, pluginVersion: '1.1.3', exportedAt: '2026-08-23T10:00:00.000Z', machine: 'this-mac' });
    expect(backup.settings['azure.apiKey']).toBe('secret');
    expect(backup.settings['webdav.password']).toBe('pw');
    expect(t.message()).toContain(FOLDER + MACHINE_FILE);
    expect(t.message()).toMatch(/API keys/);
  });

  it('reads the URL and credentials when clicked, not when the pane loaded', async () => {
    const t = setup();
    t.prefs.set(PREF_PREFIX + 'webdav.url', 'https://other.example.com/dav');
    t.prefs.set(PREF_PREFIX + 'webdav.password', 'new');
    await t.el(WEBDAV_IDS.upload).fire('command');
    expect(t.deps.createClient).toHaveBeenCalledWith({
      url: 'https://other.example.com/dav',
      username: 'ann',
      password: 'new',
      syncPositions: false,
      autoUploadSettings: false,
    });
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
    expect(t.client.list).not.toHaveBeenCalled();
    expect(t.client.upload).toHaveBeenCalledOnce();
    finish();
    await first;
    expect(t.message()).toContain('Uploaded');
  });
});

describe('Restore settings from server', () => {
  const file = serializeBackup(
    createBackup(fakePrefs({ [PREF_PREFIX + 'azure.region']: 'westeurope', [PREF_PREFIX + 'shortcuts.speedUp']: 'Ctrl+K' }), {
      exportedAt: '2026-08-20T08:00:00.000Z',
      machine: 'office-pc',
    }),
  );

  it('takes the one file there is, asks first, then applies it and redraws the unbound rows', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.list).toHaveBeenCalledOnce();
    expect(t.client.download).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining(FOLDER));
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('2026-08-20'));
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('office-pc'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.prefs.store[PREF_PREFIX + 'shortcuts.speedUp']).toBe('Ctrl+K');
    expect(t.deps.onRestored).toHaveBeenCalledOnce();
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(`Restored ${count} settings from ${FOLDER}${BACKUP_FILENAME}.`);
  });

  it('lists several machines newest first and downloads the chosen one', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('office-pc'), lastModified: 'Mon, 31 Aug 2026 08:00:00 GMT' },
      { name: BACKUP_FILENAME, lastModified: null },
      { name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' },
    ];
    const select = vi.fn((_title: string, _options: string[]) => 1);
    const t = setup({ files, select });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.deps.select).toHaveBeenCalledWith('Restore settings from which computer?', [
      'laptop — Tue, 01 Sep 2026 09:00:00 GMT',
      'office-pc — Mon, 31 Aug 2026 08:00:00 GMT',
      'shared file (before 1.11) — date unknown',
    ]);
    expect(t.client.download).toHaveBeenCalledWith(machineSettingsFilename('office-pc'));
  });

  it('takes the newest without asking when there is no picker', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('office-pc'), lastModified: 'Mon, 31 Aug 2026 08:00:00 GMT' },
      { name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' },
    ];
    const t = setup({ files });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).toHaveBeenCalledWith(machineSettingsFilename('laptop'));
  });

  it('does nothing when the picker is cancelled', async () => {
    const files: WebDAVFile[] = [
      { name: machineSettingsFilename('a'), lastModified: null },
      { name: machineSettingsFilename('b'), lastModified: null },
    ];
    const t = setup({ files, select: () => null });
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).not.toHaveBeenCalled();
    expect(t.message()).toBe('');
  });

  it('ignores the positions file and other files in the folder', async () => {
    const t = setup({
      files: [
        { name: 'zotero-tts-positions.json', lastModified: null },
        { name: 'notes.txt', lastModified: null },
        { name: BACKUP_FILENAME, lastModified: null },
      ],
    });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.deps.select).toBeUndefined();
  });

  it('says plainly when the folder holds no settings file', async () => {
    const t = setup({ files: [{ name: 'zotero-tts-positions.json', lastModified: null }] });
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.client.download).not.toHaveBeenCalled();
    expect(t.message()).toBe(`No settings backup on ${FOLDER} yet.`);
  });

  // The same commit point the file restore ends in (issue #21)
  it('checks the providers the downloaded settings turn on, and appends what it found', async () => {
    const t = setup({ verify: async () => 'Turned off local: the settings restored for it do not work here.' });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(
      `Restored ${count} settings from ${FOLDER}${BACKUP_FILENAME}. Turned off local: the settings restored for it do not work here.`,
    );
  });

  it('keeps the restore when the check itself throws', async () => {
    const t = setup({
      prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' },
      verify: async () => {
        throw new Error('no network');
      },
    });
    t.client.download.mockResolvedValueOnce(file);
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.message()).toContain('Restored');
    expect(t.message()).toContain('no network');
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

  it('reports a folder that does not exist yet', async () => {
    const t = setup();
    t.client.list.mockRejectedValueOnce(new WebDAVError('not-found', 'The folder x does not exist. It is created on the first upload.', 404));
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Restore failed: The folder x does not exist. It is created on the first upload.');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a backup, leaving the settings alone', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    t.client.download.mockResolvedValueOnce('garbage');
    await t.el(WEBDAV_IDS.download).fire('command');
    expect(t.message()).toBe('Restore failed: The file is not JSON');
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

describe('This computer', () => {
  it('shows the stored id when the pane loads', () => {
    const t = setup();
    expect(t.deps.machineId.get).toHaveBeenCalled();
    expect(t.el(WEBDAV_IDS.machineId).value).toBe('this-mac');
  });

  it('a rename stores the sanitized name, shows it back, and prods the auto-upload', async () => {
    const t = setup();
    const field = t.el(WEBDAV_IDS.machineId);
    field.value = '  study desk  ';
    await field.fire('change');
    expect(t.deps.machineId.set).toHaveBeenCalledWith('  study desk  ');
    expect(field.value).toBe('study desk'); // whatever set() stored comes back to the field
    expect(t.message()).toContain(machineSettingsFilename('study desk'));
    expect(t.deps.onMachineRenamed).toHaveBeenCalledOnce();
  });
});

describe('settingsFileLabel', () => {
  it('names the machine, or the pre-1.11 shared file', () => {
    expect(settingsFileLabel({ name: machineSettingsFilename('laptop'), lastModified: 'Tue, 01 Sep 2026 09:00:00 GMT' })).toBe(
      'laptop — Tue, 01 Sep 2026 09:00:00 GMT',
    );
    expect(settingsFileLabel({ name: BACKUP_FILENAME, lastModified: null })).toBe('shared file (before 1.11) — date unknown');
  });
});

describe('initWebDAVRows', () => {
  it('tolerates a pane that lacks the rows', () => {
    const doc = { getElementById: () => null };
    expect(() =>
      initWebDAVRows(doc, { prefs: fakePrefs(), createClient: () => ({}) as WebDAVClient, machineId: { get: () => 'x', set: (r) => r } }),
    ).not.toThrow();
  });
});
