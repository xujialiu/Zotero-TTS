import { describe, expect, it } from 'vitest';
import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import {
  applyBackup,
  BACKUP_FORMAT,
  BackupError,
  createBackup,
  flattenSettings,
  parseBackup,
  serializeBackup,
} from '../../src/core/settings-backup';

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

const everyKey = Object.keys(flattenSettings(DEFAULTS)).sort();

describe('createBackup', () => {
  it('includes every setting, API keys and all, under its pref name', () => {
    const prefs = fakePrefs({ [PREF_PREFIX + 'openai.apiKey']: 'sk-test', [PREF_PREFIX + 'shortcuts.speedUp']: 'Ctrl+K' });
    const backup = createBackup(prefs, { pluginVersion: '0.1.0', exportedAt: '2026-08-22T00:00:00Z' });
    expect(backup).toMatchObject({ format: BACKUP_FORMAT, version: 1, pluginVersion: '0.1.0', exportedAt: '2026-08-22T00:00:00Z' });
    expect(Object.keys(backup.settings).sort()).toEqual(everyKey);
    expect(backup.settings['openai.apiKey']).toBe('sk-test');
    expect(backup.settings['shortcuts.speedUp']).toBe('Ctrl+K');
    expect(backup.settings['readAloud.sameForAllDocuments']).toBe(true);
  });
});

describe('parseBackup / applyBackup', () => {
  it('round-trips through the file text', () => {
    const source = fakePrefs({
      [PREF_PREFIX + 'azure.region']: 'westeurope',
      [PREF_PREFIX + 'local.enabled']: true,
      [PREF_PREFIX + 'prefetch']: 5,
      [PREF_PREFIX + 'readAloud.sameForAllDocuments']: false,
    });
    const text = serializeBackup(createBackup(source));
    expect(text.endsWith('\n')).toBe(true);
    const parsed = parseBackup(text);
    expect(parsed.ignored).toEqual([]);
    const target = fakePrefs();
    expect(applyBackup(target, parsed)).toBe(everyKey.length);
    expect(loadSettings(target)).toEqual(loadSettings(source));
  });

  it('rejects text that is not a backup', () => {
    expect(() => parseBackup('nope')).toThrow(BackupError);
    expect(() => parseBackup('nope')).toThrow(/not JSON/);
    expect(() => parseBackup('{}')).toThrow(/not a Zotero TTS settings backup/);
    expect(() => parseBackup('null')).toThrow(BackupError);
    expect(() => parseBackup(JSON.stringify({ format: 'other', settings: {} }))).toThrow(BackupError);
  });

  it('skips unknown keys and values of the wrong kind, and reads plain spellings of the right kind', () => {
    const parsed = parseBackup(
      JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        settings: {
          'openai.enabled': 'true',
          prefetch: '4',
          'azure.region': 7,
          'openai.model': ['x'],
          cacheAudio: 'yes',
          speed: 1.5, // a setting of versions before 1.1.3
          'future.setting': 1,
        },
      }),
    );
    expect(parsed.settings).toEqual({ 'openai.enabled': true, prefetch: 4, 'azure.region': '7' });
    expect(parsed.ignored).toEqual(['openai.model', 'cacheAudio', 'speed', 'future.setting']);
  });

  it('leaves settings the file does not mention as they are', () => {
    const prefs = fakePrefs({ [PREF_PREFIX + 'openai.apiKey']: 'keep' });
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, settings: { 'azure.region': 'eastus' } }));
    expect(applyBackup(prefs, parsed)).toBe(1);
    expect(prefs.store[PREF_PREFIX + 'openai.apiKey']).toBe('keep');
    expect(prefs.store[PREF_PREFIX + 'azure.region']).toBe('eastus');
  });

  it('carries the file metadata along when it is there', () => {
    const parsed = parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, pluginVersion: '0.1.0', exportedAt: 'x', settings: {} }));
    expect(parsed).toMatchObject({ pluginVersion: '0.1.0', exportedAt: 'x' });
    expect(parseBackup(JSON.stringify({ format: BACKUP_FORMAT, version: 1, pluginVersion: 3, settings: {} })).pluginVersion).toBeUndefined();
  });
});
