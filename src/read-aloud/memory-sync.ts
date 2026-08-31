import { READ_ALOUD_VOICES_PREF, readReadAloudVoices, resolveVoiceLang, type VoicesMap } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import { setDefaultSpeed, type SpeedManagerLike } from './default-speed';
import {
  memoryFromVoices,
  memoryLangForLocale,
  noteVoicesChange,
  pickSubstitute,
  planSync,
  readMemory,
  sameChoice,
  substitutionMessage,
  writeMemory,
  type ReadAloudMemory,
  type VoiceChoice,
} from './read-aloud-memory';
import { createProtoPatches } from './proto-patches';
import { ownerOf } from './system-voices';
import { PLUGIN_TIER, type ListedVoice } from './voice-catalog';

/**
 * Wires read-aloud-memory.ts to Zotero. The memory lives in its pref
 * (`readAloud.memory`), which is read on every use and never copied: the
 * voice browser writes it too (default-speed.ts, default-voice.ts), and on
 * a fresh install Zotero's pref has no entry whose change could carry the
 * news here — a copy would be stale exactly when the memory is the only
 * thing that moved. Two hooks:
 *
 * - A pref observer on `reader.readAloudVoices` learns the speed and voice
 *   from what Zotero persists on the user's actions. What is learned is
 *   global while its switch is on, and reaches every other open reader at
 *   once: a speed through the routine the pane's slider uses
 *   (default-speed.ts), a voice by running Zotero's own restore again on
 *   every reader that is reading (spreadVoice below) — the popup's pick in
 *   one tab changes the voice in the others.
 * - Each reader's internal `_syncPersistedVoicesToManager` (the one place
 *   Zotero restores the per-language choice into its ReadAloudManager, run
 *   whenever the manager learns the document's language and on every popup
 *   open) is shadowed on the instance with a wrapper that first puts the
 *   remembered choice where Zotero will read it, then runs the original.
 *   The pref write is synchronous: Zotero's own observer copies the pref
 *   into the reader's state before `set` returns, so the original sees it.
 *   The reader's code runs in the iframe's compartment, which may not call
 *   a function that merely lives in the plugin sandbox — such a property
 *   is opaque there and the call throws, which silently breaks the Read
 *   Aloud button. The wrapper is therefore exported into the reader's
 *   compartment first (Components.utils.exportFunction, the same mechanism
 *   Zotero uses when it hands its remote interface to the reader).
 *
 * The remembered voice goes to every document whatever its language (the
 * user's rule: one voice everywhere), so a manager is moved to the voice's
 * lane — `mul` for a multilingual voice, else the language it was picked
 * under. It stays there for the reader's lifetime — Zotero's `deactivate()`
 * resets everything but the language — so where it was moved from is kept
 * per reader, and a cleared memory (or the switch going off) sends the
 * manager back before Zotero's restore, which then finds the entry a fresh
 * tab would. The move writes the manager's fields the way
 * `applyPersistedVoices` does before it resolves — never `setLanguage`,
 * whose own resolution runs under the tier still selected and resets the
 * language when that tier has no voice for it (issue #36).
 *
 * A reader resolves from the list its popup received, and the remembered
 * voice may not be in it — a favorite that is not offered while only
 * favorites are, a provider switched off, a server that did not answer.
 * Zotero's own fallback then takes any voice for the language, its metered
 * Standard one included, and says nothing (issue #35). So the sync plans
 * against the list: the manager's own once loaded, or the one about to
 * land, which the plugin's getVoices hands to `reconcile` right before
 * returning it. A voice the list lacks is replaced, for that open only, by
 * the first Local voice the list offers (read-aloud-memory.ts
 * pickSubstitute), said out loud in the reader once per open; the memory
 * itself is not touched, so the voice comes back the moment a list offers
 * it again. `reconcile` runs no restore — the manager's `allVoices` still
 * holds the previous open's list at that moment (issue #37) — it stages
 * the manager for the resolution `loadVoices` runs once the list lands.
 *
 * The pref observer sees a pick only when Zotero's entry changed, and
 * Zotero.Prefs.set notifies nobody of an unchanged value: the popup
 * switching to a language with one voice re-persists the entry as it is.
 * So the popup's three picks — the manager's selectVoice, selectTier and
 * setLanguage with persist — are shadowed on the manager's prototype too
 * (each reader tab's bundle has its own class), and the voice the manager
 * settled on is learned there when the memory does not hold it yet.
 *
 * The internal reader exists once the iframe has rendered, so readers are
 * attached from the renderToolbar event and, as the safety net, from the
 * plugin's getVoices — which Zotero calls synchronously right before the
 * sync that matters.
 */

/** Zotero.Prefs.registerObserver takes names relative to `extensions.zotero.`. */
export const READ_ALOUD_VOICES_OBSERVER = 'reader.readAloudVoices';

export interface ReadAloudMemoryDeps {
  prefs: PrefsBackend;
  /** The "one voice everywhere" setting (`readAloud.sameForAllDocuments`), read on every use so the pane's checkbox applies at once. */
  sameVoice(): boolean;
  /** The "one speed everywhere" setting (`readAloud.globalSpeed`), read the same way; off, Zotero keeps a speed per document language. */
  globalSpeed(): boolean;
  /** What Zotero's resolveLanguage reads as `navigator.languages` when it picks among regional entries: a reader window's, since the sandbox has none. Absent or empty, Zotero's default regions decide. */
  preferredLanguages?(): readonly string[];
  registerObserver(name: string, handler: () => void): unknown;
  unregisterObserver(token: unknown): void;
  /** The readers currently open, so dispose() can restore what attach() patched. */
  readers(): unknown[];
  /**
   * Makes a sandbox function callable from the compartment of `target`
   * (Components.utils.exportFunction in Zotero). Optional for tests, which
   * run in one compartment.
   */
  exportFunction?(fn: SyncMethod, target: object): SyncMethod;
  /** Components.utils.waiveXrays for what the reader passes into an exported hook (`this`, the options object). Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /**
   * Copies Zotero's pref into the reader's own state
   * (`_state.readAloudVoices`), which Zotero's restore reads — what
   * Zotero's per-reader pref observer does (`_handleReadAloudVoicesPrefChange`).
   * Zotero.Prefs calls its observers in registration order, and a reader
   * opened after the plugin started registers after this sync: inside one
   * write of the pref this sync runs first, and the reader's copy is
   * still the old entry. A resync refreshes it before the restore.
   */
  refreshVoices?(reader: unknown): void;
  /** Every favorite voice id, switch or no switch: what a substitute prefers (read-aloud-memory.ts pickSubstitute). */
  favorites?(): readonly string[];
  /** Tells the user, in the reader, that Read Aloud is not starting with the remembered voice this time — a toast. */
  announce?(reader: unknown, message: string): void;
  /**
   * Components.utils.cloneInto into the reader's compartment, for the entry
   * staged as the manager's `_persistedVoices` (reconcile): the reader's
   * code destructures it, which it may not do to a sandbox object. Optional
   * for tests, which run in one compartment.
   */
  cloneForReader?(reader: unknown, value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface ReadAloudMemorySync {
  /** Patch a reader so the remembered choice is applied before Zotero restores its per-language one. Repeat calls are no-ops. */
  attach(reader: unknown): boolean;
  /** The memory as its pref holds it right now. */
  memory(): ReadAloudMemory;
  /**
   * Put `choice` in front of every other open reader that is reading right
   * now — the memory and Zotero's entry must already say it. The observer
   * calls this after learning a pick from a popup; the voice browser after
   * a row click (default-voice.ts). Nothing happens for null: a cleared
   * default leaves every reader as it is, and its next popup open restores
   * Zotero's own choice.
   */
  spreadVoice(choice: VoiceChoice | null): void;
  /**
   * Runs `fn` with the pref observer told that whatever it writes to
   * Zotero's `reader.readAloudVoices` is not a user's pick. Any code
   * outside a popup that rewrites that pref must go through here, or the
   * observer learns the write as a voice choice, moves the remembered
   * default to it and spreads it to every reading tab. The system
   * provider's id migration is such a write (ui/prefs-pane.ts) — caught
   * live on 2026-08-29, when enabling the provider silently replaced a
   * Kokoro default with a Windows voice.
   */
  applySilently<T>(fn: () => T): T;
  /** The language a reader's document is in, as far as the sync knows: the manager's, or the one the manager was moved to Multiple languages from. */
  documentLanguage(reader: unknown): string | null;
  /** A popup is opening on this reader — Zotero has asked for its voices: what this open has to say about a substitute starts afresh. */
  opening(reader: unknown): void;
  /**
   * The list this reader's popup is about to receive, from the plugin's
   * getVoices right before it returns it: the remembered voice is planned
   * against it — a substitute when it is not in it — and the manager is
   * staged for the resolution Zotero runs once the list lands. Nothing is
   * restored here: the manager's own list is still the previous open's.
   */
  reconcile(reader: unknown, voices: ListedVoices): void;
  /** Whether this reader's last sync started with a substitute: the voice that was not offered and the one put in its place (null: Zotero's own choice); null when the remembered voice was offered. */
  substitution(reader: unknown): Substitution | null;
  /** Prototypes held by the pick hooks, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  dispose(): void;
}

/** What getVoices hands to `reconcile`: the list as the reader will receive it, and the untrimmed one it is named from. */
export interface ListedVoices {
  /** Both halves, trimmed to the favorites while only those are offered. */
  offered: readonly ListedVoice[];
  /** The same before the trim: how a voice the favorites left out is named. */
  published: readonly ListedVoice[];
}

export interface Substitution {
  /** The remembered voice the list did not offer. */
  missing: string;
  /** The Local voice put in its place for this open; null when the list offered none and the choice was left to Zotero. */
  instead: string | null;
}

export type SyncMethod = (...args: unknown[]) => unknown;

const describeMemory = (m: ReadAloudMemory) =>
  `speed ${m.speed ?? '-'}, voice ${m.voice ? `${m.voice.id} (${m.voice.lang})` : '-'}`;

const managerLangOf = (manager: any): string | null => (typeof manager?.lang === 'string' && manager.lang ? manager.lang : null);

/** The region Zotero's entry for `lang` stores — the voice's own, as `_persistCurrentVoice` writes it. */
function entryRegion(voices: VoicesMap, lang: string, preferred: readonly string[]): string | null {
  const key = resolveVoiceLang(lang, Object.keys(voices), preferred) ?? lang;
  const region = voices[key]?.region;
  return typeof region === 'string' && region ? region : null;
}

/**
 * The manager's list as loaded at its popup's last open — id, the locale
 * each voice is filed under, tier and label, the fields Zotero's voice
 * classes expose — or null while it has none yet. The list lives in the
 * reader's compartment, so it is walked by index and only primitives are
 * read off it.
 */
function listedVoicesOf(manager: any): ListedVoice[] | null {
  const all = manager?.allVoices;
  const length = typeof all?.length === 'number' ? all.length : 0;
  if (!length) return null;
  const out: ListedVoice[] = [];
  for (let i = 0; i < length; i++) {
    const voice = all[i];
    const id = voice?.id;
    if (typeof id !== 'string' || !id) continue;
    out.push({
      id,
      language: typeof voice.language === 'string' ? voice.language : '',
      tier: typeof voice.tier === 'string' ? voice.tier : '',
      label: typeof voice.label === 'string' && voice.label ? voice.label : id,
    });
  }
  return out;
}

const listsVoice = (manager: any, id: string): boolean => listedVoicesOf(manager)?.some((voice) => voice.id === id) ?? false;

const validSpeed = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

export function createReadAloudMemorySync(deps: ReadAloudMemoryDeps): ReadAloudMemorySync {
  let snapshot = readReadAloudVoices(deps.prefs);
  const memory = () => readMemory(deps.prefs);
  const initial = memory();
  if (initial.speed === null && initial.voice === null) {
    const guessed = memoryFromVoices(snapshot);
    if (guessed.speed !== null || guessed.voice !== null) writeMemory(deps.prefs, guessed);
  }
  deps.debug?.(`read-aloud memory: ${describeMemory(memory())}`);

  // Our own pref writes come back through the observer too; they carry
  // nothing to learn.
  let applying = false;
  const token = deps.registerObserver(READ_ALOUD_VOICES_OBSERVER, () => {
    try {
      const before = snapshot;
      const next = readReadAloudVoices(deps.prefs);
      // Moved on before anything is written below: a reader persisting
      // inside a spread re-enters this observer, and the write after that
      // must be diffed against the state it started from, not this one
      snapshot = next;
      if (applying) return;
      const current = memory();
      const learned = noteVoicesChange(before, next, current);
      if (learned === current) return;
      writeMemory(deps.prefs, learned);
      deps.debug?.(`read-aloud memory: ${describeMemory(learned)}`);
      if (learned.speed !== null && learned.speed !== current.speed) spread(learned.speed);
      if (learned.voice && !sameChoice(learned.voice, current.voice)) spreadVoice(learned.voice);
    } catch (e) {
      deps.error(e);
    }
  });

  /** Runs `fn` with the observer above told that the pref writes inside are our own. Nests. */
  function whileApplying<T>(fn: () => T): T {
    const was = applying;
    applying = true;
    try {
      return fn();
    } finally {
      applying = was;
    }
  }

  /**
   * A speed Zotero has just persisted — the popup's slider, a shortcut —
   * reaches every other open reader at once and Zotero's entry for every
   * language: a reader already at the speed is left alone, an active one
   * persists as its own slider would, an idle one is never persisted
   * through (default-speed.ts). Under `applying`: a reader persisting here
   * comes back through the observer above with nothing to learn — the
   * fallback voice it persists then is not a choice.
   */
  function spread(speed: number): void {
    if (!deps.globalSpeed()) return;
    const managers: SpeedManagerLike[] = [];
    for (const reader of deps.readers()) {
      try {
        const manager = (reader as any)?._internalReader?._readAloudManager;
        if (manager && typeof manager.setSpeed === 'function') managers.push(manager);
      } catch (e) {
        deps.error(e);
      }
    }
    whileApplying(() => setDefaultSpeed(deps.prefs, speed, managers, deps.error));
    deps.debug?.(`spread read-aloud speed ${speed} to ${managers.length} reader(s)`);
  }

  /**
   * Per internal reader, where this sync moved its manager: from the
   * document's own language (as Zotero detected it, or as the user chose
   * it) to the remembered voice's lane. The `from` is kept across moves,
   * so a manager moved twice still knows its document's language; the
   * record is dropped once the manager is seen on any language other than
   * the one it was moved to (the user's dropdown), and never written for a
   * move the user made by hand.
   */
  const moved = new WeakMap<object, { from: string; to: string }>();
  const documentLanguageOf = (internal: object, managerLang: string | null): string | null => {
    const record = moved.get(internal);
    return record && record.to === managerLang ? record.from : managerLang;
  };

  /** The reader each internal reader belongs to (attach), for the announcement. */
  const owners = new WeakMap<object, unknown>();
  /** The untrimmed list the last reconcile carried, per internal reader: how a voice the favorites trimmed out is named. */
  const published = new WeakMap<object, readonly ListedVoice[]>();
  /** What the current popup open has announced, per internal reader (`missing>instead`), so the syncs within one open say it once. */
  const announced = new WeakMap<object, string>();
  const substitutions = new WeakMap<object, Substitution>();

  const originals = new WeakMap<object, SyncMethod>();
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);

  const labelOf = (internal: object, id: string, listed: readonly ListedVoice[]): string =>
    published.get(internal)?.find((voice) => voice.id === id)?.label ?? listed.find((voice) => voice.id === id)?.label ?? id;

  /**
   * The lane move: what Zotero's `setLanguage` sets (`_lang`, `_region`
   * cleared) and what `applyPersistedVoices` clears before it resolves
   * (`_voiceID`, `_selectedTier`), without a resolution of its own — the
   * restore that follows every move runs the one resolution, across every
   * tier. Through `setLanguage` the move was undone whenever the tier still
   * selected had no voice for the lane: its resolution runs against the
   * tier-filtered list, finds the language missing and resets it (issue
   * #36). The fields are Zotero's own, written through the manager reached
   * from this side, waived as system-voices.ts waives before it splices.
   */
  function moveLane(manager: any, lang: string): void {
    const m = waive(manager);
    m._lang = lang;
    m._region = null;
    m._voiceID = null;
    m._selectedTier = null;
  }

  /**
   * What this sync puts in front of Zotero's restore, and whether it
   * changed anything (the pref written, or the lane moved). `upcoming` is
   * the list about to land (reconcile); else the manager's own is planned
   * against once loaded, and while it is still loading the remembered
   * voice is taken as it is, as before.
   */
  function apply(internal: any, upcoming: readonly ListedVoice[] | null = null): { changed: boolean; lane: string | null } {
    const nothing = { changed: false, lane: null };
    // Each switch is read here, on every sync, so the pane's checkboxes apply at once
    const wanted = { voice: deps.sameVoice(), speed: deps.globalSpeed() };
    if (!wanted.voice) noteSubstitution(internal, null, null);
    if (!wanted.voice && !wanted.speed) return nothing;
    const manager = internal?._readAloudManager;
    if (!manager || typeof manager.setLanguage !== 'function') return nothing;
    const managerLang = managerLangOf(manager);
    const docLang = documentLanguageOf(internal, managerLang);
    // Only what is switched on is put in front of Zotero's restore; the rest is Zotero's per language
    const stored = memory();
    let voice = wanted.voice ? stored.voice : null;
    // The voice's tier as the list has it (a Zotero voice's is not in its id); null while the list is still loading
    let tier: string | null = null;
    let substitution: Substitution | null = null;
    let announcement: string | null = null;
    const listed = upcoming ?? listedVoicesOf(manager);
    if (voice && listed) {
      const remembered = voice;
      const found = listed.find((entry) => entry.id === remembered.id);
      if (found) {
        tier = found.tier || null;
      } else if (docLang) {
        // Not offered: a Local voice the list does offer takes its place for this open, and the user is told
        const pick = pickSubstitute(listed, deps.favorites?.() ?? [], docLang);
        substitution = { missing: remembered.id, instead: pick?.id ?? null };
        const base = memoryLangForLocale(docLang);
        const paidOffered = listed.some((entry) => entry.tier !== PLUGIN_TIER && memoryLangForLocale(entry.language) === base);
        announcement = substitutionMessage(labelOf(internal, remembered.id, listed), pick?.label ?? null, paidOffered);
        voice = pick ? { id: pick.id, lang: memoryLangForLocale(pick.language) } : null;
        tier = pick?.tier ?? null;
      }
    }
    const current: ReadAloudMemory = { speed: wanted.speed ? stored.speed : null, voice };
    const before = readReadAloudVoices(deps.prefs);
    const preferred = deps.preferredLanguages?.() ?? [];
    const plan = planSync(docLang, before, current, tier, preferred);
    if (plan.voices) whileApplying(() => deps.prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify(plan.voices)));
    if (plan.lang === null) return { changed: !!plan.voices, lane: null };
    let switching = plan.lang !== managerLang;
    // A region the popup's dropdown left on the manager ("Chinese
    // (Taiwan)") makes Zotero's restore skip the entry's voice when the
    // entry names another region (_findFallbackVoice's regionChanged) — so
    // for a voice on its own language the region is cleared, the way
    // Zotero's own inactive-manager path calls setLanguage(lang) with none.
    if (!switching && current.voice && current.voice.lang === plan.lang) {
      const region = typeof manager.region === 'string' && manager.region ? manager.region : null;
      if (region && region !== entryRegion(plan.voices ?? before, plan.lang, preferred)) switching = true;
    }
    if (switching) moveLane(manager, plan.lang);
    if (!switching) {
      const record = moved.get(internal);
      if (record && record.to !== managerLang) moved.delete(internal);
    } else if (plan.lang === docLang) {
      moved.delete(internal);
    } else if (docLang) {
      moved.set(internal, { from: docLang, to: plan.lang });
    }
    if (wanted.voice) noteSubstitution(internal, substitution, announcement);
    if (plan.voices || switching) {
      deps.debug?.(`applied read-aloud memory: ${managerLang} -> ${plan.lang}, ${describeMemory(current)}`);
    }
    return { changed: !!plan.voices || switching, lane: plan.lang };
  }

  /** This sync's substitution, kept for the diagnostics and announced once per popup open; none clears both. */
  function noteSubstitution(internal: object, substitution: Substitution | null, announcement: string | null): void {
    if (!substitution) {
      substitutions.delete(internal);
      announced.delete(internal);
      return;
    }
    substitutions.set(internal, substitution);
    const key = `${substitution.missing}>${substitution.instead ?? ''}`;
    if (announced.get(internal) === key) return;
    announced.set(internal, key);
    deps.debug?.(
      `read-aloud memory: ${substitution.missing} is not offered by this reader's list; ` +
        (substitution.instead ? `starting ${substitution.instead} instead` : "no Local voice is either, so Zotero's own choice stands"),
    );
    const reader = owners.get(internal);
    if (reader && announcement) deps.announce?.(reader, announcement);
  }

  /**
   * The manager staged for the resolution `loadVoices` runs once the list
   * lands: what `_syncPersistedVoicesToManager` and `applyPersistedVoices`
   * would set, minus the resolution — the lane's entry as
   * `_persistedVoices` (cloned into the reader's compartment), the voice
   * and the tier cleared, the entry's speed. The entry is the one Zotero's
   * own restore would read for the lane (resolveVoiceLang, issue #26).
   */
  function stage(reader: unknown, internal: any, lane: string): void {
    const manager = internal._readAloudManager;
    const voices = readReadAloudVoices(deps.prefs);
    const preferred = deps.preferredLanguages?.() ?? [];
    const key = resolveVoiceLang(lane, Object.keys(voices), preferred) ?? lane;
    const entry = voices[key] ?? {};
    const m = waive(manager);
    m._persistedVoices = deps.cloneForReader ? deps.cloneForReader(reader, entry) : entry;
    m._voiceID = null;
    m._selectedTier = null;
    if (validSpeed(entry.speed) && typeof manager.setSpeed === 'function') manager.setSpeed(entry.speed);
    deps.debug?.(`staged read-aloud memory for the list about to land: ${lane}, voice ${typeof entry.voice === 'string' ? entry.voice : '-'}`);
  }

  function reconcile(reader: any, voices: ListedVoices): void {
    const internal = reader?._internalReader;
    if (!internal || !internal._readAloudManager) return;
    try {
      attach(reader);
      published.set(internal, voices.published);
      const result = apply(internal, voices.offered);
      if (result.changed && result.lane !== null) stage(reader, internal, result.lane);
    } catch (e) {
      deps.error(e);
    }
  }

  function opening(reader: any): void {
    const internal = reader?._internalReader;
    if (internal) announced.delete(internal);
  }

  function substitution(reader: any): Substitution | null {
    const internal = reader?._internalReader;
    return (internal && substitutions.get(internal)) || null;
  }

  /**
   * The voice a manager settled on after one of the popup's picks, learned
   * when the memory does not hold it yet, and spread. Whenever the pick
   * changed Zotero's entry, the observer above learned it inside the
   * persist and this finds the memory there already; this is for the pick
   * that changed nothing there. Under `applying` — our own resyncs move
   * managers through the same methods — nothing is a pick.
   */
  function notePick(manager: any): void {
    if (applying) return;
    const id = manager?.selectedVoiceID;
    const lang = managerLangOf(manager);
    if (typeof id !== 'string' || !id || !lang) return;
    const current = memory();
    const choice = { id, lang };
    if (sameChoice(choice, current.voice)) return;
    const learned = { ...current, voice: choice };
    writeMemory(deps.prefs, learned);
    deps.debug?.(`read-aloud memory (a pick the pref did not show): ${describeMemory(learned)}`);
    spreadVoice(choice);
  }

  const PICKS = ['selectVoice', 'selectTier', 'setLanguage'] as const;
  const pickPatches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });

  /**
   * The popup's three picks, shadowed where Zotero defined them — the
   * manager's prototype, one per reader tab bundle (system-voices.ts does
   * the same to `_resolveVoice`). `setLanguage` counts only with
   * `persist`: Zotero's own calls and this sync's pass none. `this` and the
   * options object arrive behind Xray wrappers and are waived.
   */
  function attachPicks(manager: any): void {
    const proto = manager ? ownerOf(manager, 'selectVoice') : null;
    if (!proto || pickPatches.has(proto)) return;
    for (const name of PICKS) {
      if (typeof proto[name] !== 'function') continue;
      pickPatches.shadow(proto, name, (original) =>
        function (this: any, ...args: unknown[]) {
          const result = Reflect.apply(original, this, args);
          try {
            const persist = name !== 'setLanguage' || !!waive(args[1])?.persist;
            if (persist) notePick(waive(this));
          } catch (e) {
            deps.error(e);
          }
          return result;
        },
      );
    }
  }

  /**
   * The wrapper's own sequence, run from our side: the reader's copy of the
   * pref brought up to date (its own observer may not have run yet — see
   * refreshVoices), the memory in place, then Zotero's restore.
   */
  function resync(reader: unknown, internal: any): void {
    deps.refreshVoices?.(reader);
    apply(internal);
    const original = originals.get(internal) ?? internal?._syncPersistedVoicesToManager;
    if (typeof original === 'function') Reflect.apply(original, internal, []);
  }

  /**
   * Zotero's own restore, run again on every other reader that is reading
   * (`active`; paused counts) once the memory and Zotero's entry say the
   * voice. Zotero's `applyPersistedVoices` clears the manager's voice and
   * tier and resolves from the entry, and `_applyVoice` recreates the
   * controller from the current sentence with the pace and the pause kept
   * — so a reader already on the voice (the one whose popup picked it) is
   * skipped, or its sentence would restart. `selectVoice` is not the tool:
   * it wants the voice in the tier-filtered pool of the manager's language
   * and destroys the controller otherwise, and on an idle manager its
   * persist activates the manager (audio with the popup closed). An idle
   * reader needs nothing here — its next popup open runs the wrapper. The
   * voice reaches every reader whatever its document's language — each is
   * moved to the voice's lane by `apply()`. A reader whose voice list
   * lacks the voice (loaded at its popup's open; Zotero's own voices are in
   * it only while signed in) is skipped: Zotero's restore would land on a
   * fallback and move the reader to some other voice.
   */
  function spreadVoice(choice: VoiceChoice | null): void {
    if (!choice || !deps.sameVoice()) return;
    const outcome: string[] = [];
    whileApplying(() => {
      for (const reader of deps.readers()) {
        try {
          const internal = (reader as any)?._internalReader;
          const manager = internal?._readAloudManager;
          if (!manager || !manager.active) continue;
          if (manager.selectedVoiceID === choice.id) continue;
          const docLang = documentLanguageOf(internal, managerLangOf(manager));
          if (!listsVoice(manager, choice.id)) {
            outcome.push(`${docLang}: does not list it until its popup reopens`);
            continue;
          }
          resync(reader, internal);
          outcome.push(`${docLang}: resynced`);
        } catch (e) {
          deps.error(e);
        }
      }
    });
    deps.debug?.(`spread read-aloud voice ${choice.id} (${choice.lang}): ${outcome.join('; ') || 'no other reader is reading'}`);
  }

  function documentLanguage(reader: unknown): string | null {
    const internal = (reader as any)?._internalReader;
    return internal ? documentLanguageOf(internal, managerLangOf(internal._readAloudManager)) : null;
  }

  function attach(reader: any): boolean {
    const internal = reader?._internalReader;
    if (!internal || typeof internal._syncPersistedVoicesToManager !== 'function') return false;
    owners.set(internal, reader);
    try {
      attachPicks(internal._readAloudManager);
    } catch (e) {
      deps.error(e);
    }
    if (originals.has(internal)) return true;
    const original = internal._syncPersistedVoicesToManager as SyncMethod;
    // `internal` rather than `this`: what the reader's compartment passes as
    // `this` through the export is not something to rely on. Reflect.apply
    // rather than original.apply: the latter is the reader compartment's
    // Function.prototype.apply, which may not read `args`, an array that
    // lives in the plugin sandbox ("Permission denied to access property
    // length"). Reflect.apply reads it here and hands the values over one
    // by one.
    const wrapper: SyncMethod = (...args) => {
      try {
        apply(internal);
      } catch (e) {
        deps.error(e);
      }
      return Reflect.apply(original, internal, args);
    };
    internal._syncPersistedVoicesToManager = deps.exportFunction ? deps.exportFunction(wrapper, internal) : wrapper;
    originals.set(internal, original);
    return true;
  }

  function dispose(): void {
    deps.unregisterObserver(token);
    pickPatches.restoreAll();
    for (const reader of deps.readers()) {
      try {
        const internal = (reader as any)?._internalReader;
        const original = internal && originals.get(internal);
        if (original) {
          internal._syncPersistedVoicesToManager = original;
          originals.delete(internal);
        }
      } catch (e) {
        deps.error(e);
      }
    }
  }

  return {
    attach,
    memory,
    spreadVoice,
    applySilently: whileApplying,
    documentLanguage,
    opening,
    reconcile,
    substitution,
    patchCounts: pickPatches.counts,
    dispose,
  };
}
