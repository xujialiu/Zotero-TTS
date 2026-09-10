import { describe, expect, it } from 'vitest';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend } from '../../src/core/settings';
import { flattenSettings, SETTINGS_FILE_PATTERN } from '../../src/core/settings-backup';
import {
  editsPlayerList,
  heldSections,
  isLocalAddress,
  mergeSharedSettings,
  parseSharedSettings,
  readSyncState,
  seedStamps,
  serializeSharedSettings,
  SHARED_SETTINGS_FILENAME,
  SHARED_SETTINGS_FORMAT,
  SHARED_SETTINGS_VERSION,
  SharedSettingsError,
  SYNC_STATE_PREF,
  SYNCABLE_KEYS,
  writeSyncState,
  type SharedItem,
  type SyncState,
} from '../../src/core/settings-sync';

const defaults = flattenSettings(DEFAULTS);

function fakePrefs(initial: Record<string, unknown> = {}): PrefsBackend & { store: Record<string, unknown> } {
  const store = { ...initial };
  return { store, get: (k) => store[k], set: (k, v) => void (store[k] = v) };
}

const item = (over: Partial<SharedItem> & Pick<SharedItem, 'key' | 'value'>): SharedItem => ({ ts: 1000, by: 'laptop', ...over });

/** This machine's values: the defaults with a few changed. */
const values = (over: Record<string, string | number | boolean> = {}) => ({ ...defaults, ...over });

describe('isLocalAddress', () => {
  it.each([
    'http://localhost:8880',
    'https://foo.localhost/',
    'http://127.0.0.1:8004',
    'http://127.5.5.5',
    'http://10.0.0.1:8880',
    'http://172.16.0.1',
    'http://172.31.255.255:1',
    'http://192.168.1.10:8880',
    'http://169.254.1.1',
    'http://100.64.0.1',
    'http://100.127.255.255',
    'http://0.0.0.0:8880',
    'http://[::1]:8880',
    'http://[fe80::1]',
    'http://[fd00::1]:8880',
    'http://nas:8880',
    'http://DESKTOP-4F2K9J',
    'http://kokoro.local:8880',
    'http://box.lan',
    'http://router.home',
    'http://host.docker.internal:8880',
    '',
    'not a url',
  ])('%s is local', (url) => {
    expect(isLocalAddress(url)).toBe(true);
  });

  it.each([
    'https://api.openai.com',
    'https://h200-kokoro.xujialiu.top',
    'http://8.8.8.8:80',
    'https://172.32.0.1',
    'https://100.128.0.1',
    'https://192.169.1.1',
    'https://11.0.0.1',
    'https://eastasia.tts.speech.microsoft.com/',
    'http://[2001:db8::1]',
  ])('%s is not', (url) => {
    expect(isLocalAddress(url)).toBe(false);
  });
});

describe('the sync set', () => {
  it('is every setting but the WebDAV connection, its switches and the System voices switch', () => {
    const expected = Object.keys(defaults).filter((k) => !k.startsWith('webdav.') && k !== 'system.enabled');
    expect([...SYNCABLE_KEYS].sort()).toEqual(expected.sort());
    expect(SYNCABLE_KEYS).toContain('openai.apiKey');
    expect(SYNCABLE_KEYS).toContain('local.baseURL');
    expect(SYNCABLE_KEYS).toContain('readAloud.volume');
    expect(SYNCABLE_KEYS).toContain('shortcuts.speedUp');
    expect(SYNCABLE_KEYS).not.toContain('webdav.syncSettings');
    expect(SYNCABLE_KEYS).not.toContain('webdav.password');
    expect(SYNCABLE_KEYS).not.toContain('system.enabled');
  });

  it('holds a provider section whose address is local, by that address alone', () => {
    expect(heldSections(values())).toEqual(new Set(['local']));
    expect(heldSections(values({ 'local.baseURL': 'https://h200-kokoro.example.org' }))).toEqual(new Set());
    expect(heldSections(values({ 'openai.baseURL': 'http://localhost:8004', 'local.baseURL': 'https://k.example.org' }))).toEqual(new Set(['openai']));
    // A partial set (the file's) without the address: not held from that side
    expect(heldSections({ 'openai.apiKey': 'sk' })).toEqual(new Set());
  });

  it('knows which settings edit the player’s list', () => {
    for (const key of ['openai.enabled', 'local.voice', 'azure.apiKey', 'readAloud.favoritesOnly', 'readAloud.favoriteVoices']) {
      expect(editsPlayerList(key), key).toBe(true);
    }
    for (const key of ['shortcuts.speedUp', 'readAloud.volume', 'highlight.wordColor', 'prefetch', 'readAloud.sentenceDelayMs']) {
      expect(editsPlayerList(key), key).toBe(false);
    }
  });

  it('names a file the restore picker never lists', () => {
    expect(SETTINGS_FILE_PATTERN.test(SHARED_SETTINGS_FILENAME)).toBe(false);
  });
});

describe('the shared file', () => {
  it('serializes canonically: sorted by key, fields in one order', () => {
    const text = serializeSharedSettings([item({ key: 'readAloud.volume', value: 120, ts: 5, by: 'b' }), item({ key: 'azure.apiKey', value: 'k', ts: 3, by: 'a' })]);
    expect(JSON.parse(text)).toEqual({
      format: SHARED_SETTINGS_FORMAT,
      version: SHARED_SETTINGS_VERSION,
      items: [
        { key: 'azure.apiKey', value: 'k', ts: 3, by: 'a' },
        { key: 'readAloud.volume', value: 120, ts: 5, by: 'b' },
      ],
    });
    expect(text.indexOf('"azure.apiKey"')).toBeLessThan(text.indexOf('"readAloud.volume"'));
    expect(parseSharedSettings(text)).toEqual([
      { key: 'azure.apiKey', value: 'k', ts: 3, by: 'a' },
      { key: 'readAloud.volume', value: 120, ts: 5, by: 'b' },
    ]);
  });

  it('drops malformed items and defaults a missing writer', () => {
    const text = JSON.stringify({
      format: SHARED_SETTINGS_FORMAT,
      version: 1,
      items: [
        { key: 'prefetch', value: 3, ts: 1 },
        { value: 'no key', ts: 1, by: 'x' },
        { key: 'shortcuts.speedUp', value: { nested: true }, ts: 1, by: 'x' },
        { key: 'readAloud.volume', value: 100, ts: 'soon', by: 'x' },
        { key: 'readAloud.volume', value: 100, ts: Infinity, by: 'x' },
        'not an item',
      ],
    });
    expect(parseSharedSettings(text)).toEqual([{ key: 'prefetch', value: 3, ts: 1, by: '' }]);
  });

  it('rejects what is not this file, and leaves a newer build’s alone', () => {
    const malformed = (text: string) => {
      try {
        parseSharedSettings(text);
      } catch (e) {
        return e instanceof SharedSettingsError ? e.kind : 'other';
      }
      return 'parsed';
    };
    expect(malformed('{')).toBe('malformed');
    expect(malformed('[]')).toBe('malformed');
    expect(malformed(JSON.stringify({ format: 'zotero-tts-settings', version: 1, settings: {} }))).toBe('malformed');
    expect(malformed(JSON.stringify({ format: SHARED_SETTINGS_FORMAT, version: 1 }))).toBe('malformed');
    expect(malformed(JSON.stringify({ format: SHARED_SETTINGS_FORMAT, version: 2, items: [] }))).toBe('newer');
  });
});

describe('the sync state', () => {
  it('reads an empty state where nothing was written or the pref is garbage', () => {
    expect(readSyncState(fakePrefs())).toEqual({ stamps: {}, held: {}, seeded: false });
    expect(readSyncState(fakePrefs({ [SYNC_STATE_PREF]: '{' }))).toEqual({ stamps: {}, held: {}, seeded: false });
    expect(readSyncState(fakePrefs({ [SYNC_STATE_PREF]: '[]' }))).toEqual({ stamps: {}, held: {}, seeded: false });
  });

  it('round-trips, in an undeclared pref outside the backup set', () => {
    const prefs = fakePrefs();
    const state: SyncState = { stamps: { 'readAloud.volume': 5, 'azure.apiKey': 7 }, held: { azure: { ts: 9, reason: 'Connection failed: 401' } }, seeded: true };
    writeSyncState(prefs, state);
    expect(SYNC_STATE_PREF).toBe(PREF_PREFIX + 'webdav.syncState');
    expect(defaults).not.toHaveProperty('webdav.syncState');
    expect(typeof prefs.store[SYNC_STATE_PREF]).toBe('string');
    expect(readSyncState(prefs)).toEqual(state);
  });

  it('sanitizes what it reads', () => {
    const prefs = fakePrefs({
      [SYNC_STATE_PREF]: JSON.stringify({
        stamps: { 'readAloud.volume': 5, bad: -1, worse: 'x', 'shortcuts.speedUp': Infinity },
        held: { azure: { ts: 1, reason: 'r' }, nope: { ts: 1, reason: 'r' }, openai: { ts: 'x' } },
        seeded: 'yes',
      }),
    });
    expect(readSyncState(prefs)).toEqual({ stamps: { 'readAloud.volume': 5 }, held: { azure: { ts: 1, reason: 'r' } }, seeded: true });
  });
});

describe('seedStamps', () => {
  it('stamps what differs from its default and has no stamp yet, and nothing else', () => {
    const mine = values({ 'azure.apiKey': 'k', 'readAloud.volume': 130, 'shortcuts.speedUp': 'Ctrl+K', 'webdav.url': 'https://dav.example.org/' });
    const stamps = seedStamps(mine, { 'readAloud.volume': 42 }, 1000);
    expect(stamps).toEqual({ 'azure.apiKey': 1000, 'readAloud.volume': 42, 'shortcuts.speedUp': 1000 });
  });
});

describe('mergeSharedSettings', () => {
  const machine = 'desktop';

  it('has nothing to say with no stamps and no file', () => {
    const plan = mergeSharedSettings({ values: values({ 'azure.apiKey': 'k' }), stamps: {}, machine }, []);
    expect(plan).toMatchObject({ adopt: [], restamp: {}, items: [], changed: false, pushed: [], skipped: [] });
  });

  it('pushes a stamped setting into an empty file', () => {
    const plan = mergeSharedSettings({ values: values({ 'azure.apiKey': 'k' }), stamps: { 'azure.apiKey': 50 }, machine }, []);
    expect(plan.items).toEqual([{ key: 'azure.apiKey', value: 'k', ts: 50, by: machine }]);
    expect(plan.pushed).toEqual(['azure.apiKey']);
    expect(plan.changed).toBe(true);
    expect(plan.adopt).toEqual([]);
  });

  it('adopts a newer item with a different value and leaves the file as it is', () => {
    const remote = [item({ key: 'readAloud.volume', value: 130, ts: 200 })];
    const plan = mergeSharedSettings({ values: values(), stamps: { 'readAloud.volume': 100 }, machine }, remote);
    expect(plan.adopt).toEqual(remote);
    expect(plan.items).toEqual(remote);
    expect(plan.changed).toBe(false);
    expect(plan.pushed).toEqual([]);
  });

  it('takes only the stamp when a newer item holds the value this machine already has', () => {
    const remote = [item({ key: 'readAloud.volume', value: 130, ts: 200 })];
    const plan = mergeSharedSettings({ values: values({ 'readAloud.volume': 130 }), stamps: {}, machine }, remote);
    expect(plan.adopt).toEqual([]);
    expect(plan.restamp).toEqual({ 'readAloud.volume': 200 });
    expect(plan.changed).toBe(false);
  });

  it('replaces an older item with this machine’s newer value', () => {
    const remote = [item({ key: 'readAloud.volume', value: 130, ts: 200 }), item({ key: 'azure.apiKey', value: 'old', ts: 10 })];
    const plan = mergeSharedSettings({ values: values({ 'readAloud.volume': 90, 'azure.apiKey': 'new' }), stamps: { 'readAloud.volume': 300, 'azure.apiKey': 5 }, machine }, remote);
    expect(plan.items).toEqual([
      { key: 'azure.apiKey', value: 'old', ts: 10, by: 'laptop' },
      { key: 'readAloud.volume', value: 90, ts: 300, by: machine },
    ]);
    expect(plan.pushed).toEqual(['readAloud.volume']);
    expect(plan.adopt).toEqual([item({ key: 'azure.apiKey', value: 'old', ts: 10 })]);
    expect(plan.changed).toBe(true);
  });

  it('does nothing either way at equal stamps, values equal or not', () => {
    const remote = [item({ key: 'azure.enabled', value: true, ts: 200 })];
    const plan = mergeSharedSettings({ values: values({ 'azure.enabled': false }), stamps: { 'azure.enabled': 200 }, machine }, remote);
    expect(plan.adopt).toEqual([]);
    expect(plan.restamp).toEqual({});
    expect(plan.items).toEqual(remote);
    expect(plan.changed).toBe(false);
  });

  it('keeps a section at a local address on this machine: neither up nor down', () => {
    const remote = [item({ key: 'local.baseURL', value: 'https://kokoro.example.org', ts: 500 }), item({ key: 'local.voice', value: 'af_sky', ts: 500 }), item({ key: 'local.enabled', value: true, ts: 500 })];
    const mine = values({ 'local.baseURL': 'http://localhost:8880', 'local.voice': 'af_bella', 'local.enabled': true });
    const plan = mergeSharedSettings({ values: mine, stamps: { 'local.voice': 900, 'local.enabled': 900 }, machine }, remote);
    expect(plan.adopt).toEqual([]);
    expect(plan.pushed).toEqual([]);
    expect(plan.items).toEqual(remote.sort((a, b) => (a.key < b.key ? -1 : 1)));
    expect(plan.changed).toBe(false);
    expect(plan.skipped.sort()).toEqual(['local.baseURL', 'local.enabled', 'local.voice']);
  });

  it('never applies a section the file itself puts at a local address, and heals it when this machine’s is newer', () => {
    const remote = [item({ key: 'openai.baseURL', value: 'http://localhost:8004', ts: 500 }), item({ key: 'openai.model', value: 'tts-1', ts: 500 })];
    const publicMine = values({ 'openai.baseURL': 'https://api.openai.com', 'openai.model': 'gpt-4o-mini-tts' });
    const older = mergeSharedSettings({ values: publicMine, stamps: {}, machine }, remote);
    expect(older.adopt).toEqual([]);
    expect(older.skipped.sort()).toEqual(['openai.baseURL', 'openai.model']);
    expect(older.changed).toBe(false);
    const newer = mergeSharedSettings({ values: publicMine, stamps: { 'openai.baseURL': 600, 'openai.model': 600 }, machine }, remote);
    expect(newer.items).toEqual([
      { key: 'openai.baseURL', value: 'https://api.openai.com', ts: 600, by: machine },
      { key: 'openai.model', value: 'gpt-4o-mini-tts', ts: 600, by: machine },
    ]);
  });

  it('passes through what it does not sync — the connection, the System switch, a newer build’s key — untouched and unapplied', () => {
    const remote = [
      item({ key: 'webdav.password', value: 'leak', ts: 999 }),
      item({ key: 'system.enabled', value: true, ts: 999 }),
      item({ key: 'future.setting', value: 'x', ts: 999 }),
      item({ key: 'prefetch', value: 5, ts: 999 }),
    ];
    const plan = mergeSharedSettings({ values: values(), stamps: { prefetch: 1 }, machine }, remote);
    expect(plan.adopt).toEqual([item({ key: 'prefetch', value: 5, ts: 999 })]);
    expect(plan.items).toEqual([...remote].sort((a, b) => (a.key < b.key ? -1 : 1)));
    expect(plan.changed).toBe(false);
  });

  it('skips a value of the wrong kind and reads a coercible one as the setting’s kind', () => {
    const remote = [item({ key: 'prefetch', value: 'abc', ts: 999 }), item({ key: 'cacheAudio', value: 'false', ts: 999 }), item({ key: 'readAloud.volume', value: '150', ts: 999 })];
    const plan = mergeSharedSettings({ values: values(), stamps: {}, machine }, remote);
    expect(plan.skipped).toEqual(['prefetch']);
    expect(plan.adopt).toEqual([item({ key: 'cacheAudio', value: false, ts: 999 }), item({ key: 'readAloud.volume', value: 150, ts: 999 })]);
  });

  it('merges the server presets preset by preset, and keeps local-address presets on this machine', () => {
    const mine = JSON.stringify({ chatterbox: { baseURL: 'http://localhost:8004', headers: 'X: 1' }, openai: { apiKey: 'sk-mine' } });
    const theirs = JSON.stringify({ mimo: { baseURL: 'https://api.xiaomimimo.com', apiKey: 'mimo-key' }, openai: { apiKey: 'sk-theirs' } });
    const remote = [item({ key: 'openai.presetValues', value: theirs, ts: 500 })];
    const down = mergeSharedSettings({ values: values({ 'openai.presetValues': mine }), stamps: {}, machine }, remote);
    expect(down.adopt).toHaveLength(1);
    expect(JSON.parse(String(down.adopt[0].value))).toEqual({
      openai: { apiKey: 'sk-theirs' },
      chatterbox: { baseURL: 'http://localhost:8004', headers: 'X: 1' },
      mimo: { baseURL: 'https://api.xiaomimimo.com', apiKey: 'mimo-key' },
    });
    // The same file again with the merged value in place: nothing more to adopt
    const merged = String(down.adopt[0].value);
    const again = mergeSharedSettings({ values: values({ 'openai.presetValues': merged }), stamps: { 'openai.presetValues': 500 }, machine }, remote);
    expect(again.adopt).toEqual([]);
    // Going up, the chatterbox preset at localhost stays here
    const up = mergeSharedSettings({ values: values({ 'openai.presetValues': mine }), stamps: { 'openai.presetValues': 700 }, machine }, []);
    expect(up.items).toHaveLength(1);
    expect(JSON.parse(String(up.items[0].value))).toEqual({ openai: { apiKey: 'sk-mine' } });
  });
});
