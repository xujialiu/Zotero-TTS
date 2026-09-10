import { describe, expect, it } from 'vitest';
import type { ProviderId } from '../../src/core/providers/types';
import { DEFAULTS } from '../../src/core/settings';
import { flattenSettings, type SettingValue } from '../../src/core/settings-backup';
import {
  parseSharedSettings,
  serializeSharedSettings,
  SHARED_SETTINGS_FILENAME,
  SHARED_SETTINGS_FORMAT,
  SYNCABLE_KEYS,
  type SharedItem,
  type SyncState,
} from '../../src/core/settings-sync';
import {
  createSettingsSyncTransport,
  SETTINGS_SYNC_DEBOUNCE_MS,
  SETTINGS_SYNC_RETRY_MS,
  type SettingsSyncApplied,
  type SettingsSyncDeps,
} from '../../src/core/settings-sync-transport';
import { WebDAVError } from '../../src/core/webdav';

const defaults = flattenSettings(DEFAULTS);
const item = (over: Partial<SharedItem> & Pick<SharedItem, 'key' | 'value'>): SharedItem => ({ ts: 500, by: 'laptop', ...over });
const file = (...items: SharedItem[]) => serializeSharedSettings(items);

/** Lets the sync's chain of awaits run out: two macrotask turns cover a download, the checks and an upload. */
const settle = async () => {
  await new Promise<void>((r) => setTimeout(r, 0));
  await new Promise<void>((r) => setTimeout(r, 0));
};

function harness(opts: { values?: Record<string, SettingValue>; state?: SyncState; remote?: string | Error | null; over?: Partial<SettingsSyncDeps> } = {}) {
  let clock = 1_000_000;
  const timers: { fn: () => void; at: number; handle: number }[] = [];
  let nextHandle = 1;
  const errors: unknown[] = [];
  const observers = new Map<string, () => void>();
  const unregistered: unknown[] = [];
  let enabled = true;
  let remote: string | Error | null = opts.remote ?? null;
  const uploads: { name: string; text: string }[] = [];
  const downloads: string[] = [];
  const store: Record<string, SettingValue> = { ...defaults, ...opts.values };
  const writes: { key: string; value: SettingValue }[] = [];
  let state: SyncState = opts.state ?? { stamps: {}, held: {}, seeded: false };
  let readingTabs: string[] = [];
  const checks: ProviderId[] = [];
  const checkOutcomes: Partial<Record<ProviderId, { ok: boolean; message: string } | Error>> = {};
  const applied: SettingsSyncApplied[] = [];
  const synced: (SettingsSyncApplied | null)[] = [];
  /** Keys the fake pref refuses to write. */
  const refused = new Set<string>();

  const deps: SettingsSyncDeps = {
    enabled: () => enabled,
    client: () => ({
      download: async (name) => {
        downloads.push(name);
        if (remote instanceof Error) throw remote;
        if (remote === null) throw new WebDAVError('not-found', 'no file yet', 404);
        return remote;
      },
      upload: async (name, text) => {
        uploads.push({ name, text });
        remote = text;
      },
    }),
    values: () => ({ ...store }),
    machine: () => 'desktop',
    readState: () => JSON.parse(JSON.stringify(state)) as SyncState,
    writeState: (s) => {
      state = JSON.parse(JSON.stringify(s)) as SyncState;
    },
    // A write lands in the store and fires the key's observer synchronously, as Zotero.Prefs.set does
    write: (key, value) => {
      if (refused.has(key)) throw new Error(`refused ${key}`);
      writes.push({ key, value });
      store[key] = value;
      observers.get('zotero-tts.' + key)?.();
    },
    readingTabs: () => readingTabs,
    checkProvider: async (id) => {
      checks.push(id);
      const outcome = checkOutcomes[id];
      if (outcome instanceof Error) throw outcome;
      return outcome ?? { ok: true, message: 'Connected.' };
    },
    onSynced: (report) => {
      synced.push(report);
      if (report) applied.push(report);
    },
    keys: SYNCABLE_KEYS.map((key) => ({ key, observer: 'zotero-tts.' + key })),
    registerObserver: (name, handler) => {
      observers.set(name, handler);
      return name;
    },
    unregisterObserver: (token) => void unregistered.push(token),
    setTimeout: (fn, ms) => {
      const handle = nextHandle++;
      timers.push({ fn, at: clock + ms, handle });
      return handle;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.handle === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    now: () => clock,
    error: (e) => void errors.push(e),
    debug: () => {},
    ...opts.over,
  };
  const transport = createSettingsSyncTransport(deps);
  transport.start();

  /** The user changes a setting: the store moves and the pref observer fires. */
  const userSets = (key: string, value: SettingValue) => {
    store[key] = value;
    observers.get('zotero-tts.' + key)?.();
  };
  /** Moves the clock, firing due timers in order and letting each one's work settle. */
  const advance = async (ms: number) => {
    const until = clock + ms;
    for (;;) {
      const due = timers.filter((t) => t.at <= until).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = due.at;
      timers.splice(timers.indexOf(due), 1);
      due.fn();
      await settle();
    }
    clock = until;
  };
  const remoteItems = () => (typeof remote === 'string' ? parseSharedSettings(remote) : []);

  return {
    transport,
    deps,
    store,
    writes,
    uploads,
    downloads,
    errors,
    checks,
    checkOutcomes,
    applied,
    synced,
    timers,
    unregistered,
    refused,
    userSets,
    advance,
    remoteItems,
    now: () => clock,
    state: () => state,
    setRemote: (text: string | Error | null) => {
      remote = text;
    },
    setEnabled: (on: boolean) => {
      enabled = on;
    },
    setReading: (titles: string[]) => {
      readingTabs = titles;
    },
  };
}

describe('createSettingsSyncTransport', () => {
  it('does nothing over the network while the switch is off, but still stamps a change', async () => {
    const h = harness({ over: { enabled: () => false } });
    h.transport.poke('startup');
    await settle();
    expect(h.downloads).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ syncs: 1, lastOutcome: 'skipped', lastTrigger: 'startup', watching: SYNCABLE_KEYS.length });
    h.userSets('readAloud.volume', 130);
    expect(h.state().stamps['readAloud.volume']).toBe(h.now());
    expect(h.timers).toEqual([]);
    expect(h.transport.stats().pendingChange).toBe(false);
  });

  it('seeds the stamps on the first sync and uploads only what differs from its default', async () => {
    const h = harness({ values: { 'azure.apiKey': 'az-key', 'readAloud.volume': 130 } });
    h.transport.poke('switch-on');
    await settle();
    expect(h.downloads).toEqual([SHARED_SETTINGS_FILENAME]);
    expect(h.state().seeded).toBe(true);
    expect(h.state().stamps).toEqual({ 'azure.apiKey': h.now(), 'readAloud.volume': h.now() });
    expect(h.uploads).toHaveLength(1);
    expect(h.uploads[0].name).toBe(SHARED_SETTINGS_FILENAME);
    expect(h.remoteItems()).toEqual([
      { key: 'azure.apiKey', value: 'az-key', ts: h.now(), by: 'desktop' },
      { key: 'readAloud.volume', value: 130, ts: h.now(), by: 'desktop' },
    ]);
    expect(h.writes).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteItems: 0, adopted: 0, pushed: 2, uploaded: true });
  });

  it('a fresh install joins and receives, and the adoption is neither stamped as its own nor re-uploaded', async () => {
    const h = harness({ remote: file(item({ key: 'azure.apiKey', value: 'az-key', ts: 500 }), item({ key: 'shortcuts.speedUp', value: 'Ctrl+K', ts: 600, by: 'office' })) });
    h.transport.poke('startup');
    await settle();
    expect(h.writes).toEqual([
      { key: 'azure.apiKey', value: 'az-key' },
      { key: 'shortcuts.speedUp', value: 'Ctrl+K' },
    ]);
    expect(h.store['azure.apiKey']).toBe('az-key');
    // The observer fired inside each write, and stamped nothing of its own
    expect(h.state().stamps).toEqual({ 'azure.apiKey': 500, 'shortcuts.speedUp': 600 });
    expect(h.uploads).toEqual([]);
    expect(h.timers).toEqual([]);
    expect(h.applied).toHaveLength(1);
    expect(h.applied[0]).toMatchObject({ applied: ['azure.apiKey', 'shortcuts.speedUp'], from: ['laptop', 'office'], held: {}, deferred: 0 });
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', remoteItems: 2, adopted: 2, pushed: 0, uploaded: false });
  });

  it('pushes a change of this machine’s after the quiet period, a burst as one sync', async () => {
    const h = harness({ state: { stamps: {}, held: {}, seeded: true } });
    h.userSets('readAloud.volume', 110);
    const first = h.now();
    expect(h.transport.stats().pendingChange).toBe(true);
    await h.advance(4_000);
    h.userSets('readAloud.volume', 120);
    h.userSets('highlight.wordColor', '#ff0000');
    const last = h.now();
    await h.advance(SETTINGS_SYNC_DEBOUNCE_MS - 1);
    expect(h.downloads).toEqual([]);
    await h.advance(1);
    expect(h.downloads).toEqual([SHARED_SETTINGS_FILENAME]);
    expect(h.uploads).toHaveLength(1);
    expect(h.remoteItems()).toEqual([
      { key: 'highlight.wordColor', value: '#ff0000', ts: last, by: 'desktop' },
      { key: 'readAloud.volume', value: 120, ts: last, by: 'desktop' },
    ]);
    expect(last).toBeGreaterThan(first);
    expect(h.transport.stats()).toMatchObject({ pendingChange: false, lastTrigger: 'change', pushed: 2, uploaded: true });
  });

  it('defers the settings that edit the player’s list while a tab reads, and applies them on the next poke after', async () => {
    const h = harness({
      state: { stamps: {}, held: {}, seeded: true },
      remote: file(item({ key: 'azure.apiKey', value: 'az-key' }), item({ key: 'readAloud.favoritesOnly', value: true }), item({ key: 'readAloud.volume', value: 130 })),
    });
    h.setReading(['Paper.pdf']);
    h.transport.poke('reader-open');
    await settle();
    expect(h.writes).toEqual([{ key: 'readAloud.volume', value: 130 }]);
    expect(h.checks).toEqual([]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'deferred', adopted: 1, deferred: 2 });
    expect(h.applied[0]).toMatchObject({ applied: ['readAloud.volume'], deferred: 2 });
    h.setReading([]);
    h.transport.poke('reader-close');
    await settle();
    expect(h.writes.slice(1)).toEqual([
      { key: 'azure.apiKey', value: 'az-key' },
      { key: 'readAloud.favoritesOnly', value: true },
    ]);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', adopted: 2, deferred: 0 });
    expect(h.uploads).toEqual([]);
  });

  it('checks a provider whose section changed, and one that fails goes off here alone', async () => {
    const remote = [item({ key: 'azure.apiKey', value: 'bad-key', ts: 700 }), item({ key: 'azure.enabled', value: true, ts: 300 })];
    const h = harness({ values: { 'azure.enabled': true, 'azure.apiKey': 'old-key' }, state: { stamps: { 'azure.enabled': 300, 'azure.apiKey': 100 }, held: {}, seeded: true }, remote: file(...remote) });
    h.checkOutcomes.azure = { ok: false, message: 'Connection failed: 401' };
    h.transport.poke('startup');
    await settle();
    expect(h.checks).toEqual(['azure']);
    expect(h.writes).toEqual([
      { key: 'azure.apiKey', value: 'bad-key' },
      { key: 'azure.enabled', value: false },
    ]);
    expect(h.store['azure.enabled']).toBe(false);
    // The flip sits at the file's stamp: never pushed, never re-applied
    expect(h.state().stamps).toEqual({ 'azure.enabled': 300, 'azure.apiKey': 700 });
    expect(h.state().held.azure).toEqual({ ts: h.now(), reason: 'Connection failed: 401' });
    expect(h.uploads).toEqual([]);
    expect(h.applied[0]).toMatchObject({ applied: ['azure.apiKey', 'azure.enabled'], held: { azure: 'Connection failed: 401' } });
    expect(h.transport.stats().held).toEqual({ azure: 'Connection failed: 401' });
    // The same file again: nothing to adopt, nothing checked, the file untouched
    h.transport.poke('reader-open');
    await settle();
    expect(h.checks).toEqual(['azure']);
    expect(h.writes).toHaveLength(2);
    expect(h.uploads).toEqual([]);
    // The key is fixed on the other machine: adopted, the held provider tried again, and it stays on
    h.setRemote(file(item({ key: 'azure.apiKey', value: 'good-key', ts: 900 }), item({ key: 'azure.enabled', value: true, ts: 300 })));
    h.checkOutcomes.azure = { ok: true, message: 'Connected.' };
    h.transport.poke('reader-open');
    await settle();
    expect(h.writes.slice(2)).toEqual([
      { key: 'azure.apiKey', value: 'good-key' },
      { key: 'azure.enabled', value: true },
    ]);
    expect(h.checks).toEqual(['azure', 'azure']);
    expect(h.store['azure.enabled']).toBe(true);
    expect(h.state().held).toEqual({});
    expect(h.uploads).toEqual([]);
  });

  it('a switch the file has no item for is flipped without an opinion, so it is never pushed', async () => {
    const h = harness({ values: { 'openai.apiKey': 'old' }, state: { stamps: { 'openai.apiKey': 100 }, held: {}, seeded: true }, remote: file(item({ key: 'openai.apiKey', value: 'bad', ts: 700 })) });
    h.checkOutcomes.openai = new Error('boom');
    h.transport.poke('startup');
    await settle();
    expect(h.store['openai.enabled']).toBe(false);
    expect(h.state().stamps).toEqual({ 'openai.apiKey': 700 });
    expect(h.state().held.openai).toMatchObject({ reason: 'boom' });
    h.transport.poke('reader-open');
    await settle();
    expect(h.uploads).toEqual([]);
    expect(h.remoteItems().find((i) => i.key === 'openai.enabled')).toBeUndefined();
  });

  it('a value the pref refuses is left out and unstamped; the rest of the batch still applies', async () => {
    const h = harness({ state: { stamps: {}, held: {}, seeded: true }, remote: file(item({ key: 'prefetch', value: 7 }), item({ key: 'readAloud.volume', value: 130 })) });
    h.refused.add('prefetch');
    h.transport.poke('startup');
    await settle();
    expect(h.writes).toEqual([{ key: 'readAloud.volume', value: 130 }]);
    expect(h.state().stamps).toEqual({ 'readAloud.volume': 500 });
    expect(h.errors).toHaveLength(1);
  });

  it('backs off after a failure, retries once the window passes, and reports once per window', async () => {
    const h = harness({ state: { stamps: {}, held: {}, seeded: true }, remote: new Error('503 from the server') });
    h.transport.poke('startup');
    await settle();
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'error', lastError: 'Error: 503 from the server' });
    expect(h.errors).toHaveLength(1);
    h.transport.poke('reader-open');
    await settle();
    expect(h.transport.stats().lastOutcome).toBe('skipped');
    expect(h.downloads).toHaveLength(1);
    h.setRemote(null);
    await h.advance(SETTINGS_SYNC_RETRY_MS);
    expect(h.downloads).toHaveLength(2);
    expect(h.transport.stats()).toMatchObject({ lastOutcome: 'ok', lastTrigger: 'retry' });
    expect(h.errors).toHaveLength(1);
  });

  it('an unusable configuration is reported and arms no retry', async () => {
    const h = harness({ state: { stamps: {}, held: {}, seeded: true }, over: { client: () => { throw new WebDAVError('config', 'WebDAV URL is not set'); } } });
    h.transport.poke('startup');
    await settle();
    expect(h.transport.stats().lastOutcome).toBe('error');
    expect(h.errors).toHaveLength(1);
    expect(h.timers).toEqual([]);
  });

  it('treats a broken file as absent and heals it; leaves a newer build’s file alone', async () => {
    const broken = harness({ values: { 'readAloud.volume': 130 }, remote: '{ not json' });
    broken.transport.poke('startup');
    await settle();
    expect(broken.errors).toHaveLength(1);
    expect(broken.uploads).toHaveLength(1);
    expect(broken.remoteItems()).toEqual([{ key: 'readAloud.volume', value: 130, ts: broken.now(), by: 'desktop' }]);
    const newer = harness({ values: { 'readAloud.volume': 130 }, remote: JSON.stringify({ format: SHARED_SETTINGS_FORMAT, version: 2, items: [] }) });
    newer.transport.poke('startup');
    await settle();
    expect(newer.uploads).toEqual([]);
    expect(newer.writes).toEqual([]);
    expect(newer.transport.stats().lastOutcome).toBe('error');
    expect(String(newer.errors[0])).toContain('version 2');
  });

  it('a push-only flush uploads this machine’s changes and applies nothing', async () => {
    const h = harness({ values: { 'readAloud.volume': 90 }, state: { stamps: { 'readAloud.volume': 800 }, held: {}, seeded: true }, remote: file(item({ key: 'azure.apiKey', value: 'az-key', ts: 700 })) });
    h.userSets('highlight.wordColor', '#00ff00');
    await h.transport.flush('shutdown', { pushOnly: true });
    expect(h.writes).toEqual([]);
    expect(h.checks).toEqual([]);
    expect(h.uploads).toHaveLength(1);
    expect(h.remoteItems().map((i) => i.key)).toEqual(['azure.apiKey', 'highlight.wordColor', 'readAloud.volume']);
    expect(h.timers).toEqual([]);
    expect(h.transport.stats().pendingChange).toBe(false);
  });

  it('a change waiting for its quiet moment is dropped by stop, and the observers come off', async () => {
    const h = harness({ state: { stamps: {}, held: {}, seeded: true } });
    h.userSets('readAloud.volume', 110);
    expect(h.timers).toHaveLength(1);
    h.transport.stop();
    expect(h.timers).toEqual([]);
    expect(h.unregistered).toHaveLength(SYNCABLE_KEYS.length);
    expect(h.transport.stats()).toMatchObject({ watching: 0, pendingChange: false });
  });
});
