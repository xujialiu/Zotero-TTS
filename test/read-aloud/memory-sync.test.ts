import { describe, expect, it, vi } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import { READ_ALOUD_VOICES_PREF, type VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { createReadAloudMemorySync, READ_ALOUD_VOICES_OBSERVER, type ReadAloudMemoryDeps } from '../../src/read-aloud/memory-sync';
import { READ_ALOUD_MEMORY_PREF, type ReadAloudMemory } from '../../src/read-aloud/read-aloud-memory';

const ISABELLA = 'openai::bf_v0isabella';
const AOEDE = 'local::af_aoede';
const PREF_BRANCH = 'extensions.zotero.';

const voices: VoicesMap = {
  en: { region: 'US', voice: AOEDE, speed: 1.4, tierVoices: { local: AOEDE } },
  [MULTILINGUAL]: { region: null, voice: ISABELLA, speed: 1.4, tierVoices: { local: ISABELLA } },
};

/** Zotero.Prefs in miniature: observers fire synchronously from set(), as Gecko's do, and not for an unchanged value. */
function fakeZotero(initialVoices: VoicesMap | null = voices, memory?: ReadAloudMemory) {
  const store: Record<string, unknown> = {};
  if (initialVoices) store[READ_ALOUD_VOICES_PREF] = JSON.stringify(initialVoices);
  if (memory) store[READ_ALOUD_MEMORY_PREF] = JSON.stringify(memory);
  const observers = new Map<symbol, { name: string; handler: () => void }>();
  const prefs: PrefsBackend = {
    get: (k) => store[k],
    set: (k, v) => {
      if (store[k] === v) return;
      store[k] = v;
      for (const { name, handler } of [...observers.values()]) if (PREF_BRANCH + name === k) handler();
    },
  };
  const readers: unknown[] = [];
  const enabled = vi.fn<() => boolean>(() => true);
  const registerObserver = vi.fn<ReadAloudMemoryDeps['registerObserver']>((name, handler) => {
    const token = Symbol(name);
    observers.set(token, { name, handler });
    return token;
  });
  const unregisterObserver = vi.fn<ReadAloudMemoryDeps['unregisterObserver']>((token) => {
    observers.delete(token as symbol);
  });
  const error = vi.fn<(e: unknown) => void>();
  const deps = { prefs, enabled, registerObserver, unregisterObserver, readers: () => readers, error } satisfies ReadAloudMemoryDeps;
  return {
    store,
    deps,
    observers,
    readers,
    voices: () => JSON.parse(store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap,
    storedMemory: () => JSON.parse(store[READ_ALOUD_MEMORY_PREF] as string) as ReadAloudMemory,
    /** What ReaderInstance._setReadAloudVoice does: replace one language's entry. */
    zoteroWrites(lang: string, entry: Record<string, unknown>) {
      const current = store[READ_ALOUD_VOICES_PREF] ? (JSON.parse(store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap) : {};
      prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...current, [lang]: entry }));
    },
  };
}

/** The internal reader and its manager, logging the order in which things happen. */
function fakeReader(lang: string | null, store: Record<string, unknown>) {
  const log: string[] = [];
  const manager = {
    lang,
    setLanguage: vi.fn((l: string) => {
      manager.lang = l;
      log.push(`setLanguage:${l}`);
    }),
  };
  const original = vi.fn(function (this: any) {
    const current = store[READ_ALOUD_VOICES_PREF] ? (JSON.parse(store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap) : {};
    const l = this._readAloudManager.lang;
    log.push(`zotero-sync:${l}:${current[l]?.speed ?? 'none'}`);
    return 'original-result';
  });
  const internal = { _readAloudManager: manager, _syncPersistedVoicesToManager: original as (...args: unknown[]) => unknown };
  return { reader: { _internalReader: internal }, internal, manager, original, log };
}

const multilingual: ReadAloudMemory = { speed: 1.4, voice: { id: ISABELLA, lang: MULTILINGUAL } };
const english: ReadAloudMemory = { speed: 1.4, voice: { id: AOEDE, lang: 'en' } };

describe('createReadAloudMemorySync', () => {
  it('observes the pref Zotero writes and starts from what it already stores', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    expect(z.deps.registerObserver).toHaveBeenCalledWith(READ_ALOUD_VOICES_OBSERVER, expect.any(Function));
    expect(sync.memory()).toEqual(multilingual);
    expect(z.storedMemory()).toEqual(multilingual);
  });

  it('prefers what it remembered over a guess from the pref', () => {
    const z = fakeZotero(voices, english);
    expect(createReadAloudMemorySync(z.deps).memory()).toEqual(english);
  });

  it('patches a reader once and leaves readers without the internals alone', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z.store);
    expect(sync.attach(r.reader)).toBe(true);
    const patched = r.internal._syncPersistedVoicesToManager;
    expect(patched).not.toBe(r.original);
    expect(sync.attach(r.reader)).toBe(true);
    expect(r.internal._syncPersistedVoicesToManager).toBe(patched);
    expect(sync.attach(null)).toBe(false);
    expect(sync.attach({})).toBe(false);
    expect(sync.attach({ _internalReader: {} })).toBe(false);
  });

  it('installs the wrapper through exportFunction, so the reader compartment may call it', () => {
    const z = fakeZotero();
    const r = fakeReader('zh', z.store);
    const exportFunction = vi.fn((fn: (...args: unknown[]) => unknown, target: object) => {
      expect(target).toBe(r.internal);
      return (...args: unknown[]) => fn(...args);
    });
    const sync = createReadAloudMemorySync({ ...z.deps, exportFunction });
    sync.attach(r.reader);
    expect(exportFunction).toHaveBeenCalledOnce();
    expect(r.internal._syncPersistedVoicesToManager).toBe(exportFunction.mock.results[0].value);
    expect(r.internal._syncPersistedVoicesToManager()).toBe('original-result');
    expect(r.log).toEqual(['setLanguage:mul', 'zotero-sync:mul:1.4']);
  });

  // The original is the reader compartment's function; its own apply/call
  // run there and may not touch objects from the plugin sandbox, such as the
  // wrapper's argument array.
  it('invokes the original without handing it sandbox objects', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z.store);
    const denied = () => {
      throw new Error('Permission denied to access property "length"');
    };
    Object.defineProperty(r.original, 'apply', { value: denied });
    Object.defineProperty(r.original, 'call', { value: denied });
    sync.attach(r.reader);
    expect(r.internal._syncPersistedVoicesToManager('extra')).toBe('original-result');
    expect(r.original).toHaveBeenCalledWith('extra');
    expect(r.original.mock.contexts[0]).toBe(r.internal);
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('moves the manager to Multiple languages before Zotero restores, so Zotero picks the remembered voice', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z.store);
    sync.attach(r.reader);
    expect(r.internal._syncPersistedVoicesToManager.call(r.internal)).toBe('original-result');
    expect(r.log).toEqual(['setLanguage:mul', 'zotero-sync:mul:1.4']);
    expect(r.original.mock.contexts[0]).toBe(r.internal);
    // Already on mul (a later popup open): nothing left to do
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['setLanguage:mul', 'zotero-sync:mul:1.4', 'zotero-sync:mul:1.4']);
    expect(r.manager.setLanguage).toHaveBeenCalledTimes(1);
  });

  it('writes the remembered speed into the entry Zotero is about to read', () => {
    const z = fakeZotero({ ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], speed: 1 } }, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['setLanguage:mul', 'zotero-sync:mul:1.4']);
    expect(z.voices()[MULTILINGUAL].speed).toBe(1.4);
  });

  it('keeps a single-language voice to its language and starts a new language at the remembered speed', () => {
    const z = fakeZotero(voices, english);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('fr', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:fr:1.4']);
    expect(z.voices().fr).toEqual({ speed: 1.4 });
    expect(z.voices().en).toEqual(voices.en);
  });

  it('waits while the manager has no language yet', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader(null, z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:null:none']);
    expect(z.voices()).toEqual(voices);
  });

  it('is a pass-through while the setting is off', () => {
    const z = fakeZotero();
    z.deps.enabled.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:zh:none']);
    expect(z.voices()).toEqual(voices);
  });

  it('learns from what Zotero persists afterwards', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    // The slider
    z.zoteroWrites('en', { ...voices.en, speed: 1.7 });
    expect(sync.memory()).toEqual({ ...multilingual, speed: 1.7 });
    expect(z.storedMemory().speed).toBe(1.7);
    // A voice picked for English: from now on the choice is per language again
    z.zoteroWrites('en', { ...voices.en, voice: 'azure::en-US-AvaNeural', speed: 1.7 });
    expect(sync.memory()).toEqual({ speed: 1.7, voice: { id: 'azure::en-US-AvaNeural', lang: 'en' } });
    const r = fakeReader('zh', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:zh:1.7']);
  });

  it('does not mistake its own writes for a choice', () => {
    const drifted = { ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], voice: 'openai::alloy', speed: 1 } };
    const z = fakeZotero(drifted, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ISABELLA, speed: 1.4 });
    expect(sync.memory()).toEqual(multilingual);
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('reports a reader that misbehaves and still lets Zotero run', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z.store);
    r.manager.setLanguage.mockImplementation(() => {
      throw new Error('gone');
    });
    sync.attach(r.reader);
    expect(r.internal._syncPersistedVoicesToManager.call(r.internal)).toBe('original-result');
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
  });

  it('dispose stops observing and restores the readers it patched', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z.store);
    z.readers.push(r.reader);
    sync.attach(r.reader);
    sync.dispose();
    expect(z.deps.unregisterObserver).toHaveBeenCalledWith(z.deps.registerObserver.mock.results[0].value);
    expect(r.internal._syncPersistedVoicesToManager).toBe(r.original);
    z.zoteroWrites('en', { ...voices.en, speed: 2 });
    expect(sync.memory()).toEqual(multilingual);
  });
});
