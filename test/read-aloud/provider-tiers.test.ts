import { describe, expect, it, vi } from 'vitest';
import {
  buildTierOptions,
  createProviderTiers,
  strandedTarget,
  type ProviderTiersDeps,
  type TierOption,
} from '../../src/read-aloud/provider-tiers';
import { pluginVoiceTier } from '../../src/read-aloud/voice-catalog';

/**
 * A reader realm's array: its callback-taking methods never call a sandbox
 * callback and answer as if nothing matched (issue #75), so anything that
 * walks such a list must do it by index. Every list handed to the module
 * here is one of these.
 */
function realmArray<T>(items: T[]): T[] {
  return Object.assign(items, {
    find: () => undefined,
    some: () => false,
    every: () => true,
    filter: () => [],
    map: () => [],
    forEach: () => undefined,
  });
}

/** Zotero's RemoteReadAloudVoice in miniature: every field a getter over `impl` (reader.js:40467). */
class RemoteVoice {
  constructor(public impl: { id: string; tier: string; label: string; language: string }) {}
  get id() {
    return this.impl.id;
  }
  get tier() {
    return this.impl.tier;
  }
  get label() {
    return this.impl.label;
  }
  get language() {
    return this.impl.language;
  }
}

/** Zotero's BrowserReadAloudVoice: the operating system's, always local, no impl to re-tag. */
class OSVoice {
  constructor(private name: string) {}
  get id() {
    return 'local-urn:moz-tts:sapi:' + this.name;
  }
  get tier() {
    return 'local';
  }
}

const remote = (id: string, tier = 'local', language = 'en-US') => new RemoteVoice({ id, tier, label: id, language });

const LABELS: Record<string, string> = {
  standard: 'Zotero Standard',
  premium: 'Zotero Premium',
  azure: 'Azure',
  fish: 'Fish Audio',
  kokoro: 'Kokoro',
  openai: 'OpenAI',
  system: 'System',
};

// One manager class per reader tab, as each tab has its own bundle
function makeReader(voices: unknown[], state: { selectedTier?: string | null; persisted?: Record<string, unknown> } = {}) {
  const log: string[] = [];
  class Manager {
    _allVoices = realmArray(voices);
    _selectedTier: string | null = state.selectedTier ?? null;
    _persistedVoices: Record<string, unknown> = state.persisted ?? {};
    _resolveVoice(): void {
      log.push(`resolve:${this._selectedTier}`);
    }
  }
  const manager = new Manager();
  /** Zotero's React.createElement, which the module leaves alone since Zotero's own player is never shown (#134). */
  const create = vi.fn((type: unknown, props: unknown, ...children: unknown[]) => ({ type, props, children }));
  const React = { createElement: create as (...args: unknown[]) => unknown };
  const reader = { _internalReader: { _readAloudManager: manager }, _iframeWindow: { React } };
  return { manager, reader, React, create, log };
}

function make(overrides: Partial<ProviderTiersDeps> = {}) {
  const error = vi.fn();
  const tiers = createProviderTiers({
    voiceTiers: () => (id) => pluginVoiceTier(id, 'Kokoro'),
    labels: () => LABELS,
    defaultVoice: () => null,
    error,
    ...overrides,
  });
  return { tiers, error };
}

const zoteroThree = (): TierOption[] => [
  { value: 'standard', label: 'Standard', disabled: false },
  { value: 'premium', label: 'Premium', disabled: false },
  { value: 'local', label: 'Local', disabled: false },
];

describe('buildTierOptions', () => {
  it('names Zotero’s Standard and Premium behind its name, adds one entry per provider tier with voices, and drops local', () => {
    const out = buildTierOptions(zoteroThree(), new Set(['standard', 'premium', 'fish', 'kokoro']), LABELS);
    expect(out).toEqual([
      { value: 'fish', label: 'Fish Audio', disabled: false },
      { value: 'kokoro', label: 'Kokoro', disabled: false },
      { value: 'premium', label: 'Zotero Premium', disabled: false },
      { value: 'standard', label: 'Zotero Standard', disabled: false },
    ]);
  });

  // A provider with nothing to offer at the moment — server down, switched
  // off, no favorite of its own while only favorites are offered — is not
  // in the manager's tiers and does not appear; Zotero's own two leave the
  // same way (issue #111: a tier switched off, or with no favorite marked),
  // instead of staying greyed as Zotero draws them
  it('shows only the tiers that have voices, Zotero’s two gone rather than greyed', () => {
    const zotero = zoteroThree().map((o) => (o.value === 'premium' ? { ...o, disabled: true } : o));
    const out = buildTierOptions(zotero, new Set(['standard', 'azure']), LABELS);
    expect(out).toEqual([
      { value: 'azure', label: 'Azure', disabled: false },
      { value: 'standard', label: 'Zotero Standard', disabled: false },
    ]);
  });

  // The one case the dropdown must never get: an empty option list
  it('hands Zotero’s list back, named and greyed as given, when nothing has voices', () => {
    const zotero = zoteroThree().map((o) => ({ ...o, disabled: true }));
    expect(buildTierOptions(zotero, new Set(), LABELS)).toEqual([
      { value: 'standard', label: 'Zotero Standard', disabled: true },
      { value: 'premium', label: 'Zotero Premium', disabled: true },
      { value: 'local', label: 'Local', disabled: true },
    ]);
  });

  it('sorts the whole list by displayed label, Han by pinyin before Latin', () => {
    const zh = { ...LABELS, system: '系统', standard: 'Zotero 标准', premium: 'Zotero 高级' };
    const zotero: TierOption[] = [
      { value: 'standard', label: '标准', disabled: false },
      { value: 'premium', label: '高级', disabled: false },
      { value: 'local', label: '本地', disabled: true },
    ];
    const out = buildTierOptions(zotero, new Set(['standard', 'premium', 'system', 'azure', 'kokoro']), zh);
    expect(out.map((o) => o.label)).toEqual(['系统', 'Azure', 'Kokoro', 'Zotero 标准', 'Zotero 高级']);
  });

  it('names an entry whose label is unknown by its key, and keeps Zotero’s local entry only while OS voices are listed', () => {
    expect(buildTierOptions(zoteroThree(), new Set(['piper', 'standard']), LABELS).map((o) => o.label)).toEqual(['piper', 'Zotero Standard']);
    const withLocal = buildTierOptions(zoteroThree(), new Set(['local', 'fish']), LABELS);
    expect(withLocal.map((o) => o.value)).toEqual(['fish', 'local']);
  });

  // Not logged in, Zotero hands over its local entry alone (TierSelect adds
  // Standard and Premium only when logged in); the providers still list
  it('works from Zotero’s local-only list', () => {
    const out = buildTierOptions([{ value: 'local', label: 'Local', disabled: true }], new Set(['azure']), LABELS);
    expect(out).toEqual([{ value: 'azure', label: 'Azure', disabled: false }]);
  });
});

describe('strandedTarget', () => {
  const tiers = new Set(['standard', 'fish', 'kokoro']);
  const order = ['fish', 'kokoro', 'standard'];
  const tierOf = (id: string) => (id === 'fish::a' ? 'fish' : id === 'local::b' ? 'kokoro' : id === 's1' ? 'standard' : null);

  it('leaves a selection that still has voices, and no selection at all, alone', () => {
    expect(strandedTarget({ selected: 'fish', tiers, tierOf, remembered: 'local::b', fallback: null, order })).toBeNull();
    expect(strandedTarget({ selected: null, tiers, tierOf, remembered: 'local::b', fallback: null, order })).toBeNull();
  });

  it('moves to the remembered voice’s tier, else the default voice’s, else the first entry of the list', () => {
    expect(strandedTarget({ selected: 'azure', tiers, tierOf, remembered: 'local::b', fallback: 'fish::a', order })).toEqual({ to: 'kokoro', by: 'remembered' });
    expect(strandedTarget({ selected: 'azure', tiers, tierOf, remembered: 'azure::gone', fallback: 'fish::a', order })).toEqual({ to: 'fish', by: 'default' });
    expect(strandedTarget({ selected: 'azure', tiers, tierOf, remembered: null, fallback: null, order })).toEqual({ to: 'fish', by: 'first' });
  });

  // Zotero's two entries are ordinary entries of the rule: a remembered
  // Standard voice takes the selection to Standard
  it('treats Zotero’s own tiers like any other', () => {
    expect(strandedTarget({ selected: 'azure', tiers, tierOf, remembered: 's1', fallback: null, order })).toEqual({ to: 'standard', by: 'remembered' });
    expect(strandedTarget({ selected: 'local', tiers, tierOf, remembered: null, fallback: null, order: ['standard'] })).toEqual({ to: 'standard', by: 'first' });
  });

  it('has nowhere to go without a tier that has voices', () => {
    expect(strandedTarget({ selected: 'azure', tiers: new Set(), tierOf, remembered: 'local::b', fallback: 'fish::a', order: [] })).toBeNull();
  });
});

describe('createProviderTiers: the re-tag in front of _resolveVoice', () => {
  it('does not attach without a manager', () => {
    const { tiers, error } = make();
    expect(tiers.attach(null)).toBe(false);
    expect(tiers.attach({})).toBe(false);
    expect(tiers.attach({ _internalReader: {} })).toBe(false);
    expect(error).not.toHaveBeenCalled();
  });

  it('re-tags every plugin voice’s impl.tier to its provider before the original runs, leaving Zotero’s and the OS’s alone', () => {
    const fish = remote('fish::a');
    const bella = remote('local::af_bella');
    const david = remote('system::onecore/david');
    const cloud = remote('s1', 'standard');
    const os = new OSVoice('Microsoft David');
    const { manager, reader, log } = makeReader([cloud, fish, bella, os, david]);
    const { tiers, error } = make();
    expect(tiers.attach(reader)).toBe(true);
    manager._resolveVoice();
    expect(log).toEqual(['resolve:null']);
    expect([fish.tier, bella.tier, david.tier, cloud.tier, os.tier]).toEqual(['fish', 'kokoro', 'system', 'standard', 'local']);
    expect(tiers.inspect(reader)).toMatchObject({ resolveShadow: true, tiers: ['standard', 'fish', 'kokoro', 'system'], retagged: { fish: 1, kokoro: 1, system: 1 } });
    expect(error).not.toHaveBeenCalled();
  });

  it('is idempotent across rebuilds and re-reads the engine’s name on every resolve', () => {
    let engine = 'Kokoro';
    const bella = remote('local::af_bella');
    const { manager, reader } = makeReader([bella]);
    const { tiers } = make({ voiceTiers: () => (id) => pluginVoiceTier(id, engine) });
    tiers.attach(reader);
    manager._resolveVoice();
    manager._resolveVoice();
    expect(bella.tier).toBe('kokoro');
    engine = 'Piper';
    manager._resolveVoice();
    expect(bella.tier).toBe('piper');
  });

  it('reads the engine’s name once per walk, not once per voice (#125)', () => {
    const voices = Array.from({ length: 40 }, (_, i) => remote(`local::v${i}`));
    const { manager, reader } = makeReader(voices);
    let walks = 0;
    let lookups = 0;
    const { tiers } = make({
      voiceTiers: () => {
        walks += 1;
        return (id) => {
          lookups += 1;
          return pluginVoiceTier(id, 'Kokoro');
        };
      },
    });
    tiers.attach(reader);

    // The walk behind _resolveVoice: one read of the settings, one lookup per voice
    manager._resolveVoice();
    expect(walks).toBe(1);
    expect(lookups).toBe(voices.length);
  });

  it('moves a selected tier no voice carries any more, before Zotero resolves', () => {
    const fish = remote('fish::a');
    const bella = remote('local::af_bella');
    const { manager, reader, log } = makeReader([fish, bella], { selectedTier: 'azure', persisted: { voice: 'local::af_bella' } });
    const { tiers } = make();
    tiers.attach(reader);
    manager._resolveVoice();
    expect(manager._selectedTier).toBe('kokoro');
    expect(log).toEqual(['resolve:kokoro']);
    expect(tiers.inspect(reader)).toMatchObject({ selectedTier: 'kokoro', lastMove: { from: 'azure', to: 'kokoro', by: 'remembered' } });
  });

  it('takes the default voice’s tier when the remembered voice is not listed, and the first entry when neither is', () => {
    const fish = remote('fish::a');
    const bella = remote('local::af_bella');
    const first = makeReader([fish, bella], { selectedTier: 'azure', persisted: { voice: 'azure::gone' } });
    const { tiers } = make({ defaultVoice: () => 'fish::a' });
    tiers.attach(first.reader);
    first.manager._resolveVoice();
    expect(first.manager._selectedTier).toBe('fish');
    expect(tiers.inspect(first.reader)).toMatchObject({ lastMove: { from: 'azure', to: 'fish', by: 'default' } });

    const second = makeReader([fish, bella], { selectedTier: 'azure' });
    const nothing = make();
    nothing.tiers.attach(second.reader);
    second.manager._resolveVoice();
    // Fish Audio sorts before Kokoro: the first entry of the list as displayed
    expect(second.manager._selectedTier).toBe('fish');
    expect(nothing.tiers.inspect(second.reader)).toMatchObject({ lastMove: { from: 'azure', to: 'fish', by: 'first' } });
  });

  // Zotero's own fallback moves a stranded tier to `local` only (reader.js:82433);
  // the OS voices, which system-voices.ts splices out, must not count as a
  // tier with voices, whichever of the two shadows runs first
  it('does not count the OS voices as a tier with voices, and moves off local', () => {
    const os = new OSVoice('Microsoft David');
    const fish = remote('fish::a');
    const { manager, reader } = makeReader([os, fish], { selectedTier: 'local' });
    const { tiers } = make();
    tiers.attach(reader);
    manager._resolveVoice();
    expect(manager._selectedTier).toBe('fish');
    expect(tiers.inspect(reader)).toMatchObject({ tiers: ['fish'] });
  });

  it('leaves a selection that still has voices, and a null one, alone', () => {
    const fish = remote('fish::a');
    const kept = makeReader([fish], { selectedTier: 'fish' });
    const { tiers } = make();
    tiers.attach(kept.reader);
    kept.manager._resolveVoice();
    expect(kept.manager._selectedTier).toBe('fish');
    expect(tiers.inspect(kept.reader)).toMatchObject({ lastMove: null });
    const none = makeReader([fish], { selectedTier: null });
    tiers.attach(none.reader);
    none.manager._resolveVoice();
    expect(none.manager._selectedTier).toBeNull();
  });

  it('tolerates a missing or odd _allVoices and null entries, and a re-tag that throws is reported while the original still runs', () => {
    const { manager, reader, log } = makeReader([null, remote('fish::a')]);
    const { tiers, error } = make();
    tiers.attach(reader);
    (manager as any)._allVoices = undefined;
    manager._resolveVoice();
    manager._allVoices = realmArray([null, remote('fish::a')]);
    manager._resolveVoice();
    expect(log).toHaveLength(2);
    expect(error).not.toHaveBeenCalled();

    // The manager waives fine at attach and throws inside the shadow, as a
    // wrapper of a tab on its way out does
    const broken = makeReader([remote('fish::a')]);
    let seen = 0;
    const throwing = make({
      waiveXrays: (value) => {
        if (value === broken.manager && ++seen > 1) throw new Error('dead wrapper');
        return value;
      },
    });
    expect(throwing.tiers.attach(broken.reader)).toBe(true);
    broken.manager._resolveVoice();
    expect(broken.log).toHaveLength(1);
    expect(throwing.error).toHaveBeenCalledTimes(1);
  });

  it('attaches once per manager prototype, however often it is called', () => {
    const { manager, reader, log } = makeReader([remote('fish::a')]);
    const { tiers } = make();
    expect(tiers.attach(reader)).toBe(true);
    expect(tiers.attach(reader)).toBe(true);
    manager._resolveVoice();
    expect(log).toHaveLength(1);
  });
});

describe('createProviderTiers: dispose', () => {
  it('restores the prototype method, and never touches the reader\'s React: the Player lists the entries itself (#134)', () => {
    const { manager, reader, React, log } = makeReader([remote('fish::a')], { selectedTier: 'azure' });
    const originalCreate = React.createElement;
    const originalResolve = Object.getPrototypeOf(manager)._resolveVoice;
    const { tiers } = make();
    tiers.attach(reader);
    expect(React.createElement).toBe(originalCreate);
    tiers.dispose();
    expect(React.createElement).toBe(originalCreate);
    expect(Object.getPrototypeOf(manager)._resolveVoice).toBe(originalResolve);
    manager._resolveVoice();
    expect(manager._selectedTier).toBe('azure');
    expect(log).toEqual(['resolve:azure']);
    expect(tiers.patchCounts()).toEqual({ total: 0, live: 0 });
  });

  it('skips a closed tab’s prototype in silence', () => {
    const { manager, reader } = makeReader([remote('fish::a')]);
    const closed = new Set<unknown>();
    const { tiers, error } = make({ isDead: (value) => closed.has(value) });
    tiers.attach(reader);
    expect(tiers.patchCounts()).toEqual({ total: 1, live: 1 });
    closed.add(Object.getPrototypeOf(manager));
    expect(tiers.patchCounts()).toEqual({ total: 1, live: 0 });
    tiers.dispose();
    expect(error).not.toHaveBeenCalled();
    expect(tiers.patchCounts()).toEqual({ total: 0, live: 0 });
  });

  it('inspect answers for a reader it never saw', () => {
    const { tiers } = make();
    expect(tiers.inspect({})).toEqual({ resolveShadow: false, tierMemoryHook: false, tiers: [], selectedTier: null, lastMove: null, retagged: {} });
  });
});

describe('createProviderTiers: each provider’s own memory within a session', () => {
  // Zotero refreshes manager._persistedVoices only when a popup opens
  // (applyPersistedVoices, reader.js:84170-84176), so a selectTier mid-session
  // reads the entry as of that open (82359) and a tier picked, left and picked
  // again falls back to its first voice (measured 2026-09-15 on 1.12.10-beta3).
  // The hook refreshes the entry from the reader's state first.
  function makeSession(lang: string | null, entries: Record<string, unknown>) {
    const log: string[] = [];
    class Manager {
      _allVoices = realmArray([]);
      _selectedTier: string | null = null;
      _persistedVoices: Record<string, unknown> = { stale: true };
      lang = lang;
      _resolveVoice(): void {}
      selectTier(tier: string): void {
        log.push(`${tier}:${JSON.stringify((this._persistedVoices as { tierVoices?: Record<string, unknown> }).tierVoices?.[tier] ?? null)}`);
      }
    }
    const manager = new Manager();
    const state = { readAloudVoices: new Map(Object.entries(entries)) };
    const reader = { _internalReader: { _readAloudManager: manager, _state: state as unknown }, _iframeWindow: { React: { createElement: () => null } } };
    return { manager, reader, log, Manager };
  }

  it('hands selectTier the entry the reader holds now, resolved by language the way Zotero resolves it', () => {
    const entry = { voice: 'fish::a', tierVoices: { fish: 'fish::a', system: 'system::second' } };
    const { manager, reader, log } = makeSession('en', { 'en-US': entry });
    const { tiers, error } = make();
    expect(tiers.attach(reader)).toBe(true);
    manager.selectTier('system');
    expect(log).toEqual(['system:"system::second"']);
    expect(manager._persistedVoices).toBe(entry);
    expect(tiers.inspect(reader).tierMemoryHook).toBe(true);
    expect(error).not.toHaveBeenCalled();
  });

  it('leaves the manager’s entry alone without a language, or without an entry for it', () => {
    const noLang = makeSession(null, { en: { voice: 'x' } });
    const { tiers } = make();
    tiers.attach(noLang.reader);
    noLang.manager.selectTier('fish');
    expect(noLang.manager._persistedVoices).toEqual({ stale: true });
    const other = makeSession('de', { en: { voice: 'x' } });
    tiers.attach(other.reader);
    other.manager.selectTier('fish');
    expect(other.manager._persistedVoices).toEqual({ stale: true });
    expect(other.log).toEqual(['fish:null']);
  });

  it('hooks once per manager, and dispose puts the prototype method back', () => {
    const { manager, reader, Manager } = makeSession('en', {});
    const { tiers } = make();
    tiers.attach(reader);
    const hooked = manager.selectTier;
    tiers.attach(reader);
    expect(manager.selectTier).toBe(hooked);
    expect(Object.prototype.hasOwnProperty.call(manager, 'selectTier')).toBe(true);
    tiers.dispose();
    expect(Object.prototype.hasOwnProperty.call(manager, 'selectTier')).toBe(false);
    expect(manager.selectTier).toBe(Manager.prototype.selectTier);
    expect(tiers.inspect(reader).tierMemoryHook).toBe(false);
  });

  it('a refresh that throws is reported and the pick still runs', () => {
    const { manager, reader, log } = makeSession('en', {});
    (reader._internalReader as { _state: unknown })._state = {
      get readAloudVoices() {
        throw new Error('gone');
      },
    };
    const { tiers, error } = make();
    tiers.attach(reader);
    manager.selectTier('fish');
    expect(log).toEqual(['fish:null']);
    expect(error).toHaveBeenCalledTimes(1);
  });
});
