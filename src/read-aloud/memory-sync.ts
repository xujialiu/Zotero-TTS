import { READ_ALOUD_VOICES_PREF, readReadAloudVoices } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import { setDefaultSpeed, type SpeedManagerLike } from './default-speed';
import { memoryFromVoices, noteVoicesChange, planSync, readMemory, writeMemory, type ReadAloudMemory } from './read-aloud-memory';

/**
 * Wires read-aloud-memory.ts to Zotero. The memory lives in its pref
 * (`readAloud.memory`), which is read on every use and never copied: the
 * voice browser writes it too (default-speed.ts), and on a fresh install
 * Zotero's pref has no entry whose change could carry the news here — a
 * copy would be stale exactly when the memory is the only thing that moved.
 * Two hooks:
 *
 * - A pref observer on `reader.readAloudVoices` learns the speed and voice
 *   from what Zotero persists on the user's actions. A speed learned there
 *   is global while `globalSpeed` is on: it is spread at once to every
 *   other open reader (the popup's slider in one tab moves the pace in the
 *   others) and to Zotero's entry for every language, through the routine
 *   the pane's slider uses (default-speed.ts).
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
 * The internal reader exists once the iframe has rendered, so readers are
 * attached from the renderToolbar event and, as the safety net, from the
 * plugin's getVoices — which Zotero calls synchronously right before the
 * sync that matters.
 */

/** Zotero.Prefs.registerObserver takes names relative to `extensions.zotero.`. */
export const READ_ALOUD_VOICES_OBSERVER = 'reader.readAloudVoices';

export interface ReadAloudMemoryDeps {
  prefs: PrefsBackend;
  /** The "same voice for every document" setting (`readAloud.sameForAllDocuments`), read on every use so the pane's checkbox applies at once. */
  sameVoice(): boolean;
  /** The "one speed everywhere" setting (`readAloud.globalSpeed`), read the same way; off, Zotero keeps a speed per document language. */
  globalSpeed(): boolean;
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
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface ReadAloudMemorySync {
  /** Patch a reader so the remembered choice is applied before Zotero restores its per-language one. Repeat calls are no-ops. */
  attach(reader: unknown): boolean;
  /** The memory as its pref holds it right now. */
  memory(): ReadAloudMemory;
  dispose(): void;
}

export type SyncMethod = (...args: unknown[]) => unknown;

const describeMemory = (m: ReadAloudMemory) =>
  `speed ${m.speed ?? '-'}, voice ${m.voice ? `${m.voice.id} (${m.voice.lang})` : '-'}`;

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
      // inside spread() re-enters this observer, and the write after that
      // must be diffed against the state it started from, not this one
      snapshot = next;
      if (applying) return;
      const current = memory();
      const learned = noteVoicesChange(before, next, current);
      if (learned === current) return;
      writeMemory(deps.prefs, learned);
      deps.debug?.(`read-aloud memory: ${describeMemory(learned)}`);
      if (learned.speed !== null && learned.speed !== current.speed) spread(learned.speed);
    } catch (e) {
      deps.error(e);
    }
  });

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
    applying = true;
    try {
      setDefaultSpeed(deps.prefs, speed, managers, deps.error);
    } finally {
      applying = false;
    }
    deps.debug?.(`spread read-aloud speed ${speed} to ${managers.length} reader(s)`);
  }

  function apply(internal: any): void {
    // Each switch is read here, on every sync, so the pane's checkboxes apply at once
    const wanted = { voice: deps.sameVoice(), speed: deps.globalSpeed() };
    if (!wanted.voice && !wanted.speed) return;
    const manager = internal?._readAloudManager;
    if (!manager || typeof manager.setLanguage !== 'function') return;
    const managerLang = typeof manager.lang === 'string' && manager.lang ? manager.lang : null;
    // Only what is switched on is put in front of Zotero's restore; the rest is Zotero's per language
    const stored = memory();
    const current: ReadAloudMemory = { speed: wanted.speed ? stored.speed : null, voice: wanted.voice ? stored.voice : null };
    const plan = planSync(managerLang, readReadAloudVoices(deps.prefs), current);
    if (plan.voices) {
      applying = true;
      try {
        deps.prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify(plan.voices));
      } finally {
        applying = false;
      }
    }
    const switching = plan.lang !== null && plan.lang !== managerLang;
    if (switching) manager.setLanguage(plan.lang);
    if (plan.voices || switching) {
      deps.debug?.(`applied read-aloud memory: ${managerLang} -> ${plan.lang}, ${describeMemory(current)}`);
    }
  }

  const originals = new WeakMap<object, SyncMethod>();

  function attach(reader: any): boolean {
    const internal = reader?._internalReader;
    if (!internal || typeof internal._syncPersistedVoicesToManager !== 'function') return false;
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

  return { attach, memory, dispose };
}
