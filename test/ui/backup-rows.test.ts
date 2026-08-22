import { describe, expect, it, vi } from 'vitest';
import { PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { BACKUP_FILENAME, BACKUP_FORMAT, createBackup, parseBackup, serializeBackup } from '../../src/core/settings-backup';
import { initBackupRows, type BackupRowsDeps } from '../../src/ui/backup-rows';

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

const IDS = ['ztts-backup', 'ztts-restore', 'ztts-backup-message'];

function setup(options: { prefs?: Record<string, unknown>; file?: string | null; savePath?: string | null; confirm?: boolean } = {}) {
  const els = new Map(IDS.map((id) => [id, new FakeElement()]));
  const doc = { getElementById: (id: string) => els.get(id) ?? null };
  const prefs = fakePrefs(options.prefs);
  const written: Array<{ path: string; text: string }> = [];
  const deps = {
    prefs,
    pluginVersion: '0.1.0',
    now: () => '2026-08-22T10:00:00.000Z',
    pickSavePath: vi.fn(async () => (options.savePath === undefined ? 'C:\\backups\\tts.json' : options.savePath)),
    pickOpenPath: vi.fn(async () => (options.file === null ? null : 'C:\\backups\\tts.json')),
    writeFile: vi.fn(async (path: string, text: string) => {
      written.push({ path, text });
    }),
    readFile: vi.fn(async () => options.file ?? ''),
    confirm: vi.fn(() => options.confirm ?? true),
    onRestored: vi.fn(),
  } satisfies BackupRowsDeps;
  initBackupRows(doc, deps);
  return {
    prefs,
    deps,
    written,
    el: (id: string) => els.get(id)!,
    message: () => els.get('ztts-backup-message')!.attrs.get('value'),
  };
}

describe('Backup settings', () => {
  it('writes every setting to the chosen file and says where it went', async () => {
    const t = setup({ prefs: { [PREF_PREFIX + 'azure.apiKey']: 'secret', [PREF_PREFIX + 'prefetch']: 7 } });
    await t.el('ztts-backup').fire('command');
    expect(t.deps.pickSavePath).toHaveBeenCalledWith(BACKUP_FILENAME);
    expect(t.written).toHaveLength(1);
    expect(t.written[0].path).toBe('C:\\backups\\tts.json');
    const backup = JSON.parse(t.written[0].text);
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, pluginVersion: '0.1.0', exportedAt: '2026-08-22T10:00:00.000Z' });
    expect(backup.settings['azure.apiKey']).toBe('secret');
    expect(backup.settings.prefetch).toBe(7);
    expect(t.message()).toContain('C:\\backups\\tts.json');
    expect(t.message()).toMatch(/API keys/);
  });

  it('does nothing when the dialog is cancelled', async () => {
    const t = setup({ savePath: null });
    t.el('ztts-backup-message').setAttribute('value', 'old');
    await t.el('ztts-backup').fire('command');
    expect(t.written).toHaveLength(0);
    expect(t.message()).toBe('');
  });

  it('reports a file that could not be written', async () => {
    const t = setup();
    t.deps.writeFile.mockRejectedValueOnce(new Error('disk full'));
    await t.el('ztts-backup').fire('command');
    expect(t.message()).toBe('Backup failed: disk full');
  });
});

describe('Restore settings', () => {
  const file = serializeBackup(
    createBackup(fakePrefs({ [PREF_PREFIX + 'azure.region']: 'westeurope', [PREF_PREFIX + 'shortcuts.speedUp']: 'Ctrl+K' })),
  );

  it('asks first, then applies the file and redraws the unbound rows', async () => {
    const t = setup({ file, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    await t.el('ztts-restore').fire('command');
    expect(t.deps.confirm).toHaveBeenCalledWith(expect.stringContaining('C:\\backups\\tts.json'));
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('westeurope');
    expect(t.prefs.store[PREF_PREFIX + 'shortcuts.speedUp']).toBe('Ctrl+K');
    expect(t.deps.onRestored).toHaveBeenCalledOnce();
    const count = Object.keys(parseBackup(file).settings).length;
    expect(t.message()).toBe(`Restored ${count} settings from C:\\backups\\tts.json.`);
  });

  it('changes nothing when the user declines or cancels', async () => {
    const declined = setup({ file, confirm: false, prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    await declined.el('ztts-restore').fire('command');
    expect(declined.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(declined.deps.onRestored).not.toHaveBeenCalled();

    const cancelled = setup({ file: null });
    await cancelled.el('ztts-restore').fire('command');
    expect(cancelled.deps.readFile).not.toHaveBeenCalled();
    expect(cancelled.deps.confirm).not.toHaveBeenCalled();
  });

  it('refuses a file that is not a backup, leaving the settings alone', async () => {
    const t = setup({ file: 'garbage', prefs: { [PREF_PREFIX + 'azure.region']: 'eastasia' } });
    await t.el('ztts-restore').fire('command');
    expect(t.message()).toBe('Restore failed: The file is not JSON');
    expect(t.prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastasia');
    expect(t.deps.confirm).not.toHaveBeenCalled();
  });

  it('names the entries it had to skip', async () => {
    const partial = JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { 'azure.region': 'eastus', 'future.setting': 1 } });
    const t = setup({ file: partial });
    await t.el('ztts-restore').fire('command');
    expect(t.message()).toBe('Restored 1 settings from C:\\backups\\tts.json. Skipped 1: future.setting.');
  });

  it('reports a file that could not be read', async () => {
    const t = setup({ file });
    t.deps.readFile.mockRejectedValueOnce(new Error('no such file'));
    await t.el('ztts-restore').fire('command');
    expect(t.message()).toBe('Restore failed: no such file');
  });
});

describe('initBackupRows', () => {
  it('tolerates a pane that lacks the rows', () => {
    const doc = { getElementById: () => null };
    expect(() =>
      initBackupRows(doc, {
        prefs: fakePrefs(),
        pickSavePath: async () => null,
        pickOpenPath: async () => null,
        writeFile: async () => {},
        readFile: async () => '',
      }),
    ).not.toThrow();
  });
});
