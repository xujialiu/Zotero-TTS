/**
 * A voice picked while a document is read goes through the Handoff
 * (core/engine/handoff.ts) instead of restarting the sentence: the player's
 * voice dropdown, its provider and language dropdowns while playing, the
 * voice keys (issues #95, #108, #110).
 *
 * The manager's `selectVoice`, `selectTier` and `setLanguage` are shadowed
 * on the manager itself. A pick is first resolved the manager's own way —
 * its fallbacks and the plugin's language memory choose the voice — as a
 * dry run: `_applyVoice`, `_persistCurrentVoice` and `_stateChanged` held
 * back, the choice fields put back after. The voice it comes to is then
 * prepared by the Engine while the old one reads on, and once the new
 * voice has the reading the pick is replayed for real (`commit`): the
 * manager selects the voice, remembers it, and its rebuild of the
 * controller carries on in the Engine. A provider or language pick while
 * paused is left to Zotero as it is: the lists must follow it at once, and
 * Play then starts the sentence over with the new voice (issue #110).
 *
 * While a switch is pending, the manager's calls that call it off —
 * deactivate, a skip, a speed change, a jump, new segments, the memory
 * re-applied — cancel it first, and its `pause` and `play` go through the
 * Handoff, which decides where the new voice starts on Play.
 *
 * What moved out, with read-aloud/voice-switch.ts: the second controller of
 * Read Aloud's the switch was prepared in, and the sixteen of its fields it
 * was driven through (ADR 0005).
 */

import type { HandoffReport, VoiceNotice } from '../../core/engine/handoff';
import { adjacentVoice, playerVoices } from '../../core/voice-switch';
import type { AnyFn } from '../proto-patches';
import type { Engine } from './index';

export type { VoiceNotice } from '../../core/engine/handoff';

export interface VoicePickDeps {
  engine: Engine;
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  waiveXrays?<T>(value: T): T;
  isDead?(value: unknown): boolean;
  notice(reader: unknown, kind: VoiceNotice, label: string): void;
  error(error: unknown): void;
  debug?(message: string): void;
  /** An AbortController of the reader's window: the sandbox has none. */
  newAbortController?(reader: any): { signal: unknown; abort(): void } | null;
}

export interface VoicePickReport extends HandoffReport {
  controlsAttached: boolean;
  notice?: VoiceNotice;
}

export interface VoicePick {
  attach(reader: unknown): boolean;
  detach(reader: unknown): void;
  /** Whether a pick of this reader is being resolved as a dry run (memory-sync holds back meanwhile). */
  isPreviewing(reader: unknown): boolean;
  /** The voice keys: the previous or next voice of the player's list. */
  step(reader: unknown, direction: -1 | 1): void;
  /** The memory layer's own cross-language restore, as the final selection of a switch. */
  defer(reader: unknown, voiceID: string, selection: () => void): boolean;
  inspect(reader: unknown): VoicePickReport | null;
  /** The voices a pending switch is between (the reading guard, issue #121). */
  protectedVoices(reader: unknown): string[];
  dispose(): void;
}

/** The manager's calls that call a pending switch off, before they run. */
const CANCELLING = ['deactivate', 'applyPersistedVoices', 'skipBack', 'skipAhead', 'setSpeed', 'jumpTo', 'repositionTo', 'clearSegments'];

/** The manager fields a dry-run resolution may move, put back after it. */
const CHOICE_FIELDS = ['_voiceID', '_lang', '_region', '_selectedTier', '_persistedVoices', '_pendingSetVoice'] as const;

export function createVoicePick(deps: VoicePickDeps): VoicePick {
  const reports = new WeakMap<object, VoicePickReport>();
  const attached = new Map<any, { manager: any; undo: (() => void)[] }>();
  /** Per reader, the shadows a pending switch put on the manager. */
  const pendingUndo = new Map<unknown, (() => void)[]>();
  const previewing = new Set<unknown>();
  let propagating = 0;
  const select = (fn: () => void) => {
    propagating++;
    try {
      fn();
    } finally {
      propagating--;
    }
  };
  const waive = <T>(value: T): T => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const exported = (fn: AnyFn, target: object) => (deps.exportFunction ? deps.exportFunction(fn, target) : fn);
  const managerOf = (reader: any) => waive(reader?._internalReader?._readAloudManager);
  const label = (voice: any) => String(voice?.label ?? voice?.id ?? '');

  function reportOf(reader: unknown): VoicePickReport | null {
    return reader && typeof reader === 'object' ? (reports.get(reader) ?? null) : null;
  }

  function notice(reader: unknown, kind: VoiceNotice, text: string): void {
    const report = reportOf(reader);
    if (report) report.notice = kind;
    try {
      deps.notice(reader, kind, text);
    } catch (e) {
      deps.error(e);
    }
  }

  function snapshot(manager: any): () => void {
    const descriptors = CHOICE_FIELDS.map((key) => Object.getOwnPropertyDescriptor(manager, key));
    return () =>
      CHOICE_FIELDS.forEach((key, i) => {
        if (descriptors[i]) Object.defineProperty(manager, key, descriptors[i]!);
        else delete manager[key];
      });
  }

  /** An own-property shadow on the manager; the undo restores the descriptor, absence included. */
  function shadow(object: any, name: string, fn: AnyFn): () => void {
    const previous = Object.getOwnPropertyDescriptor(object, name);
    object[name] = exported(fn, object);
    return () => {
      if (deps.isDead?.(object)) return;
      if (previous) Object.defineProperty(object, name, previous);
      else delete object[name];
    };
  }

  function attach(reader: unknown): boolean {
    const manager = managerOf(reader);
    if (!manager) return false;
    if (attached.get(reader)?.manager === manager) return true;
    detach(reader);
    const undo: (() => void)[] = [];
    attached.set(reader, { manager, undo });
    if (reader && typeof reader === 'object') {
      reports.set(reader, {
        ...(reports.get(reader) ?? { pending: null, stage: 'idle', prepared: [], last: null, wordDecision: null, audioReady: [] }),
        controlsAttached: true,
      });
    }
    try {
      for (const name of ['selectVoice', 'selectTier', 'setLanguage']) {
        const original = manager[name];
        if (typeof original !== 'function') continue;
        undo.push(
          shadow(manager, name, function (this: any, ...args: any[]) {
            // A provider or language pick while paused goes the native way, so the
            // player's lists follow it at once (issue #110); on Play the sentence
            // starts over, as Zotero's own does. A voice pick keeps the paused
            // handoff of issue #108.
            if (
              propagating ||
              previewing.has(reader) ||
              !manager.active ||
              (name === 'setLanguage' && !waive(args[1])?.persist) ||
              (name !== 'selectVoice' && manager.paused)
            ) {
              return Reflect.apply(original, manager, args);
            }
            const restore = snapshot(manager);
            const suppress: (() => void)[] = [];
            let choice: (() => void) | undefined;
            let id: string | undefined;
            previewing.add(reader);
            try {
              // Native resolution and the language memory choose; no controller,
              // persistence or UI sees this dry run
              for (const method of ['_applyVoice', '_persistCurrentVoice', '_stateChanged']) {
                suppress.push(shadow(manager, method, () => {}));
              }
              Reflect.apply(original, manager, args);
              id = manager.selectedVoiceID;
              choice = snapshot(manager);
            } finally {
              for (const put of suppress.reverse()) put();
              restore();
              previewing.delete(reader);
            }
            const target = playerVoices<any>(manager.allVoices).find((v) => v.id === id);
            if (!target) {
              notice(reader, 'unavailable', '');
              return;
            }
            const selection = () => {
              choice!();
              // The manager's own selection: the voice, the tier, the memory, and a rebuild that carries on
              Reflect.apply(manager.selectVoice, manager, [id]);
            };
            if (id === manager.selectedVoiceID) {
              // A re-pick of the voice reading calls a pending switch off and restarts nothing
              deps.engine.session(reader)?.handoff?.cancel();
              select(selection);
              notice(reader, 'selected', label(target));
              return;
            }
            begin(reader, target, selection);
          }),
        );
      }
      return true;
    } catch (e) {
      detach(reader);
      deps.error(e);
      return false;
    }
  }

  /** Take a pending switch's shadows off the manager; with `only`, just when they are that switch's. */
  function unwindPending(reader: unknown, only?: (() => void)[]): void {
    if (only && pendingUndo.get(reader) !== only) return;
    for (const undo of (pendingUndo.get(reader) ?? []).reverse()) {
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    pendingUndo.delete(reader);
  }

  /** Prepare `target` to take the reading over; false when there is no reading to switch. */
  function begin(reader: any, target: any, selection: () => void): boolean {
    const manager = managerOf(reader);
    const session = deps.engine.session(reader);
    const existing = session?.handoff;
    if (existing && existing.target.id === target.id) {
      existing.retarget(() => select(selection));
      return true;
    }
    if (!manager?.active) return false;
    if (!session || session.ended || !manager.segments?.length) {
      existing?.cancel();
      notice(reader, 'unavailable', label(target));
      return true;
    }
    if (target.segmentGranularity !== manager.segmentGranularity) {
      existing?.cancel();
      deps.error(new Error('Zotero-TTS: pause before switching between different segment granularities'));
      notice(reader, 'failed', label(target));
      return true;
    }
    unwindPending(reader);
    const originalVoice = manager.selectedVoiceID;
    const catalog = manager.allVoices;
    const last = reportOf(reader)?.last ?? null;
    const report: VoicePickReport = {
      controlsAttached: attached.has(reader),
      pending: String(target.id),
      stage: 'preparing',
      prepared: [],
      last,
      wordDecision: null,
      audioReady: [],
    };
    if (reader && typeof reader === 'object') reports.set(reader, report);
    let abort: { signal: unknown; abort(): void } | null = null;
    try {
      abort = deps.newAbortController?.(reader) ?? null;
    } catch (e) {
      deps.error(e);
    }
    const undo: (() => void)[] = [];
    const handoff = session.prepareHandoff({
      target: deps.engine.voiceOf(target),
      commit: () => {
        unwindPending(reader, undo);
        select(selection);
      },
      valid: () => !deps.isDead?.(manager) && manager.active && manager.selectedVoiceID === originalVoice && manager.allVoices === catalog,
      notice: (kind) => {
        if (kind === 'cancelled' || kind === 'failed') unwindPending(reader, undo);
        notice(reader, kind, label(target));
      },
      abort,
      report,
    });
    if (!handoff) {
      notice(reader, 'unavailable', label(target));
      return true;
    }
    // Manual actions call the switch off before they change playback
    pendingUndo.set(reader, undo);
    try {
      for (const name of CANCELLING) {
        const original = manager[name];
        if (typeof original !== 'function') continue;
        undo.push(
          shadow(manager, name, function (this: unknown, ...args: unknown[]) {
            handoff.cancel();
            return Reflect.apply(original, this, args);
          }),
        );
      }
      const pause = manager.pause;
      if (typeof pause === 'function') {
        undo.push(
          shadow(manager, 'pause', function (this: unknown, ...args: unknown[]) {
            let result: unknown;
            handoff.pause(() => {
              result = Reflect.apply(pause, manager, args);
            });
            return result;
          }),
        );
      }
      const play = manager.play;
      if (typeof play === 'function') {
        undo.push(
          shadow(manager, 'play', function (this: unknown, ...args: unknown[]) {
            let result: unknown;
            handoff.play(() => {
              result = Reflect.apply(play, manager, args);
            });
            return result;
          }),
        );
      }
    } catch (e) {
      handoff.fail(e);
    }
    return true;
  }

  function step(reader: unknown, direction: -1 | 1): void {
    try {
      attach(reader);
      const manager = managerOf(reader);
      if (!manager?.active) return;
      const list = playerVoices<any>(manager.voicesForLanguage);
      const requested = deps.engine.session(reader)?.handoff?.target.id;
      const selected = list.some((v) => v.id === requested) ? requested! : manager.selectedVoiceID;
      const voice = adjacentVoice(list, selected, direction);
      if (!voice) {
        if (!list.some((v) => v.id === selected)) notice(reader, 'unavailable', '');
        return;
      }
      if (voice.id === manager.selectedVoiceID) {
        deps.engine.session(reader)?.handoff?.cancel();
        notice(reader, 'selected', label(voice));
        return;
      }
      const selection = () => Reflect.apply(manager.selectVoice, manager, [voice.id]);
      if (!begin(reader, voice, selection)) {
        select(selection);
        notice(reader, 'selected', label(voice));
      }
    } catch (e) {
      deps.error(e);
      notice(reader, 'failed', '');
    }
  }

  function detach(reader: unknown): void {
    const handoff = deps.engine.session(reader)?.handoff;
    handoff?.cancel();
    unwindPending(reader);
    const entry = attached.get(reader);
    if (!entry) return;
    if (!handoff) notice(reader, 'cancelled', '');
    for (const undo of entry.undo.reverse()) {
      try {
        undo();
      } catch (e) {
        deps.error(e);
      }
    }
    attached.delete(reader);
    const report = reportOf(reader);
    if (report) report.controlsAttached = false;
  }

  return {
    attach,
    detach,
    isPreviewing: (reader) => previewing.has(reader),
    step,
    defer(reader, voiceID, selection) {
      if (!propagating) return false;
      const manager = managerOf(reader);
      if (!manager?.active) return false;
      const voice = playerVoices<any>(manager.allVoices).find((v) => v.id === voiceID);
      return voice ? begin(reader, voice, selection) : false;
    },
    inspect: (reader) => reportOf(reader),
    protectedVoices(reader) {
      const handoff = deps.engine.session(reader)?.handoff;
      return handoff?.pending ? handoff.voices : [];
    },
    dispose() {
      for (const reader of [...attached.keys()]) detach(reader);
      for (const reader of [...pendingUndo.keys()]) unwindPending(reader);
    },
  };
}
