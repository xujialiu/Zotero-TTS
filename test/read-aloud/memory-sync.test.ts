import { describe, expect, it, vi } from 'vitest';
import { MULTILINGUAL } from '../../src/core/providers/types';
import { READ_ALOUD_VOICES_PREF, type VoicesMap } from '../../src/core/read-aloud-speed';
import type { PrefsBackend } from '../../src/core/settings';
import { setDefaultSpeed } from '../../src/read-aloud/default-speed';
import { createReadAloudMemorySync, READ_ALOUD_VOICES_OBSERVER, type ReadAloudMemoryDeps } from '../../src/read-aloud/memory-sync';
import { READ_ALOUD_MEMORY_PREF, writeMemory, type ReadAloudMemory } from '../../src/read-aloud/read-aloud-memory';
import { decodeVoiceId } from '../../src/read-aloud/voice-catalog';

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
  const debug = vi.fn<(message: string) => void>();
  // What Zotero's per-reader pref observer does: copy the pref into the reader's state
  const refreshVoices = vi.fn<(reader: unknown) => void>((reader: any) => reader?._handleReadAloudVoicesPrefChange?.());
  const deps = {
    prefs,
    sameVoice,
    globalSpeed,
    registerObserver,
    unregisterObserver,
    readers: () => readers,
    error,
    debug,
    refreshVoices,
  } satisfies ReadAloudMemoryDeps;
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

/** One voice of a manager's list, as Zotero's RemoteReadAloudVoice exposes it. */
type FakeVoice = { id: string; language: string; tier: string; label: string };

/**
 * A voice of the list from an id alone: the language the id says (`mul`
 * for OpenAI's and Azure's multilingual voices, the locale prefix of the
 * other Azure ids, en-US for the local engines'; a Zotero id ends in its
 * locale), the plugin's tier for the plugin's ids and Standard for Zotero's.
 */
function describeVoice(voice: string | (Partial<FakeVoice> & { id: string })): FakeVoice {
  const v = typeof voice === 'string' ? { id: voice } : voice;
  const decoded = decodeVoiceId(v.id);
  const language =
    v.language ??
    (!decoded
      ? (/-([a-z]{2}-[A-Z]{2})$/.exec(v.id)?.[1] ?? 'en-US')
      : decoded.provider === 'openai' || /multilingual/i.test(decoded.voiceId)
        ? MULTILINGUAL
        : decoded.provider === 'azure'
          ? decoded.voiceId.split('-').slice(0, 2).join('-')
          : 'en-US');
  return { id: v.id, language, tier: v.tier ?? (decoded ? 'local' : 'standard'), label: v.label ?? v.id };
}

const baseOf = (lang: string | null): string | null => (lang ? lang.replace(/-.+$/, '') : lang);

/**
 * The internal reader and its manager, logging the order in which things
 * happen. Like Zotero's, the reader keeps its own copy of the pref
 * (`_state.readAloudVoices`), refreshed by a pref observer of its own —
 * registered when the reader opens, i.e. after the sync's, so inside one
 * write it runs after memory-sync's — and Zotero's restore reads that copy.
 *
 * The manager keeps Zotero's private fields (`_lang`, `_region`,
 * `_voiceID`, `_selectedTier`, `_persistedVoices`) behind the public
 * getters, and writes to `_lang` are logged, so a lane move shows in the
 * log ahead of the restore that follows it. Its restore and its
 * `setLanguage` resolve the way Zotero's `_resolveVoice` does in
 * miniature: the list filtered to the selected tier, the language reset
 * when that tier has no voice for it (issue #36), the current voice kept
 * while it is listed for the language, else the entry's tier voice, the
 * entry's voice, or the first voice for the language in any tier — a
 * Standard one included (issue #35).
 */
function fakeReader(
  lang: string | null,
  z: ReturnType<typeof fakeZotero>,
  state: {
    speed?: number;
    active?: boolean;
    selectedVoiceID?: string | null;
    selectedTier?: string | null;
    region?: string | null;
    voices?: Array<string | (Partial<FakeVoice> & { id: string })>;
    tierVoice?: string;
    persisted?: Record<string, unknown>;
  } = {},
) {
  const log: string[] = [];
  const parse = () => (z.store[READ_ALOUD_VOICES_PREF] ? (JSON.parse(z.store[READ_ALOUD_VOICES_PREF] as string) as VoicesMap) : {});
  // Methods on a prototype, as Zotero's ReadAloudManager has them, so the
  // pick hooks find where to patch; fields own, as Zotero's class fields are
  const proto: any = {};
  const manager: any = Object.create(proto);
  let currentLang: string | null = lang;
  Object.defineProperty(manager, '_lang', {
    configurable: true,
    get: () => currentLang,
    set: (value: string | null) => {
      currentLang = value;
      log.push(`lang:${value}`);
    },
  });
  Object.assign(manager, {
    _region: state.region ?? null,
    _voiceID: state.selectedVoiceID ?? null,
    _selectedTier: state.selectedTier ?? null,
    _persistedVoices: state.persisted ?? {},
    speed: state.speed ?? 1,
    active: state.active ?? false,
    /** What the popup listed at its last open. */
    allVoices: (state.voices ?? [ISABELLA, AOEDE]).map(describeVoice),
  });
  Object.defineProperties(manager, {
    // A test's own poke at `lang` is the user's dropdown, not a move of the sync's: unlogged
    lang: { get: () => manager._lang, set: (value: string | null) => void (currentLang = value) },
    region: { get: () => manager._region },
    selectedVoiceID: { get: () => manager._voiceID, set: (value: string | null) => void (manager._voiceID = value) },
    selectedTier: { get: () => manager._selectedTier },
  });
  const tierOf = (id: string | null): string | null => manager.allVoices.find((v: FakeVoice) => v.id === id)?.tier ?? null;
  /** ReadAloudManager._resolveVoice in miniature (see above). */
  const resolve = () => {
    // No language yet: nothing to resolve, as Zotero's returns at once
    if (!manager._lang) return;
    const tierVoices: FakeVoice[] = manager._selectedTier === null ? manager.allVoices : manager.allVoices.filter((v: FakeVoice) => v.tier === manager._selectedTier);
    const languages = [...new Set(tierVoices.map((v) => baseOf(v.language)))];
    // The reset (issue #36): a language the selected tier has no voice for is replaced by the first it has
    if (languages.length && !languages.includes(baseOf(manager._lang))) {
      currentLang = languages[0];
      manager._region = null;
      manager._voiceID = null;
    }
    const forLang = tierVoices.filter((v) => baseOf(v.language) === baseOf(manager._lang));
    if (manager._voiceID && forLang.some((v) => v.id === manager._voiceID)) {
      manager._selectedTier = tierOf(manager._voiceID);
      return;
    }
    if (!forLang.length) {
      manager._voiceID = null;
      return;
    }
    const persisted = (manager._persistedVoices ?? {}) as { voice?: unknown; tierVoices?: Record<string, unknown> };
    const tiers = Object.keys(persisted.tierVoices ?? {});
    const target: string | null = manager._selectedTier ?? tiers[tiers.length - 1] ?? null;
    let pool = target ? forLang.filter((v) => v.tier === target) : forLang;
    if (!pool.length) pool = forLang;
    const available = (id: unknown): id is string => typeof id === 'string' && pool.some((v) => v.id === id);
    const tierVoice = target ? persisted.tierVoices?.[target] : undefined;
    const pick = available(tierVoice) ? tierVoice : available(persisted.voice) ? persisted.voice : pool[0].id;
    manager._voiceID = pick;
    manager._selectedTier = tierOf(pick);
  };
  /** What ReadAloudManager._persistCurrentVoice does: the entry for the manager's language, through Zotero's pref. */
  const persist = () => {
    if (!manager._voiceID) return;
    z.zoteroWrites(manager.lang, {
      region: manager.region,
      voice: manager._voiceID,
      speed: manager.speed,
      tierVoices: { [tierOf(manager._voiceID) ?? 'local']: manager._voiceID },
    });
  };
  proto.setLanguage = vi.fn((l: string, options?: { region?: string | null; persist?: boolean }) => {
    currentLang = baseOf(l);
    // Called without a region: cleared, as ReadAloudManager.setLanguage does
    manager._region = options?.region ?? null;
    manager._voiceID = null;
    log.push(`setLanguage:${l}`);
    if (options?.persist) {
      // The popup's dropdown persists whatever voice the new language resolves to: the fake takes the entry's, else the first listed
      manager._voiceID = parse()[l]?.voice ?? manager.allVoices[0]?.id ?? null;
      persist();
    } else if (manager.allVoices.length) {
      // Zotero's own call resolves under the tier still selected (issue #36)
      resolve();
    }
  });
  proto.selectVoice = vi.fn((id: string) => {
    manager._voiceID = id;
    log.push(`selectVoice:${id}`);
    persist();
  });
  proto.selectTier = vi.fn((tier: string) => {
    log.push(`selectTier:${tier}`);
    manager._voiceID = state.tierVoice ?? manager._voiceID;
    persist();
  });
  proto.setSpeed = vi.fn((speed: number, persistSpeed?: boolean) => {
    manager.speed = speed;
    log.push(`setSpeed:${speed}:${persistSpeed}`);
  });
  /** The spy behind setLanguage, for tests that count its calls: the sync replaces the prototype's property with its hook. */
  const setLanguageSpy = proto.setLanguage;
  /** Zotero's _syncPersistedVoicesToManager: the entry for the manager's language applied (applyPersistedVoices), one resolution. */
  const original = vi.fn(function (this: any) {
    const current = this._state.readAloudVoices as VoicesMap;
    const m = this._readAloudManager;
    const l = m.lang;
    log.push(`zotero-sync:${l}:${current[l]?.speed ?? 'none'}`);
    m._persistedVoices = current[l] ?? {};
    m._voiceID = null;
    m._selectedTier = null;
    resolve();
    return 'original-result';
  });
  const internal = {
    _readAloudManager: manager,
    _state: { readAloudVoices: parse() },
    _syncPersistedVoicesToManager: original as (...args: unknown[]) => unknown,
  };
  const reader = {
    _internalReader: internal,
    _handleReadAloudVoicesPrefChange: () => {
      internal._state.readAloudVoices = parse();
    },
  };
  z.deps.registerObserver(READ_ALOUD_VOICES_OBSERVER, reader._handleReadAloudVoicesPrefChange);
  return { reader, internal, manager, proto, original, log, setLanguageSpy, resolve };
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
    const r = fakeReader('en', z);
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
    const r = fakeReader('zh', z);
    const exportFunction = vi.fn((fn: (...args: unknown[]) => unknown, target: object) => {
      // The pick hooks go onto the manager's prototype, the sync wrapper onto the internal reader
      expect([r.internal, r.proto]).toContain(target);
      return (...args: unknown[]) => fn(...args);
    });
    const sync = createReadAloudMemorySync({ ...z.deps, exportFunction });
    sync.attach(r.reader);
    expect(exportFunction).toHaveBeenCalledTimes(4);
    expect(r.internal._syncPersistedVoicesToManager).toBe(exportFunction.mock.results[3].value);
    expect(r.internal._syncPersistedVoicesToManager()).toBe('original-result');
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4']);
  });

  // The original is the reader compartment's function; its own apply/call
  // run there and may not touch objects from the plugin sandbox, such as the
  // wrapper's argument array.
  it('invokes the original without handing it sandbox objects', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z);
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

  // Caught live on 2026-08-29: enabling the system provider rewrote the
  // system-voice ids in Zotero's pref, the observer read that as a voice
  // pick, and the user's remembered Kokoro default silently became a
  // Windows voice (issue #12, ui/prefs-pane.ts adoptSystemVoices).
  describe('applySilently', () => {
    it('learns nothing from a rewrite of Zotero’s pref that is not a pick', () => {
      const z = fakeZotero(voices, { speed: 1.4, voice: { id: AOEDE, lang: 'en' } });
      const sync = createReadAloudMemorySync(z.deps);
      const migrated = 'system::onecore/MSTTS_V110_zhCN_HuihuiM';
      sync.applySilently(() => {
        z.deps.prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...voices, zh: { voice: migrated, tierVoices: { local: migrated } } }));
      });
      expect(z.voices().zh.voice).toBe(migrated);
      // The remembered default is still the user's own choice
      expect(z.storedMemory().voice).toEqual({ id: AOEDE, lang: 'en' });
      sync.dispose();
    });

    it('goes on learning the next real pick, so the guard is not sticky', () => {
      const z = fakeZotero(voices, { speed: 1.4, voice: { id: AOEDE, lang: 'en' } });
      const sync = createReadAloudMemorySync(z.deps);
      sync.applySilently(() => z.zoteroWrites('zh', { voice: 'system::onecore/X' }));
      expect(z.storedMemory().voice).toEqual({ id: AOEDE, lang: 'en' });
      z.zoteroWrites('zh', { voice: 'system::onecore/Y' });
      expect(z.storedMemory().voice).toEqual({ id: 'system::onecore/Y', lang: 'zh' });
      sync.dispose();
    });
  });

  it('moves the manager to Multiple languages before Zotero restores, so Zotero picks the remembered voice', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z);
    sync.attach(r.reader);
    expect(r.internal._syncPersistedVoicesToManager.call(r.internal)).toBe('original-result');
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4']);
    expect(r.original.mock.contexts[0]).toBe(r.internal);
    // Already on mul (a later popup open): nothing left to do
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4', 'zotero-sync:mul:1.4']);
    expect(r.log.filter((entry) => entry.startsWith('lang:'))).toHaveLength(1);
  });

  it('writes the remembered speed into the entry Zotero is about to read', () => {
    const z = fakeZotero({ ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], speed: 1 } }, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4']);
    expect(z.voices()[MULTILINGUAL].speed).toBe(1.4);
  });

  // One voice everywhere, whatever the document's language (the user's
  // rule): a French document is moved to the English voice's language, and
  // its own language's entry is left alone
  it('moves a document in another language to a single-language voice’s own', () => {
    const z = fakeZotero(voices, english);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('fr', z);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:en', 'zotero-sync:en:1.4']);
    expect(z.voices().fr).toBeUndefined();
    expect(z.voices().en).toEqual(voices.en);
    expect(sync.documentLanguage(r.reader)).toBe('fr');
  });

  it('waits while the manager has no language yet', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader(null, z);
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
    const r = fakeReader('zh', z);
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
    const r = fakeReader('en', z);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1']);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ISABELLA, speed: 1 });
  });

  it('applies the speed but leaves the voice to Zotero while same-voice is off', () => {
    const z = fakeZotero(voices, multilingual);
    z.deps.sameVoice.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('fr', z);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['zotero-sync:fr:1.4']);
    expect(z.voices().fr).toEqual({ speed: 1.4 });
    expect(r.setLanguageSpy).not.toHaveBeenCalled();
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
    const r = fakeReader('zh', z, { voices: [ISABELLA, AOEDE, 'azure::en-US-AvaNeural'] });
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:en', 'zotero-sync:en:1.7']);
  });

  // The voice browser writes the memory pref directly (default-speed.ts), and
  // a fresh install gives Zotero's pref no entry whose change could carry the
  // news: the memory is read from its pref on every use, never from a copy.
  it('applies a memory written from outside — the pane’s slider — without an observer of its own', () => {
    const z = fakeZotero({});
    const sync = createReadAloudMemorySync(z.deps);
    writeMemory(z.deps.prefs, { speed: 1.8, voice: null });
    expect(sync.memory()).toEqual({ speed: 1.8, voice: null });
    const r = fakeReader('en', z);
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
    const r = fakeReader('en', z);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ISABELLA, speed: 1.4 });
    expect(sync.memory()).toEqual(multilingual);
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('reports a reader that misbehaves and still lets Zotero run', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z);
    Object.defineProperty(r.manager, '_lang', {
      get: () => 'zh',
      set: () => {
        throw new Error('gone');
      },
    });
    sync.attach(r.reader);
    expect(r.internal._syncPersistedVoicesToManager.call(r.internal)).toBe('original-result');
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
  });

  it('dispose stops observing and restores the readers it patched', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z);
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
    const tab1 = fakeReader('en', z, { speed: 2.2, active: true, selectedVoiceID: AOEDE });
    const tab2 = fakeReader(MULTILINGUAL, z, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    const tab3 = fakeReader('zh', z, { speed: 1.4, active: false, selectedVoiceID: 'x' });
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
    const tab2 = fakeReader(MULTILINGUAL, z, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
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
    const tab2 = fakeReader('zh', z, { speed: 1.4, active: true, selectedVoiceID: xiaoxiao });
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
    const broken = fakeReader(MULTILINGUAL, z, { speed: 1, active: true, selectedVoiceID: ISABELLA });
    broken.manager.setSpeed.mockImplementation(() => {
      throw new Error('gone');
    });
    const fine = fakeReader('zh', z, { speed: 1, active: false, selectedVoiceID: null });
    z.readers.push(broken.reader, { _internalReader: null }, fine.reader);
    z.zoteroWrites('en', { ...voices.en, speed: 2.2 });
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
    expect(fine.manager.setSpeed).toHaveBeenCalledWith(2.2, false);
    expect(sync.memory().speed).toBe(2.2);
  });

  it('is not triggered by the pane’s slider, which already reached every reader itself', () => {
    const z = fakeZotero();
    createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    z.readers.push(tab2.reader);
    setDefaultSpeed(z.deps.prefs, 2.2, [tab2.manager]);
    expect(tab2.manager.setSpeed).toHaveBeenCalledTimes(1);
  });

  it('spreads nothing once disposed', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { speed: 1.4, active: true, selectedVoiceID: ISABELLA });
    z.readers.push(tab2.reader);
    sync.dispose();
    z.zoteroWrites('en', { ...voices.en, speed: 2 });
    expect(tab2.manager.setSpeed).not.toHaveBeenCalled();
    expect(sync.memory()).toEqual(multilingual);
  });
});

describe('the voice is global while the setting is on', () => {
  const ADA = 'azure::en-US-AdaMultilingualNeural';
  const XIAOXIAO = 'azure::zh-CN-XiaoxiaoNeural';
  const YUNXI = 'azure::zh-CN-YunxiNeural';
  const listed = [ISABELLA, AOEDE, ADA, XIAOXIAO, YUNXI];
  const ada = { region: null, voice: ADA, speed: 1.4, tierVoices: { local: ADA } };
  const xiaoxiao = { region: 'CN', voice: XIAOXIAO, speed: 1.4, tierVoices: { local: XIAOXIAO } };
  const attached = (z: ReturnType<typeof fakeZotero>, sync: ReturnType<typeof createReadAloudMemorySync>, ...tabs: ReturnType<typeof fakeReader>[]) => {
    for (const tab of tabs) {
      z.readers.push(tab.reader);
      sync.attach(tab.reader);
    }
  };

  // Tab 1's popup picked Ada under Multiple languages: Zotero persisted it
  // and the memory learned it. Tab 2 is reading with Isabella, tab 3 is
  // idle. Tab 2 is put through Zotero's own restore — the wrapper's
  // sequence, with the mul entry saying Ada — and goes on with Ada; tab 3
  // gets it when its popup opens; tab 1 is there already and is left alone,
  // since the restore would restart its sentence.
  it('puts a voice Zotero just learned in front of every other reader that is reading', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ADA, voices: listed });
    const tab2 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    const tab3 = fakeReader('zh', z, { active: false, voices: listed });
    attached(z, sync, tab1, tab2, tab3);
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(sync.memory().voice).toEqual({ id: ADA, lang: MULTILINGUAL });
    expect(tab2.log).toEqual(['zotero-sync:mul:1.4']);
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    expect(tab1.original).not.toHaveBeenCalled();
    expect(tab3.original).not.toHaveBeenCalled();
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  // An English document reading with a Kokoro voice under `en`: moved to
  // Multiple languages first, where the catalog publishes Ada, then restored
  it('moves a reader on another language to Multiple languages for a global voice', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader('en', z, { active: true, selectedVoiceID: AOEDE, voices: listed });
    attached(z, sync, tab2);
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(tab2.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4']);
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    expect(sync.documentLanguage(tab2.reader)).toBe('en');
  });

  // Xiaoxiao reads Chinese only, and reaches every reader all the same (one
  // voice everywhere, the user's rule): the Chinese document as it is, the
  // English one and the one the user put on Multiple languages moved to
  // Chinese first, where Zotero offers her
  it('sends a single-language voice to every reader, each moved to its language', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const chinese = fakeReader('zh', z, { active: true, selectedVoiceID: YUNXI, voices: listed });
    const english = fakeReader('en', z, { active: true, selectedVoiceID: AOEDE, voices: listed });
    const byHand = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, chinese, english, byHand);
    z.zoteroWrites('zh', xiaoxiao);
    expect(sync.memory().voice).toEqual({ id: XIAOXIAO, lang: 'zh' });
    expect(chinese.log).toEqual(['zotero-sync:zh:1.4']);
    expect(english.log).toEqual(['lang:zh', 'zotero-sync:zh:1.4']);
    expect(byHand.log).toEqual(['lang:zh', 'zotero-sync:zh:1.4']);
    for (const tab of [chinese, english, byHand]) expect(tab.manager.selectedVoiceID).toBe(XIAOXIAO);
    expect(sync.documentLanguage(english.reader)).toBe('en');
    expect(sync.documentLanguage(byHand.reader)).toBe(MULTILINGUAL);
  });

  // A Chinese document that read with Isabella sits on Multiple languages,
  // where memory-sync moved it; the language it came from is kept, so a
  // Chinese voice picked elsewhere brings it back. Zotero's deactivate()
  // never resets the manager's language: without this the tab would stay
  // on Multiple languages, and Isabella, for as long as it is open.
  it('brings a reader it moved to Multiple languages back for a voice in its document’s language', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const chinese = fakeReader('zh', z, { active: true, voices: listed });
    attached(z, sync, chinese);
    chinese.internal._syncPersistedVoicesToManager.call(chinese.internal);
    expect(chinese.manager.lang).toBe(MULTILINGUAL);
    expect(sync.documentLanguage(chinese.reader)).toBe('zh');
    z.zoteroWrites('zh', xiaoxiao);
    expect(chinese.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4', 'lang:zh', 'zotero-sync:zh:1.4']);
    expect(chinese.manager.selectedVoiceID).toBe(XIAOXIAO);
  });

  // The popup's language dropdown left "Chinese (Taiwan)" on the manager;
  // Zotero's restore would skip the entry's zh-CN voice for it
  // (_findFallbackVoice's regionChanged guard), so the region is cleared first
  it('clears a region the popup’s dropdown left, so Zotero’s restore lands on the voice', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const taiwan = fakeReader('zh', z, { active: true, selectedVoiceID: YUNXI, region: 'TW', voices: listed });
    const china = fakeReader('zh', z, { active: true, selectedVoiceID: YUNXI, region: 'CN', voices: listed });
    attached(z, sync, taiwan, china);
    z.zoteroWrites('zh', xiaoxiao);
    expect(taiwan.log).toEqual(['lang:zh', 'zotero-sync:zh:1.4']);
    expect(taiwan.manager.region).toBeNull();
    expect(china.log).toEqual(['zotero-sync:zh:1.4']);
    expect(china.manager.region).toBe('CN');
  });

  // A manager resolves from the list its popup loaded: a voice it lacks (a
  // provider enabled since; Zotero's own voices while signed out) would
  // resolve to a fallback and move the reader to some other voice
  it('skips a reader whose voice list lacks the voice, and says so', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const stale = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: [ISABELLA] });
    attached(z, sync, stale);
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(stale.original).not.toHaveBeenCalled();
    expect(z.deps.debug).toHaveBeenCalledWith(expect.stringContaining('does not list it'));
  });

  it('leaves the other readers to Zotero while the switch is off, but still learns', () => {
    const z = fakeZotero();
    z.deps.sameVoice.mockReturnValue(false);
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, tab2);
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(sync.memory().voice).toEqual({ id: ADA, lang: MULTILINGUAL });
    expect(tab2.original).not.toHaveBeenCalled();
  });

  // A resync writes Zotero's pref from inside the observer that learned the
  // pick: nothing to learn from our own doing, and the next real pick is
  // still read against the right snapshot
  it('is not confused by its own resyncs, and still learns the voice picked next', () => {
    const z = fakeZotero({ ...voices, [MULTILINGUAL]: { ...voices[MULTILINGUAL], voice: 'openai::alloy' } }, multilingual);
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader('en', z, { active: true, selectedVoiceID: AOEDE, voices: listed });
    attached(z, sync, tab2);
    // Tab 1 picked Ada under English (a multilingual voice is global by its id wherever it is picked)
    z.zoteroWrites('en', { region: 'US', voice: ADA, speed: 1.4, tierVoices: { local: ADA } });
    expect(sync.memory()).toEqual({ speed: 1.4, voice: { id: ADA, lang: 'en' } });
    expect(tab2.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4']);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ADA, tierVoices: { local: ADA } });
    z.zoteroWrites('zh', xiaoxiao);
    expect(sync.memory()).toEqual({ speed: 1.4, voice: { id: XIAOXIAO, lang: 'zh' } });
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('reports a reader that throws and reaches the rest', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const broken = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    broken.original.mockImplementation(() => {
      throw new Error('gone');
    });
    const fine = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, broken, fine);
    z.readers.push({ _internalReader: null });
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
    expect(fine.manager.selectedVoiceID).toBe(ADA);
  });

  // The voice browser's row click writes the memory and Zotero's entry
  // itself (default-voice.ts) and then asks for this; a cleared default
  // spreads nothing
  it('spreads a choice made elsewhere on request, and nothing for none', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, tab2);
    writeMemory(z.deps.prefs, { speed: 1.4, voice: { id: ADA, lang: MULTILINGUAL } });
    sync.spreadVoice({ id: ADA, lang: MULTILINGUAL });
    expect(tab2.log).toEqual(['zotero-sync:mul:1.4']);
    expect(z.voices()[MULTILINGUAL]).toMatchObject({ voice: ADA, tierVoices: { local: ADA } });
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    sync.spreadVoice(null);
    expect(tab2.original).toHaveBeenCalledTimes(1);
  });

  // Zotero's own observer — one per reader, registered when the tab opened,
  // after the plugin's — copies the pref into the reader's state, and
  // Zotero's restore reads that copy. Inside one write memory-sync's
  // observer runs first, so the copy is still the old entry then: the
  // resync refreshes it as Zotero's handler does, before the restore.
  // (Found live: the settings followed a pick, the other tab did not.)
  it('refreshes the reader’s copy of the pref before Zotero’s restore, whose own observer has not run yet', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, tab2);
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(z.deps.refreshVoices).toHaveBeenCalledWith(tab2.reader);
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    // Without the refresh the restore reads the old entry and nothing changes
    const stale = fakeZotero();
    const staleSync = createReadAloudMemorySync({ ...stale.deps, refreshVoices: undefined });
    const tab = fakeReader(MULTILINGUAL, stale, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    stale.readers.push(tab.reader);
    staleSync.attach(tab.reader);
    stale.zoteroWrites(MULTILINGUAL, ada);
    expect(tab.original).toHaveBeenCalledOnce();
    expect(tab.manager.selectedVoiceID).toBe(ISABELLA);
  });

  it('spreads no voice once disposed', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const tab2 = fakeReader(MULTILINGUAL, z, { active: true, selectedVoiceID: ISABELLA, voices: listed });
    attached(z, sync, tab2);
    sync.dispose();
    z.zoteroWrites(MULTILINGUAL, ada);
    expect(tab2.original).not.toHaveBeenCalled();
    expect(sync.memory()).toEqual(multilingual);
  });
});

describe('a pick the pref does not show', () => {
  const ADA = 'azure::en-GB-AdaMultilingualNeural';
  const BRIAN = 'azure::en-US-BrianNeural';
  const listed = [ISABELLA, AOEDE, ADA, BRIAN];
  // Ada is the only voice under Multiple languages, and the mul entry holds
  // her from an earlier session; the popup's last pick was Brian for English
  const before: VoicesMap = {
    en: { region: 'US', voice: BRIAN, speed: 1.6, tierVoices: { local: BRIAN } },
    [MULTILINGUAL]: { region: null, voice: ADA, speed: 1.6, tierVoices: { local: ADA } },
  };
  const brian: ReadAloudMemory = { speed: 1.6, voice: { id: BRIAN, lang: 'en' } };
  const reading = (voice: string, extra: Record<string, unknown> = {}) => ({ speed: 1.6, active: true, selectedVoiceID: voice, voices: listed, ...extra });

  // The popup's language dropdown switched to Multiple languages: Zotero
  // resolves the one voice there and persists the very entry the pref
  // already holds, and Zotero.Prefs.set notifies nobody of an unchanged
  // value. The pick is learned from the manager's own method instead, and
  // spread — found live with a single multilingual favorite.
  it('learns a language switch that re-persists what the entry already holds, from the manager itself', () => {
    const z = fakeZotero(before, brian);
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader('en', z, reading(BRIAN));
    const tab2 = fakeReader('en', z, reading(BRIAN));
    z.readers.push(tab1.reader, tab2.reader);
    sync.attach(tab1.reader);
    sync.attach(tab2.reader);
    tab1.manager.setLanguage(MULTILINGUAL, { region: null, persist: true });
    expect(tab1.manager.selectedVoiceID).toBe(ADA);
    expect(z.voices()).toEqual(before);
    expect(sync.memory().voice).toEqual({ id: ADA, lang: MULTILINGUAL });
    expect(tab2.log).toEqual(['lang:mul', 'zotero-sync:mul:1.6']);
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    expect(tab1.original).not.toHaveBeenCalled();
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('learns a voice picked again after the memory moved on, and a tier switch', () => {
    const z = fakeZotero(before, brian);
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader(MULTILINGUAL, z, reading(ADA));
    const tab2 = fakeReader('en', z, reading(BRIAN, { tierVoice: AOEDE }));
    z.readers.push(tab1.reader, tab2.reader);
    sync.attach(tab1.reader);
    sync.attach(tab2.reader);
    // The same value again: nothing for the pref observer, a pick all the same
    tab1.manager.selectVoice(ADA);
    expect(sync.memory().voice).toEqual({ id: ADA, lang: MULTILINGUAL });
    expect(tab2.manager.selectedVoiceID).toBe(ADA);
    // Tab 2's popup switches its Voice Mode; the voice the tier resolves is a pick too
    tab2.manager.selectTier('local');
    expect(sync.memory().voice).toEqual({ id: AOEDE, lang: MULTILINGUAL });
  });

  it('learns nothing from a setLanguage without persist — Zotero’s own, or this sync’s', () => {
    const z = fakeZotero(before, brian);
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader('en', z, reading(BRIAN));
    sync.attach(tab1.reader);
    tab1.manager.setLanguage('zh');
    expect(sync.memory()).toEqual(brian);
  });

  // The pref did change: the observer learned and spread inside the persist,
  // and the hook then finds the memory there already — one spread, not two
  it('does not spread twice when the pref did change', () => {
    const z = fakeZotero(before, brian);
    const sync = createReadAloudMemorySync(z.deps);
    const tab1 = fakeReader('en', z, reading(BRIAN));
    const tab2 = fakeReader('en', z, reading(BRIAN));
    z.readers.push(tab1.reader, tab2.reader);
    sync.attach(tab1.reader);
    sync.attach(tab2.reader);
    tab1.manager.selectVoice(AOEDE);
    expect(sync.memory().voice).toEqual({ id: AOEDE, lang: 'en' });
    expect(tab2.original).toHaveBeenCalledTimes(1);
    expect(tab2.manager.selectedVoiceID).toBe(AOEDE);
  });

  it('patches the manager’s prototype once, through exportFunction, and restores it on dispose', () => {
    const z = fakeZotero(before, brian);
    const exportFunction = vi.fn((fn: (...args: unknown[]) => unknown, _target: object) => (...args: unknown[]) => fn(...args));
    const sync = createReadAloudMemorySync({ ...z.deps, exportFunction });
    const tab1 = fakeReader('en', z, reading(BRIAN));
    z.readers.push(tab1.reader);
    const originals = { selectVoice: tab1.proto.selectVoice, selectTier: tab1.proto.selectTier, setLanguage: tab1.proto.setLanguage };
    sync.attach(tab1.reader);
    sync.attach(tab1.reader);
    expect(tab1.proto.selectVoice).not.toBe(originals.selectVoice);
    // The sync wrapper and the three pick hooks
    expect(exportFunction).toHaveBeenCalledTimes(4);
    tab1.manager.selectVoice(ADA);
    expect(sync.memory().voice).toEqual({ id: ADA, lang: 'en' });
    sync.dispose();
    expect(tab1.proto.selectVoice).toBe(originals.selectVoice);
    expect(tab1.proto.selectTier).toBe(originals.selectTier);
    expect(tab1.proto.setLanguage).toBe(originals.setLanguage);
  });

  it('reports a hook that throws and still runs the original', () => {
    const z = fakeZotero(before, brian);
    const sync = createReadAloudMemorySync({
      ...z.deps,
      waiveXrays: () => {
        throw new Error('gone');
      },
    });
    const tab1 = fakeReader('en', z, reading(BRIAN));
    sync.attach(tab1.reader);
    tab1.manager.selectVoice(ADA);
    expect(tab1.log).toContain(`selectVoice:${ADA}`);
    expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
  });
});

describe('a reader moved to Multiple languages finds its way back', () => {
  const XIAOXIAO = 'azure::zh-CN-XiaoxiaoNeural';
  const chinese: ReadAloudMemory = { speed: 1.4, voice: { id: XIAOXIAO, lang: 'zh' } };
  /** What these readers list: the Chinese voice included, so a move to Chinese is a move and not a substitution (issue #35). */
  const listed = [ISABELLA, AOEDE, XIAOXIAO];

  // Zotero's deactivate() resets everything but the manager's language, and
  // the manager lives as long as the reader: a Chinese document that read
  // with Isabella stays on Multiple languages for good unless it is brought
  // back — at its next popup open, once the remembered voice is a Chinese
  // one, so that Zotero restores its own entry for Chinese
  it('at the next popup open, once the remembered voice is not global', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('zh', z, { voices: listed });
    sync.attach(r.reader);
    const open = () => r.internal._syncPersistedVoicesToManager.call(r.internal);
    open();
    expect(r.manager.lang).toBe(MULTILINGUAL);
    expect(sync.documentLanguage(r.reader)).toBe('zh');
    writeMemory(z.deps.prefs, chinese);
    open();
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4', 'lang:zh', 'zotero-sync:zh:1.4']);
    expect(sync.documentLanguage(r.reader)).toBe('zh');
  });

  it('once the default is cleared, and once the voice switch is off', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const cleared = fakeReader('zh', z, { voices: listed });
    const switchedOff = fakeReader('en', z, { voices: listed });
    sync.attach(cleared.reader);
    sync.attach(switchedOff.reader);
    cleared.internal._syncPersistedVoicesToManager.call(cleared.internal);
    switchedOff.internal._syncPersistedVoicesToManager.call(switchedOff.internal);
    writeMemory(z.deps.prefs, { speed: 1.4, voice: null });
    cleared.internal._syncPersistedVoicesToManager.call(cleared.internal);
    expect(cleared.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4', 'lang:zh', 'zotero-sync:zh:1.4']);
    writeMemory(z.deps.prefs, multilingual);
    z.deps.sameVoice.mockReturnValue(false);
    switchedOff.internal._syncPersistedVoicesToManager.call(switchedOff.internal);
    expect(switchedOff.log).toEqual(['lang:mul', 'zotero-sync:mul:1.4', 'lang:en', 'zotero-sync:en:1.4']);
  });

  // Where the user put a manager by hand is its "document language" from
  // then on: the voice's language for as long as the voice is remembered,
  // and back there once it is cleared
  it('moves a manager the user put on Multiple languages to the voice’s language, and back when the voice goes', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader(MULTILINGUAL, z, { voices: listed });
    sync.attach(r.reader);
    writeMemory(z.deps.prefs, chinese);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:zh', 'zotero-sync:zh:1.4']);
    expect(sync.documentLanguage(r.reader)).toBe(MULTILINGUAL);
    writeMemory(z.deps.prefs, { speed: 1.4, voice: null });
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:zh', 'zotero-sync:zh:1.4', 'lang:mul', 'zotero-sync:mul:1.4']);
    expect(sync.documentLanguage(r.reader)).toBe(MULTILINGUAL);
  });

  // The dropdown choice the user made after the move is the language to go back to from then on
  it('forgets the language it moved from once the manager is seen elsewhere', () => {
    const z = fakeZotero();
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z, { voices: listed });
    sync.attach(r.reader);
    const open = () => r.internal._syncPersistedVoicesToManager.call(r.internal);
    open();
    r.manager.lang = 'fr';
    writeMemory(z.deps.prefs, chinese);
    open();
    expect(sync.documentLanguage(r.reader)).toBe('fr');
    writeMemory(z.deps.prefs, multilingual);
    open();
    writeMemory(z.deps.prefs, chinese);
    open();
    expect(r.log).toEqual([
      'lang:mul',
      'zotero-sync:mul:1.4',
      'lang:zh',
      'zotero-sync:zh:1.4',
      'lang:mul',
      'zotero-sync:mul:1.4',
      'lang:zh',
      'zotero-sync:zh:1.4',
    ]);
  });

  it('documentLanguage reads null for what is not a reader', () => {
    const sync = createReadAloudMemorySync(fakeZotero().deps);
    expect(sync.documentLanguage(null)).toBeNull();
    expect(sync.documentLanguage({})).toBeNull();
  });
});

// Issue #35: the remembered voice is not in the list this reader received —
// a favorite that is not offered while only favorites are, a provider
// switched off, a server that did not answer. Zotero's own fallback would
// take any voice for the language, here its metered Standard one, and say
// nothing. The plugin puts a Local voice the list does offer in front of
// the restore instead, says so once per open, and leaves the memory alone.
describe('the remembered voice is not in the list', () => {
  const STANDARD: FakeVoice = { id: 'bdd0dcc3-en-US', language: 'en-US', tier: 'standard', label: 'Standard Voice 1' };
  const PUCK = 'local::am_puck';
  const puckVoice: FakeVoice = { id: PUCK, language: 'en-US', tier: 'local', label: 'Kokoro-am_puck' };
  const AVA: FakeVoice = { id: 'azure::en-US-AvaMultilingualNeural', language: MULTILINGUAL, tier: 'local', label: 'Azure-Ava Multilingual' };
  const BRIAN: FakeVoice = { id: 'azure::en-US-BrianMultilingualNeural', language: MULTILINGUAL, tier: 'local', label: 'Azure-Brian Multilingual' };
  const BELLA: FakeVoice = { id: 'local::af_bella', language: 'en-US', tier: 'local', label: 'Kokoro-af_bella' };
  const puck: ReadAloudMemory = { speed: 1.7, voice: { id: PUCK, lang: 'en' } };
  /** Zotero's pref as the profile of issue #35 had it: the English entry names the remembered voice. */
  const prefs: VoicesMap = { en: { region: 'US', voice: PUCK, speed: 1.7, tierVoices: { local: PUCK } } };
  const withDeps = (z: ReturnType<typeof fakeZotero>) => {
    const announce = vi.fn<(reader: unknown, message: string) => void>();
    const favorites = vi.fn<() => readonly string[]>(() => []);
    const cloneForReader = vi.fn<(reader: unknown, value: unknown) => unknown>((_reader, value) => value);
    return { deps: { ...z.deps, announce, favorites, cloneForReader }, announce, favorites, cloneForReader };
  };
  const open = (r: ReturnType<typeof fakeReader>) => r.internal._syncPersistedVoicesToManager.call(r.internal);

  it('starts with the first Local voice the list offers, says so once, and leaves the memory alone', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD, BRIAN, AVA] });
    sync.attach(r.reader);
    open(r);
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.7']);
    expect(r.manager.lang).toBe(MULTILINGUAL);
    expect(r.manager.selectedVoiceID).toBe(AVA.id);
    expect(r.manager.selectedTier).toBe('local');
    expect(z.voices()[MULTILINGUAL]).toEqual({ voice: AVA.id, speed: 1.7, tierVoices: { local: AVA.id } });
    // The English entry and the memory still name the user's own choice
    expect(z.voices().en.voice).toBe(PUCK);
    expect(z.storedMemory()).toEqual(puck);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(t.announce).toHaveBeenCalledWith(r.reader, 'Zotero-TTS: local::am_puck is not offered here. Reading with Azure-Ava Multilingual instead.');
    expect(z.deps.debug).toHaveBeenCalledWith(expect.stringContaining('not offered'));
    expect(sync.substitution(r.reader)).toEqual({ missing: PUCK, instead: AVA.id });
    expect(sync.documentLanguage(r.reader)).toBe('en');
    // The syncs that follow within the same open say nothing more
    open(r);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(z.deps.error).not.toHaveBeenCalled();
  });

  it('prefers a favorite among the Local voices offered, and the document’s language over Multiple languages', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    t.favorites.mockReturnValue([BRIAN.id]);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD, AVA, BELLA, BRIAN] });
    sync.attach(r.reader);
    open(r);
    expect(r.manager.selectedVoiceID).toBe(BRIAN.id);
    // No favorite among them: Bella reads English, the document's language, and the English entry names her for this open
    t.favorites.mockReturnValue([]);
    const r2 = fakeReader('en', z, { voices: [STANDARD, AVA, BELLA] });
    sync.attach(r2.reader);
    open(r2);
    expect(r2.manager.lang).toBe('en');
    expect(r2.manager.selectedVoiceID).toBe(BELLA.id);
    expect(z.voices().en).toEqual({ region: 'US', voice: BELLA.id, speed: 1.7, tierVoices: { local: BELLA.id } });
    expect(z.storedMemory()).toEqual(puck);
  });

  // Only Zotero's own voices offered — every provider off, or a server that
  // did not answer while signed in: nothing free to put in front, so
  // Zotero's choice stands, said out loud with a word about credits
  it('leaves the choice to Zotero when no Local voice is offered, and says so', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD] });
    sync.attach(r.reader);
    open(r);
    expect(r.manager.lang).toBe('en');
    // The fake restore does what Zotero's does: the entry's voice is missing, the Standard one is the fallback
    expect(r.manager.selectedVoiceID).toBe(STANDARD.id);
    expect(z.voices().en.voice).toBe(PUCK);
    expect(z.storedMemory()).toEqual(puck);
    expect(t.announce).toHaveBeenCalledWith(
      r.reader,
      'Zotero-TTS: local::am_puck is not offered here, and no Local voice is. Zotero picks the voice; it may use credits.',
    );
    expect(sync.substitution(r.reader)).toEqual({ missing: PUCK, instead: null });
  });

  it('starts with the remembered voice again once a list offers it, and says nothing', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD, AVA] });
    sync.attach(r.reader);
    sync.opening(r.reader);
    open(r);
    expect(r.manager.selectedVoiceID).toBe(AVA.id);
    // Kokoro answers again: the next open lists the voice
    r.manager.allVoices = [STANDARD, AVA, puckVoice];
    sync.opening(r.reader);
    open(r);
    expect(r.manager.lang).toBe('en');
    expect(r.manager.selectedVoiceID).toBe(PUCK);
    expect(t.announce).toHaveBeenCalledTimes(1);
    expect(sync.substitution(r.reader)).toBeNull();
  });

  it('says it again at the next popup open, not at every sync within one', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD, AVA] });
    sync.attach(r.reader);
    sync.opening(r.reader);
    open(r);
    open(r);
    expect(t.announce).toHaveBeenCalledTimes(1);
    sync.opening(r.reader);
    open(r);
    expect(t.announce).toHaveBeenCalledTimes(2);
    expect(() => sync.opening(null)).not.toThrow();
  });

  it('waits for the list while the manager has none yet, as before', () => {
    const z = fakeZotero(prefs, puck);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [] });
    sync.attach(r.reader);
    open(r);
    expect(r.log).toEqual(['zotero-sync:en:1.7']);
    expect(r.manager._persistedVoices).toEqual(prefs.en);
    expect(t.announce).not.toHaveBeenCalled();
    expect(sync.substitution(r.reader)).toBeNull();
  });

  it('is nothing to it while the voice switch is off', () => {
    const z = fakeZotero(prefs, puck);
    z.deps.sameVoice.mockReturnValue(false);
    const t = withDeps(z);
    const sync = createReadAloudMemorySync(t.deps);
    const r = fakeReader('en', z, { voices: [STANDARD, AVA] });
    sync.attach(r.reader);
    open(r);
    expect(t.announce).not.toHaveBeenCalled();
    expect(sync.substitution(r.reader)).toBeNull();
  });

  // The list a popup receives lands after Zotero's first restore of the open
  // has run (issue #37): `loadVoices` assigns it and resolves at once, with
  // no sync in between. So the plugin's getVoices hands the list over just
  // before returning it, and the manager is staged for that resolution —
  // never restored against the list of the previous open, which is what is
  // still in `allVoices` at that moment.
  describe('reconcile: the list that is about to land', () => {
    // Issue #35's trace: the language known, the list still loading
    it('stages the manager for the resolution Zotero runs once the list lands, without a restore of its own', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader('en', z, { voices: [] });
      sync.attach(r.reader);
      // _prepareReadAloud's own restore, on no list: the entry applied, nothing resolved
      open(r);
      expect(r.manager.selectedVoiceID).toBeNull();
      r.original.mockClear();
      r.log.length = 0;
      sync.reconcile(r.reader, { offered: [STANDARD, BRIAN, AVA], published: [STANDARD, BRIAN, AVA] });
      expect(r.original).not.toHaveBeenCalled();
      expect(r.log).toEqual(['lang:mul', 'setSpeed:1.7:undefined']);
      expect(r.manager._region).toBeNull();
      expect(r.manager._voiceID).toBeNull();
      expect(r.manager._selectedTier).toBeNull();
      expect(r.manager._persistedVoices).toEqual({ voice: AVA.id, speed: 1.7, tierVoices: { local: AVA.id } });
      expect(t.cloneForReader).toHaveBeenCalledWith(r.reader, r.manager._persistedVoices);
      expect(z.deps.debug).toHaveBeenCalledWith(expect.stringContaining('staged'));
      // Zotero's loadVoices: the list lands and _resolveVoice runs
      r.manager.allVoices = [STANDARD, BRIAN, AVA];
      r.resolve();
      expect(r.manager.selectedVoiceID).toBe(AVA.id);
      expect(r.manager.selectedTier).toBe('local');
      expect(t.announce).toHaveBeenCalledTimes(1);
      expect(sync.documentLanguage(r.reader)).toBe('en');
    });

    it('does nothing when the remembered voice is in the list and the manager is where it should be', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader('en', z, { voices: [] });
      sync.attach(r.reader);
      open(r);
      const persisted = r.manager._persistedVoices;
      r.log.length = 0;
      sync.reconcile(r.reader, { offered: [STANDARD, puckVoice], published: [STANDARD, puckVoice] });
      expect(r.log).toEqual([]);
      expect(r.manager._persistedVoices).toBe(persisted);
      expect(t.cloneForReader).not.toHaveBeenCalled();
      expect(r.original).toHaveBeenCalledTimes(1);
      expect(t.announce).not.toHaveBeenCalled();
    });

    // Issue #37's scenario: the popup reopened after favorites-only went
    // off; the old list lacked the remembered voice, the new one holds it
    it('brings a manager back to the remembered voice when the new list offers it, though the old one did not', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader('en', z, { voices: [STANDARD, AVA] });
      sync.attach(r.reader);
      // The previous open: substituted, reading Ava under Multiple languages
      sync.opening(r.reader);
      open(r);
      expect(r.manager.lang).toBe(MULTILINGUAL);
      expect(r.manager.selectedVoiceID).toBe(AVA.id);
      // The reopen: Zotero's restore runs against the old list first — still Ava, never the Standard voice
      sync.opening(r.reader);
      open(r);
      expect(r.manager.selectedVoiceID).toBe(AVA.id);
      // Then the new list is about to land
      const fresh = [STANDARD, AVA, puckVoice];
      sync.reconcile(r.reader, { offered: fresh, published: fresh });
      expect(r.manager.lang).toBe('en');
      expect(r.manager._persistedVoices).toEqual(prefs.en);
      r.manager.allVoices = fresh;
      r.resolve();
      expect(r.manager.selectedVoiceID).toBe(PUCK);
      expect(sync.substitution(r.reader)).toBeNull();
      expect(sync.documentLanguage(r.reader)).toBe('en');
    });

    // The other order of a first open: the list lands before the SDT has
    // reported the language; the sync that follows Zotero's setLanguage
    // finds the list in the manager and plans there
    it('waits for the language when the list lands first; the sync that follows plans against the manager’s list', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader(null, z, { voices: [] });
      sync.attach(r.reader);
      sync.reconcile(r.reader, { offered: [STANDARD, AVA], published: [STANDARD, AVA, puckVoice] });
      expect(r.log).toEqual([]);
      expect(t.announce).not.toHaveBeenCalled();
      // Zotero's loadVoices lands the list; the SDT then sets the language and syncs
      r.manager.allVoices = [STANDARD, AVA];
      r.manager.lang = 'en';
      open(r);
      expect(r.manager.lang).toBe(MULTILINGUAL);
      expect(r.manager.selectedVoiceID).toBe(AVA.id);
      // Named as the player names it, from the untrimmed list the hook carried
      expect(t.announce).toHaveBeenCalledWith(r.reader, 'Zotero-TTS: Kokoro-am_puck is not offered here. Reading with Azure-Ava Multilingual instead.');
    });

    it('attaches a reader it has not seen, and ignores what is not a reader', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader('en', z, { voices: [] });
      sync.reconcile(r.reader, { offered: [STANDARD, AVA], published: [STANDARD, AVA] });
      expect(r.manager.lang).toBe(MULTILINGUAL);
      expect(r.internal._syncPersistedVoicesToManager).not.toBe(r.original);
      expect(() => sync.reconcile(null, { offered: [], published: [] })).not.toThrow();
      expect(() => sync.reconcile({}, { offered: [], published: [] })).not.toThrow();
    });

    it('reports a manager that will not be staged, and leaves the rest standing', () => {
      const z = fakeZotero(prefs, puck);
      const t = withDeps(z);
      const sync = createReadAloudMemorySync(t.deps);
      const r = fakeReader('en', z, { voices: [] });
      sync.attach(r.reader);
      Object.defineProperty(r.manager, '_persistedVoices', {
        get: () => ({}),
        set: () => {
          throw new Error('dead object');
        },
      });
      sync.reconcile(r.reader, { offered: [STANDARD, AVA], published: [STANDARD, AVA] });
      expect(z.deps.error).toHaveBeenCalledWith(expect.any(Error));
      expect(z.voices()[MULTILINGUAL]?.voice).toBe(AVA.id);
    });
  });
});

// Issue #36: a manager on a tier that has no voice for the remembered
// voice's language — Standard, after a fallback or a pick in that tab. A
// move through setLanguage is undone by Zotero's language reset, which
// runs under the tier still selected; the move clears the tier with the
// voice, as applyPersistedVoices does, and the restore that follows
// resolves across every tier.
describe('a manager on a tier without the voice’s language', () => {
  const STANDARD: FakeVoice = { id: 'bdd0dcc3-en-US', language: 'en-US', tier: 'standard', label: 'Standard Voice 1' };
  const AVA: FakeVoice = { id: 'azure::en-US-AvaMultilingualNeural', language: MULTILINGUAL, tier: 'local', label: 'Azure-Ava Multilingual' };
  const ava: ReadAloudMemory = { speed: 1.7, voice: { id: AVA.id, lang: MULTILINGUAL } };
  const prefs: VoicesMap = {
    en: { region: 'US', voice: STANDARD.id, speed: 1.7, tierVoices: { standard: STANDARD.id } },
    [MULTILINGUAL]: { region: null, voice: AVA.id, speed: 1.7, tierVoices: { local: AVA.id } },
  };
  const onStandard = { selectedTier: 'standard', selectedVoiceID: STANDARD.id, persisted: prefs.en, voices: [STANDARD, AVA] };

  it('is moved all the same: the tier goes with the voice, and Zotero’s restore resolves across every tier', () => {
    const z = fakeZotero(prefs, ava);
    const sync = createReadAloudMemorySync(z.deps);
    const r = fakeReader('en', z, onStandard);
    sync.attach(r.reader);
    r.internal._syncPersistedVoicesToManager.call(r.internal);
    expect(r.log).toEqual(['lang:mul', 'zotero-sync:mul:1.7']);
    expect(r.manager.lang).toBe(MULTILINGUAL);
    expect(r.manager.selectedVoiceID).toBe(AVA.id);
    expect(r.manager.selectedTier).toBe('local');
    expect(r.setLanguageSpy).not.toHaveBeenCalled();
    expect(z.deps.debug).toHaveBeenCalledWith(expect.stringContaining('applied read-aloud memory: en -> mul'));
  });

  it('takes a voice spread from another tab while sitting on Standard', () => {
    const z = fakeZotero(prefs, { speed: 1.7, voice: { id: STANDARD.id, lang: 'en' } });
    const sync = createReadAloudMemorySync(z.deps);
    const picker = fakeReader(MULTILINGUAL, z, { active: true, speed: 1.7, selectedVoiceID: AVA.id, selectedTier: 'local', voices: [STANDARD, AVA] });
    const standing = fakeReader('en', z, { ...onStandard, active: true });
    z.readers.push(picker.reader, standing.reader);
    sync.attach(picker.reader);
    sync.attach(standing.reader);
    picker.manager.selectVoice(AVA.id);
    expect(sync.memory().voice).toEqual({ id: AVA.id, lang: MULTILINGUAL });
    expect(standing.manager.lang).toBe(MULTILINGUAL);
    expect(standing.manager.selectedVoiceID).toBe(AVA.id);
    expect(standing.manager.selectedTier).toBe('local');
  });
});
