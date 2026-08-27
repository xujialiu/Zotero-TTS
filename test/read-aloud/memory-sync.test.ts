import { describe, expect, it, vi } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import { READ_ALOUD_VOICES_PREF, type VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { setDefaultSpeed } from '../../src/read-aloud/default-speed';
import { createReadAloudMemorySync, READ_ALOUD_VOICES_OBSERVER, type ReadAloudMemoryDeps } from '../../src/read-aloud/memory-sync';
import { READ_ALOUD_MEMORY_PREF, writeMemory, type ReadAloudMemory } from '../../src/read-aloud/read-aloud-memory';

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
  const sameVoice = vi.fn<() => boolean>(() => true);
  const globalSpeed = vi.fn<() => boolean>(() => true);
  const registerObserver = vi.fn<ReadAloudMemoryDeps['registerObserver']>((name, handler) => {
    const token = Symbol(name);
    observers.set(token, { name, handler });
    return token;
  });
  const unregisterObserver = vi.fn<ReadAloudMemoryDeps['unregisterObserver']>((token) => {
    observers.delete(token as symbol);
  });
  const error = vi.fn<(e: unknown) => void>();
  const deps = { prefs, sameVoice, globalSpeed, registerObserver, unregisterObserver, readers: () => readers, error } satisfies ReadAloudMemoryDeps;
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
function fakeReader(
  lang: string | null,
  store: Record<string, unknown>,
  state: { speed?: number; active?: boolean; selectedVoiceID?: string | null } = {},
) {
  const log: string[] = [];
  const manager = {
    lang,
    speed: state.speed ?? 1,
    active: state.active ?? false,
    selectedVoiceID: state.selectedVoiceID ?? null,
    setLanguage: vi.fn((l: string) => {
      manager.lang = l;
      log.push(`setLanguage:${l}`);
    }),
    setSpeed: vi.fn((speed: number, persist?: boolean) => {
      manager.speed = speed;
      log.push(`setSpeed:${speed}:${persist}`);
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

  it('is a pass-through while both settings are off', () => {
    const z = fakeZotero();
    z.deps.sameVoice.mockReturnValue(false);
    z.deps.globalSpeed.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:zh:none']);
    expect(z.voices()).toEqual(voices);
  });

  // The two switches are independent: per-language voices at one speed
  // everywhere is a sensible wish, and so is one voice at Zotero's
  // per-language speeds.
  it('applies the voice but leaves the speed to Zotero while global speed is off', () => {
    const z = fakeZotero({ ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], speed: 1 } }, multilingual);
    z.deps.globalSpeed.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['setLanguage:mul', 'zotero-sync:mul:1']);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ISABELLA, speed: 1 });
  });

  it('applies the speed but leaves the voice to Zotero while same-voice is off', () => {
    const z = fakeZotero(voices, multilingual);
    z.deps.sameVoice.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('fr', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:fr:1.4']);
    expect(z.voices().fr).toEqual({ speed: 1.4 });
    expect(r.manager.setLanguage).not.toHaveBeenCalled();
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

  // The voice browser writes the memory pref directly (default-speed.ts), and
  // a fresh install gives Zotero's pref no entry whose change could carry the
  // news: the memory is read from its pref on every use, never from a copy.
  it('applies a memory written from outside — the pane’s slider — without an observer of its own', () => {
    const z = fakeZotero({});
    const sync = createReadAloudMemorySync(z.deps);
    writeMemory(z.deps.prefs, { speed: 1.8, voice: null });
    expect(sync.memory()).toEqual({ speed: 1.8, voice: null });
    const r = fakeReader('en', z.store);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:en:1.8']);
    expect(z.voices()).toEqual({ en: { speed: 1.8 } });
  });

  // English read with a fallback voice Zotero never persisted; the pane's
  // slider makes the playing manager persist it along with the speed. That
  // is the slider persisting a fallback, exactly as the popup's does — the
  // speed is learned, the voice is not, and the remembered voice stays.
  it('keeps the remembered voice when the pane’s slider makes a playing fallback voice persist', () => {
    const z = fakeZotero({ en: { speed: 1.4 }, [MULTILINGUAL]: voices[MULTILINGUAL] }, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const playing = {
      active: true,
      selectedVoiceID: AOEDE,
      // What ReadAloudManager.setSpeed(speed, true) does: _persistCurrentVoice writes the entry with the current voice
      setSpeed: vi.fn((speed: number, persist?: boolean) => {
        if (persist) z.zoteroWrites('en', { region: 'US', voice: AOEDE, speed, tierVoices: { local: AOEDE } });
      }),
    };
    setDefaultSpeed(z.deps.prefs, 1.8, [playing]);
    expect(playing.setSpeed).toHaveBeenCalledWith(1.8, true);
    expect(sync.memory()).toEqual({ ...multilingual, speed: 1.8 });
    expect(z.storedMemory()).toEqual({ ...multilingual, speed: 1.8 });
    expect(z.voices().en).toMatchObject({ voice: AOEDE, speed: 1.8 });
    expect(z.voices()[MULTILINGUAL].speed).toBe(1.8);
    expect(z.deps.error).not.toHaveBeenCalled();
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

describe('the speed is global while the setting is on', () => {
  // Tab 1's popup slider (or a shortcut there) persisted a new speed. Tab 2
  // is paused with a voice, tab 3 idle: both follow at once — Zotero
  // persisting for the active one, as its own slider would, and never
  // through the idle one, whose persistence path would activate it — and
  // Zotero's entry for every language says the same.
  it('spreads a speed Zotero just learned to every other open reader and to every language', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader('en', z.store, { speed: 2.2, active: true, selectedVoiceID: AOEDE });
    const tab2 = fakeReader(MULTILINGUAL, z.store, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    const tab3 = fakeReader('zh', z.store, { speed: 1.4, active: false, selectedVoiceID: 'x' });
    z.readers.push(tab1.reader, tab2.reader, tab3.reader);
    z.zoteroWrites('en', { ...voices.en, speed: 2.2 });
    expect(sync.memory().speed).toBe(2.2);
    expect(tab1.manager.setSpeed).not.toHaveBeenCalled();
    expect(tab2.manager.setSpeed).toHaveBeenCalledWith(2.2, true);
    expect(tab3.manager.setSpeed).toHaveBeenCalledWith(2.2, false);
    expect(z.voices()[MULTILINGUAL].speed).toBe(2.2);
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('leaves the other readers to Zotero while global speed is off, but still learns', () => {
    const z = fakeZotero();
    z.deps.globalSpeed.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z.store, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    z.readers.push(tab2.reader);
    z.zoteroWrites('en', { ...voices.en, speed: 2.2 });
    expect(sync.memory().speed).toBe(2.2);
    expect(tab2.manager.setSpeed).not.toHaveBeenCalled();
    expect(z.voices()[MULTILINGUAL].speed).toBe(1.4);
  });

  // A reader persisting inside the spread writes Zotero's pref again, and
  // this very observer runs inside that write: nothing to learn from our
  // own doing (the fallback voice persisted then is not a choice) — and the
  // snapshot must move on all the same, or the next real voice pick would
  // be read against a stale one and dropped as "moved with the speed".
  it('is not confused by its own spread, and still learns the voice picked next', () => {
    const xiaoxiao = 'azure::zh-CN-XiaoxiaoNeural';
    const yunxi = 'azure::zh-CN-YunxiNeural';
    const z = fakeZotero({ en: voices.en, zh: { speed: 1.4 }, [MULTILINGUAL]: voices[MULTILINGUAL] }, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader('zh', z.store, { speed: 1.4, active: true, selectedVoiceID: xiaoxiao });
    // What ReadAloudManager.setSpeed(speed, true) does: _persistCurrentVoice writes the entry with the current voice
    tab2.manager.setSpeed.mockImplementation((speed: number, persist?: boolean) => {
      tab2.manager.speed = speed;
      if (persist) z.zoteroWrites('zh', { region: 'CN', voice: xiaoxiao, speed, tierVoices: { local: xiaoxiao } });
    });
    z.readers.push(tab2.reader);
    z.zoteroWrites('en', { ...voices.en, speed: 2.2 });
    expect(z.voices().zh).toMatchObject({ voice: xiaoxiao, speed: 2.2 });
    expect(sync.memory()).toEqual({ ...multilingual, speed: 2.2 });
    // The user now picks a voice for Chinese in the popup: a voice moving alone
    z.zoteroWrites('zh', { region: 'CN', voice: yunxi, speed: 2.2, tierVoices: { local: yunxi } });
    expect(sync.memory()).toEqual({ speed: 2.2, voice: { id: yunxi, lang: 'zh' } });
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('reports a reader that throws and reaches the rest', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const broken = fakeReader(MULTILINGUAL, z.store, { speed: 1, active: true, selectedVoiceID: ISABELLA });
    broken.manager.setSpeed.mockImplementation(() => {
      throw new Error('gone');
    });
    const fine = fakeReader('zh', z.store, { speed: 1, active: false, selectedVoiceID: null });
    z.readers.push(broken.reader, { _internalReader: null }, fine.reader);
    z.zoteroWrites('en', { ...voices.en, speed: 2.2 });
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
    expect(fine.manager.setSpeed).toHaveBeenCalledWith(2.2, false);
    expect(sync.memory().speed).toBe(2.2);
  });

  it('is not triggered by the pane’s slider, which already reached every reader itself', () => {
    const z = fakeZotero();
    createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z.store, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    z.readers.push(tab2.reader);
    setDefaultSpeed(z.deps.prefs, 2.2, [tab2.manager]);
    expect(tab2.manager.setSpeed).toHaveBeenCalledTimes(1);
  });

  it('spreads nothing once disposed', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z.store, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    z.readers.push(tab2.reader);
    sync.dispose();
    z.zoteroWrites('en', { ...voices.en, speed: 2 });
    expect(tab2.manager.setSpeed).not.toHaveBeenCalled();
    expect(sync.memory()).toEqual(multilingual);
  });
});
