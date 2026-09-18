/**
 * One entry per provider in the Read Aloud player's first dropdown, beside
 * Zotero's Standard and Premium (issue #110), and each provider's own
 * memory of its last voice per language.
 *
 * Zotero hard-codes its three tiers in three places, and each has a way
 * past it (researched 2026-09-15 in 10.0.3-beta.1, bundle lines below are
 * its `resource/reader/reader.js`):
 *
 * - The parser keeps only its three keys (`TIERS` 39265, parseVoicesResponse
 *   40531), so the plugin's voices still travel under `local`
 *   (voice-catalog.ts PUBLISHED_TIER). The tier Zotero then works with is
 *   `RemoteReadAloudVoice.tier`, a getter over `impl.tier` (40467), and the
 *   manager's tier logic is string-generic: `voices` filters by
 *   `_selectedTier` (82281), `tiers` is the Set of `v.tier` (82296),
 *   `selectTier` restores `tierVoices[tier]` (82353), `_findFallbackVoice`
 *   takes the last `tierVoices` key as its target (82460), `_applyVoice`
 *   sets `_selectedTier = voice.tier` (82519) and `_setReadAloudVoice`
 *   pushes `tierVoices[tier]` last (84284). So every plugin voice's
 *   `impl.tier` is rewritten to its provider's key (voice-catalog.ts
 *   tierForProvider) in front of `_resolveVoice`, which every list rebuild
 *   ends in — loadVoices, setLanguage, selectTier, applyPersistedVoices —
 *   the same shadow point system-voices.ts uses to splice the OS voices out.
 *   Old persisted entries need no migration: `applyPersistedVoices` clears
 *   the tier first and the fallback finds the remembered id in the
 *   unfiltered pool; `_applyVoice` then sets the tier from the voice.
 * - The one named comparison, a selected tier no voice carries, moves it to
 *   `local` and nowhere else (82433-82437); with the OS voices hidden that
 *   leaves the manager on an empty tier (`voices` 0, measured live). So the
 *   shadow moves such a selection itself, before Zotero looks: to the
 *   remembered voice's tier (the entry's `voice`), else the plugin's
 *   default voice's, else the first entry of the list as displayed. Zotero's
 *   two entries are ordinary entries of that rule.
 * - The dropdown's options are built inside `TierSelect` (38827-38855):
 *   Standard and Premium when logged in, `local` always, each only greyed
 *   when it has no voices, and the element exists only at render time. The
 *   reader takes React from the iframe's global (reader.html loads
 *   resource://zotero/react.js; the UMD wrapper takes root["React"], lines
 *   1-10, 28775) and looks `createElement` up on that object at every call
 *   (1,714 calls per popup open, 8 tier elements, measured live). So
 *   `createElement` is wrapped per reader on that object, exported into the
 *   reader's compartment like the prototype shadows: the one element whose
 *   `options` are exactly a subset of Zotero's three values is handed
 *   another list — Zotero's Standard and Premium as given, one entry per
 *   provider tier that has voices, sorted by displayed label
 *   (compareVoiceLabels), `local` dropped unless OS voices are still listed.
 *   Its `onChange` stays Zotero's own `manager.selectTier(value)`. Every
 *   React render rebuilds the element, which is why the list is made here
 *   and never injected into the rendered DOM.
 *
 * - Each provider's own last voice per language is Zotero's per-tier memory
 *   (`tierVoices`), which `selectTier` reads from `_persistedVoices`
 *   (82359) — an entry Zotero refreshes only when a popup opens
 *   (`applyPersistedVoices`, 84170-84176), never when a pick persists. So a
 *   tier picked, left and picked again in one session fell back to its
 *   first voice (measured 2026-09-15 on 1.12.10-beta3; Zotero's own
 *   Standard and Premium do the same). The manager's `selectTier` gets an
 *   own-property hook, inside voice-switch.ts's (#108) since this attaches
 *   first, that refreshes `_persistedVoices` from the reader's state for
 *   the manager's language, resolved as Zotero resolves it, before the pick
 *   reads it.
 *
 * Keyed on the literal `local`, and gone with it (stated and accepted on
 * #110): the speed slider's pause-while-dragging and the "More voices…" row.
 * Out of reach: the first-run and Manage voices windows, separate bundles
 * with their own `TIERS`, which keep filing the plugin's voices under Local.
 *
 * Compartment rules as in highlight-style.ts and system-voices.ts: `this`
 * and the props arrive behind Xray wrappers and are waived before anything
 * is written; the reader's arrays are walked by index, never with `find`
 * or `some` (issue #75); the new option list is cloned into the reader's
 * window; the originals run through Reflect.apply. Both patches go through
 * one proto-patches log, so a closed tab's dead React and prototype are
 * skipped at dispose (issue #5).
 */

import { createProtoPatches, type AnyFn } from './proto-patches';
import { ownerOf } from './system-voices';
import { compareVoiceLabels, decodeVoiceId, PUBLISHED_TIER } from './voice-catalog';
import { resolveVoiceLang } from '../core/read-aloud-speed';

/** The values Zotero's TierSelect builds its options from, and nothing else. */
export const ZOTERO_TIER_VALUES: readonly string[] = ['standard', 'premium', 'local'];

/** One option of Zotero's CustomSelect: `{ value, label, disabled }`. */
export interface TierOption {
  value: string;
  label: string;
  disabled?: boolean;
}

/** Where a stranded selection went, and by which step of the rule. */
export interface TierMove {
  from: string;
  to: string;
  by: 'remembered' | 'default' | 'first';
}

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

/**
 * Whether an element's `options` are the tier select's: at least one, and
 * every value one of Zotero's three. Never the localized aria-label. The
 * list is the reader realm's, so it is walked by index.
 */
export function isTierOptionList(options: unknown): boolean {
  if (!isRecord(options) || typeof options.length !== 'number') return false;
  const length = options.length;
  if (length < 1 || length > ZOTERO_TIER_VALUES.length) return false;
  for (let i = 0; i < length; i++) {
    const option = (options as Record<number, unknown>)[i];
    if (!isRecord(option) || typeof option.value !== 'string' || !ZOTERO_TIER_VALUES.includes(option.value)) return false;
  }
  return true;
}

/**
 * The replacement list: Zotero's own options only while the manager lists
 * voices under them — Standard and Premium like `local` (the OS voices,
 * which system-voices.ts hides): a tier switched off in the pane (issue
 * #111), or one with no favorite while only favorites are offered, leaves
 * the list like a provider with nothing to offer, instead of staying
 * greyed as Zotero draws it — named by `labels` where it names them
 * ("Zotero Standard"), else as Zotero labeled them; and one entry per
 * other tier that has voices, named by `labels` (the key itself when
 * unnamed); the whole sorted by displayed label, Han by pinyin before
 * Latin. With nothing to list at all, Zotero's list as given, greyed: the
 * dropdown is never handed an empty option list.
 */
export function buildTierOptions(zoteroOptions: readonly TierOption[], tiers: Iterable<string>, labels: Record<string, string>): TierOption[] {
  const withVoices = new Set(tiers);
  const named = (option: TierOption): TierOption => ({ value: option.value, label: labels[option.value] ?? option.label, disabled: !!option.disabled });
  const out: TierOption[] = [];
  for (const option of zoteroOptions) {
    if (!withVoices.has(option.value)) continue;
    out.push(named(option));
  }
  for (const tier of withVoices) {
    if (ZOTERO_TIER_VALUES.includes(tier)) continue;
    out.push({ value: tier, label: labels[tier] ?? tier, disabled: false });
  }
  if (!out.length) return zoteroOptions.map(named);
  return out.sort((a, b) => compareVoiceLabels(a.label, b.label) || (a.value < b.value ? -1 : a.value > b.value ? 1 : 0));
}

/**
 * The rule for a selected tier no voice carries any more (a provider
 * switched off, a server gone): the remembered voice's tier — Zotero's own
 * entry for the language — else the plugin's default voice's, else the
 * first entry of the list as displayed; null when the selection still has
 * voices, when there is none, or when no tier has voices at all. `tierOf`
 * answers a listed voice id's tier, null for one not listed.
 */
export function strandedTarget(args: {
  selected: string | null;
  tiers: ReadonlySet<string>;
  tierOf(id: string): string | null;
  remembered: string | null;
  fallback: string | null;
  order: readonly string[];
}): { to: string; by: TierMove['by'] } | null {
  const { selected, tiers } = args;
  if (selected === null || tiers.has(selected)) return null;
  const listed = (id: string | null): string | null => {
    const tier = id ? args.tierOf(id) : null;
    return tier && tiers.has(tier) ? tier : null;
  };
  const remembered = listed(args.remembered);
  if (remembered) return { to: remembered, by: 'remembered' };
  const fallback = listed(args.fallback);
  if (fallback) return { to: fallback, by: 'default' };
  const first = args.order.find((tier) => tiers.has(tier));
  return first ? { to: first, by: 'first' } : null;
}

export interface ProviderTiersDeps {
  /**
   * Opens a reader of a plugin voice id's tier (voice-catalog.ts
   * pluginVoiceTier with the local engine's name); null for a Zotero voice
   * id. Called once at the start of each walk, not once per voice: the
   * engine's name costs a whole settings read, the dropdown is rebuilt on
   * every scroll frame while the player is open, and a read per voice over
   * this library's 1,819 voices blocked the main thread 83 ms a frame —
   * scrolling at 13 fps against 114 with the player closed (issue #125).
   * The engine and the server preset can still change in the pane; the next
   * walk opens a reader that sees them.
   */
  voiceTiers(): (id: string) => string | null;
  /** The entry names by tier key — every provider's, and Zotero's two for the stranded rule's order — in the app's language, read afresh. */
  labels(): Record<string, string>;
  /** The plugin's default voice id (readAloud.memory), null when none: the second step of the stranded rule. */
  defaultVoice(): string | null;
  /** The reader's preferred languages, for resolving a language's entry the way Zotero's resolveLanguage does (core/read-aloud-speed.ts). Optional. */
  preferredLanguages?(): readonly string[];
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into an exported wrapper, and for its window. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.cloneInto toward the reader's window: the option list handed to Zotero's element must live in its compartment. Optional for tests. */
  cloneInto?(reader: unknown, value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype and React are skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface ProviderTiersReport {
  /** Whether this tab's manager prototype carries the `_resolveVoice` shadow. */
  resolveShadow: boolean;
  /** Whether this tab's React carries the `createElement` wrapper. */
  createElementWrapped: boolean;
  /** Whether this tab's manager carries the selectTier hook that refreshes its persisted entry mid-session. */
  tierMemoryHook: boolean;
  /** The option list last handed to the tier select in this tab; null before its first render. */
  options: TierOption[] | null;
  /** The tiers that have voices on the manager's list right now, in list order — what the dropdown lists. */
  tiers: string[];
  selectedTier: string | null;
  /** The last stranded selection moved in this tab, or null. */
  lastMove: TierMove | null;
  /** The plugin's voices by the tier their objects carry now: provider keys once the re-tag ran, `local` where it did not. */
  retagged: Record<string, number>;
}

export interface ProviderTiers {
  /** Shadow the tab's manager prototype and wrap its React; true once the shadow is on. Cheap to repeat, so it may run on every voices request. */
  attach(reader: unknown): boolean;
  /** What this module sees in a reader, as plain data, for diagnostics.providerTiers(). */
  inspect(reader: unknown): ProviderTiersReport;
  /** Entries held by the undo log, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every prototype, React and selectTier back. */
  dispose(): void;
}

const EMPTY_REPORT: ProviderTiersReport = { resolveShadow: false, createElementWrapped: false, tierMemoryHook: false, options: null, tiers: [], selectedTier: null, lastMove: null, retagged: {} };

export function createProviderTiers(deps: ProviderTiersDeps): ProviderTiers {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  /** Per manager (waived): the list last handed to the dropdown and the last stranded move. */
  const state = new WeakMap<object, { options: TierOption[] | null; lastMove: TierMove | null }>();
  const stateOf = (manager: object) => {
    let record = state.get(manager);
    if (!record) {
      record = { options: null, lastMove: null };
      state.set(manager, record);
    }
    return record;
  };

  const managerOf = (reader: any): any => waive(reader?._internalReader?._readAloudManager);
  const reactOf = (reader: any): any => {
    const React = waive(reader?._iframeWindow)?.React;
    return React && typeof React.createElement === 'function' ? React : null;
  };

  /** The selectTier hooks, one per manager, restored by descriptor (the player-voice-list.ts pattern). */
  const memoryHooks: { manager: any; own: PropertyDescriptor | undefined; hook: AnyFn }[] = [];

  /**
   * The language's entry as the reader holds it now — Zotero's
   * `_syncPersistedVoicesToManager` (84170-84176) without its re-resolve —
   * onto the manager, so the pick about to run reads today's `tierVoices`.
   * Nothing is assigned without a language or an entry: the manager keeps
   * what it has, and never an object of this compartment.
   */
  function refreshPersisted(reader: any, manager: any): boolean {
    const map = waive(reader?._internalReader)?._state?.readAloudVoices;
    const lang = typeof manager?.lang === 'string' ? manager.lang : null;
    if (!map || typeof map.get !== 'function' || typeof map.keys !== 'function' || !lang) return false;
    const keys: string[] = [];
    for (const key of map.keys()) if (typeof key === 'string') keys.push(key);
    const resolved = resolveVoiceLang(lang, keys, deps.preferredLanguages?.() ?? []);
    const entry = resolved ? map.get(resolved) : null;
    if (!entry || typeof entry !== 'object') return false;
    manager._persistedVoices = entry;
    return true;
  }

  function attachTierMemory(reader: any, manager: any): boolean {
    if (!manager || typeof manager.selectTier !== 'function') return false;
    for (let i = memoryHooks.length - 1; i >= 0; i--) if (deps.isDead?.(memoryHooks[i].manager)) memoryHooks.splice(i, 1);
    if (memoryHooks.some((h) => h.manager === manager)) return true;
    const own = Object.getOwnPropertyDescriptor(manager, 'selectTier');
    const inner = manager.selectTier as AnyFn;
    const hook = function (this: any, ...args: unknown[]) {
      try {
        refreshPersisted(reader, waive(this));
      } catch (e) {
        deps.error(e);
      }
      return Reflect.apply(inner, this, args);
    };
    const exported = deps.exportFunction ? deps.exportFunction(hook, manager) : hook;
    manager.selectTier = exported;
    memoryHooks.push({ manager, own, hook: exported });
    deps.debug?.("provider tiers: each entry's own memory follows the reader's state");
    return true;
  }

  function unhookTierMemory(): void {
    for (const { manager, own, hook } of [...memoryHooks].reverse()) {
      try {
        if (deps.isDead?.(manager)) continue;
        // Only what is still ours: a wrapper laid over it later is that module's to unwind
        if (Object.getOwnPropertyDescriptor(manager, 'selectTier')?.value !== hook) continue;
        if (own) Object.defineProperty(manager, 'selectTier', own);
        else delete manager.selectTier;
      } catch (e) {
        deps.error(e);
      }
    }
    memoryHooks.length = 0;
  }

  /**
   * One walk of the manager's list, by index: with `write`, every plugin
   * voice's `impl.tier` set to its provider's key. Answers the tiers that
   * have voices as the objects say them now — the OS's `local` voices left
   * out, since system-voices.ts removes them — each listed id's tier, the
   * plugin's voices counted by the tier they carry, and how many changed.
   */
  function scan(manager: any, write: boolean): { tiers: Set<string>; byId: Map<string, string>; retagged: Record<string, number>; changed: number } {
    const tiers = new Set<string>();
    const byId = new Map<string, string>();
    const retagged: Record<string, number> = {};
    let changed = 0;
    const all = manager?._allVoices;
    const length = all && typeof all.length === 'number' ? all.length : 0;
    // Once for the walk, never per voice (issue #125)
    const tierOf = deps.voiceTiers();
    for (let i = 0; i < length; i++) {
      const v = all[i];
      if (!v || typeof v !== 'object') continue;
      const id = typeof v.id === 'string' ? v.id : '';
      const own = id ? tierOf(id) : null;
      if (own && write) {
        const impl = v.impl;
        if (impl && typeof impl === 'object' && impl.tier !== own) {
          impl.tier = own;
          changed += 1;
        }
      }
      const tier = typeof v.tier === 'string' ? v.tier : '';
      if (!tier) continue;
      if (own) retagged[tier] = (retagged[tier] ?? 0) + 1;
      else if (tier === PUBLISHED_TIER) continue;
      tiers.add(tier);
      if (id) byId.set(id, tier);
    }
    return { tiers, byId, retagged, changed };
  }

  /** The list as the dropdown shows it for these tiers, with Zotero's own two named by the plugin's copy of Zotero's words. */
  function orderOf(tiers: ReadonlySet<string>, labels: Record<string, string>): string[] {
    const zotero = ZOTERO_TIER_VALUES.filter((value) => tiers.has(value)).map((value) => ({ value, label: labels[value] ?? value, disabled: false }));
    return buildTierOptions(zotero, tiers, labels).map((option) => option.value);
  }

  function retagAndMove(manager: any): void {
    const { tiers, byId, retagged, changed } = scan(manager, true);
    if (changed) {
      const counts = Object.entries(retagged)
        .map(([tier, n]) => `${tier} ${n}`)
        .join(', ');
      deps.debug?.(`re-tagged ${changed} plugin voice${changed === 1 ? '' : 's'} by provider: ${counts}`);
    }
    const selected = typeof manager._selectedTier === 'string' ? manager._selectedTier : null;
    const persisted = manager._persistedVoices;
    const remembered = persisted && typeof persisted.voice === 'string' ? persisted.voice : null;
    const target = strandedTarget({
      selected,
      tiers,
      tierOf: (id) => byId.get(id) ?? null,
      remembered,
      fallback: deps.defaultVoice(),
      order: orderOf(tiers, deps.labels()),
    });
    if (!target || selected === null) return;
    manager._selectedTier = target.to;
    stateOf(manager).lastMove = { from: selected, to: target.to, by: target.by };
    deps.debug?.(`the player's entry ${selected} has no voices any more; moved to ${target.to} (${target.by})`);
  }

  function attachResolve(manager: any): boolean {
    const proto = manager ? ownerOf(manager, '_resolveVoice') : null;
    if (!proto) return false;
    if (patches.has(proto, '_resolveVoice')) return true;
    patches.shadow(proto, '_resolveVoice', (original) =>
      function (this: any, ...args: unknown[]) {
        try {
          retagAndMove(waive(this));
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, this, args);
      },
    );
    deps.debug?.('provider tiers attached');
    return true;
  }

  /** The options of the tier select, read off the reader's list by index as primitives. */
  function readOptions(options: any): TierOption[] {
    const out: TierOption[] = [];
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      out.push({ value: String(option.value), label: typeof option.label === 'string' ? option.label : String(option.value), disabled: !!option.disabled });
    }
    return out;
  }

  /** The tier select's props, and no other element's: `options` replaced by the provider list, cloned into the reader's window. */
  function rewrite(reader: any, rawProps: unknown): void {
    if (!rawProps || typeof rawProps !== 'object') return;
    const props = waive(rawProps);
    const options = props.options;
    if (!isTierOptionList(options) || typeof props.onChange !== 'function') return;
    const manager = managerOf(reader);
    if (!manager) return;
    const { tiers } = scan(manager, false);
    const next = buildTierOptions(readOptions(options), tiers, deps.labels());
    props.options = deps.cloneInto ? deps.cloneInto(reader, next) : next;
    stateOf(manager).options = next;
  }

  function attachDropdown(reader: any): boolean {
    const React = reactOf(reader);
    if (!React) return false;
    if (patches.has(React, 'createElement')) return true;
    patches.shadow(React, 'createElement', (original) =>
      function (this: unknown, ...args: unknown[]) {
        try {
          rewrite(reader, args[1]);
        } catch (e) {
          deps.error(e);
        }
        return Reflect.apply(original, React, args);
      },
    );
    deps.debug?.("provider tiers: the player's first dropdown is wrapped");
    return true;
  }

  function attach(reader: unknown): boolean {
    let resolved = false;
    let manager: any = null;
    try {
      // Waived once for the two manager patches; the dropdown's is the window's
      manager = managerOf(reader);
      resolved = attachResolve(manager);
    } catch (e) {
      deps.error(e);
    }
    try {
      attachDropdown(reader);
    } catch (e) {
      deps.error(e);
    }
    try {
      attachTierMemory(reader, manager);
    } catch (e) {
      deps.error(e);
    }
    return resolved;
  }

  function inspect(reader: unknown): ProviderTiersReport {
    try {
      const manager = managerOf(reader);
      const proto = manager ? ownerOf(manager, '_resolveVoice') : null;
      const React = reactOf(reader);
      const record = manager ? state.get(manager) : undefined;
      const { tiers, retagged } = manager ? scan(manager, false) : { tiers: new Set<string>(), retagged: {} };
      return {
        resolveShadow: !!proto && patches.has(proto, '_resolveVoice'),
        createElementWrapped: !!React && patches.has(React, 'createElement'),
        tierMemoryHook: !!manager && memoryHooks.some((h) => h.manager === manager),
        options: record?.options ?? null,
        tiers: [...tiers],
        selectedTier: typeof manager?._selectedTier === 'string' ? manager._selectedTier : null,
        lastMove: record?.lastMove ?? null,
        retagged,
      };
    } catch (e) {
      deps.error(e);
      return { ...EMPTY_REPORT };
    }
  }

  return {
    attach,
    inspect,
    patchCounts: () => patches.counts(),
    dispose: () => {
      unhookTierMemory();
      patches.restoreAll();
    },
  };
}
