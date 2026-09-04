/**
 * The pause between sentences, and the extra one where a paragraph
 * begins, set by the user for every voice in the player (issue #44).
 *
 * Zotero waits a fixed number of milliseconds before speaking the next
 * segment. When one ends, `_handleSegmentEnd` advances the position, takes
 * the voice's `sentenceDelay`, adds `DELAY_PARAGRAPH` (200) when the
 * upcoming segment is a paragraph's first, and hands the sum to
 * `_scheduleSpeak(delay)` — a plain setTimeout (reader.js:39503-39507,
 * 39404, 39296; verified on 10.0.2-beta.5). `sentenceDelay` is not a
 * constant: it is a per-config field of the voices response that zotero.org
 * sends, 300 on a hand-picked few Premium voices and absent (so 0)
 * everywhere else, the plugin's own voices included (voice-catalog.ts
 * publishes 0). No setting of Zotero's touches either number, and neither
 * follows the playback speed while the audio itself is time-stretched — at
 * 2× a sentence halves and the gap does not.
 *
 * So the plugin shadows `_scheduleSpeak` on the controller's prototype and
 * recomputes the one number it receives. Zotero still ends the segment,
 * advances the position, decides the paragraph case and runs the timer.
 * The sentence part is the setting divided by the speed while its switch
 * is on, else the voice's own `sentenceDelay`; the paragraph part, only
 * when the upcoming segment carries `anchor: 'paragraphStart'` (the test
 * Zotero itself makes, read after Zotero has advanced the position), is
 * the setting divided by the speed while on, else what Zotero added —
 * the scheduled delay minus the voice's own. Both switches off, the number
 * goes through untouched. The settings are read on every boundary, so a
 * change in the pane lands on the next sentence in every open tab, a
 * reading one included; nothing about the voice list changes, so the
 * reading guard of issue #11 has no part here.
 *
 * The controller class is private to the reader bundle and an instance
 * exists only while a session is open, so the prototype is reached through
 * one: the manager's `_createController` (reader.js:82366) is shadowed per
 * tab and patches the controller's prototype from the first controller it
 * builds; a controller already running when attach happens — an in-place
 * upgrade under a paused session (issue #38) — is patched at attach. Each
 * tab has its own copy of both classes, so both patches are per tab,
 * deduplicated and undone by the shared undo log (proto-patches.ts).
 *
 * Compartment rules as in system-voices.ts: the wrappers are exported into
 * the reader's compartment, `this` arrives Xray-wrapped and is waived
 * before a prototype getter (`voice`, `speed`, `_currentSegment`) is read,
 * the originals run through Reflect.apply, and only a primitive — the
 * number of milliseconds — crosses back.
 */

import type { Settings } from '../core/settings';
import { createProtoPatches } from './proto-patches';
import { ownerOf } from './system-voices';

type AnyFn = (...args: any[]) => any;

/** Zotero's own extra before a paragraph, `DELAY_PARAGRAPH` (reader.js:39296); the diagnostic's "what a paragraph boundary would get" assumes it. */
export const ZOTERO_PARAGRAPH_MS = 200;

export interface PauseSetting {
  enabled: boolean;
  /** At 1× speed, in milliseconds. */
  ms: number;
}

export interface PauseSettings {
  sentence: PauseSetting;
  paragraph: PauseSetting;
}

/** The two pause settings as the pane stores them (core/settings.ts). */
export function pauseSettingsOf(readAloud: Settings['readAloud']): PauseSettings {
  return {
    sentence: { enabled: readAloud.sentenceDelayEnabled, ms: readAloud.sentenceDelayMs },
    paragraph: { enabled: readAloud.paragraphDelayEnabled, ms: readAloud.paragraphDelayMs },
  };
}

export interface GapInput {
  /** What Zotero handed `_scheduleSpeak`: the voice's `sentenceDelay`, plus its paragraph extra before a paragraph. */
  scheduled: number;
  /** The voice's own `sentenceDelay`, as the catalog published it. */
  nativeSentence: number;
  /** Whether the upcoming segment begins a paragraph. */
  paragraph: boolean;
  /** The playback speed; anything that is not a positive number counts as 1×. */
  speed: number;
  settings: PauseSettings;
}

const finite = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

/**
 * The milliseconds to wait before the next segment. Pure, and the one
 * place the arithmetic lives: the shadow and the diagnostic both call it.
 */
export function computeGap(input: GapInput): number {
  const speed = finite(input.speed, 1) > 0 ? finite(input.speed, 1) : 1;
  const native = Math.max(0, finite(input.nativeSentence, 0));
  const scheduled = Math.max(0, finite(input.scheduled, native));
  const sentence = input.settings.sentence.enabled ? Math.max(0, finite(input.settings.sentence.ms, 0)) / speed : native;
  let paragraph = 0;
  if (input.paragraph) {
    paragraph = input.settings.paragraph.enabled ? Math.max(0, finite(input.settings.paragraph.ms, 0)) / speed : Math.max(0, scheduled - native);
  }
  return Math.round(sentence + paragraph);
}

/** The last gap the shadow scheduled in a tab: what Zotero's timer actually received, and from what. */
export interface LastGap {
  scheduled: number;
  delay: number;
  paragraph: boolean;
  speed: number;
  nativeSentence: number;
  /** Milliseconds since the epoch. */
  at: number;
}

export interface PausesDeps {
  /** The settings, read on every boundary — never cached, so the pane applies at once. */
  getSettings(): PauseSettings;
  /** Makes a sandbox function callable from the reader's compartment (Components.utils.exportFunction). Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays for what the reader passes into the exported wrappers. Optional for tests. */
  waiveXrays?(value: unknown): unknown;
  /** Components.utils.isDeadWrapper, so a closed tab's prototype is skipped instead of throwing (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
  /** Milliseconds since the epoch, for `LastGap.at`; Date.now by default. */
  now?(): number;
}

export interface Pauses {
  /**
   * Shadow the reader's manager, and its running controller if there is
   * one; true once the manager is patched. Repeat calls are cheap no-ops,
   * so this may be called on every voices request.
   */
  attach(reader: unknown): boolean;
  /**
   * What this module sees in a reader, as plain data, for
   * `Zotero.ZoteroTTS.diagnostics.pauses()`: which of the two prototypes
   * are patched, the settings, the speed, the selected voice's own delay,
   * the gaps a sentence boundary and a paragraph boundary would get right
   * now, and the last gap actually scheduled with a count — the number
   * Zotero's timer received, which is what proves the path ran.
   */
  inspect(reader: unknown): Record<string, unknown>;
  /** Prototypes held, and how many of them a closed tab has not taken with it. */
  patchCounts(): { total: number; live: number };
  /** Put every patched prototype back. */
  dispose(): void;
}

interface TabState {
  last: LastGap | null;
  count: number;
}

export function createPauses(deps: PausesDeps): Pauses {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const waive = (value: unknown): any => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  const now = deps.now ?? (() => Date.now());
  // Per manager, so a tab's record dies with the tab
  const states = new WeakMap<object, TabState>();

  function stateOf(manager: object): TabState {
    let state = states.get(manager);
    if (!state) {
      state = { last: null, count: 0 };
      states.set(manager, state);
    }
    return state;
  }

  /** Shadow `_scheduleSpeak` on the prototype behind this controller; true once it is. */
  function patchController(controller: unknown, state: TabState): boolean {
    const proto = controller ? ownerOf(controller, '_scheduleSpeak') : null;
    if (!proto) return false;
    if (patches.has(proto, '_scheduleSpeak')) return true;
    patches.shadow(proto, '_scheduleSpeak', (original) =>
      function (this: unknown, delay: unknown) {
        let gap = delay;
        try {
          const self = waive(this);
          const nativeSentence = finite(self?.voice?.sentenceDelay, 0);
          const scheduled = finite(delay, nativeSentence);
          const paragraph = self?._currentSegment?.anchor === 'paragraphStart';
          const speed = finite(self?.speed, 1);
          const computed = computeGap({ scheduled, nativeSentence, paragraph, speed, settings: deps.getSettings() });
          gap = computed;
          state.count += 1;
          state.last = { scheduled, delay: computed, paragraph, speed, nativeSentence, at: now() };
        } catch (e) {
          // Zotero's own number goes through: a broken setting must not stall playback
          deps.error(e);
        }
        return Reflect.apply(original, this, [gap]);
      },
    );
    deps.debug?.('pause scheduling attached to a controller');
    return true;
  }

  function attach(reader: any): boolean {
    try {
      const manager = waive(reader?._internalReader?._readAloudManager);
      const proto = manager ? ownerOf(manager, '_createController') : null;
      if (!proto) return false;
      const state = stateOf(manager);
      if (!patches.has(proto, '_createController')) {
        patches.shadow(proto, '_createController', (original) =>
          function (this: unknown, ...args: unknown[]) {
            const result = Reflect.apply(original, this, args);
            try {
              patchController(waive(this)?._controller, state);
            } catch (e) {
              deps.error(e);
            }
            return result;
          },
        );
        deps.debug?.('pauses attached');
      }
      // A session already open when this instance started (issue #38): its
      // controller was built before the shadow above existed
      patchController(manager._controller, state);
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function inspect(reader: any): Record<string, unknown> {
    try {
      const manager = waive(reader?._internalReader?._readAloudManager);
      const managerProto = manager ? ownerOf(manager, '_createController') : null;
      const controller = manager?._controller ?? null;
      const controllerProto = controller ? ownerOf(controller, '_scheduleSpeak') : null;
      const settings = deps.getSettings();
      const speed = finite(manager?.speed, 1);
      const voice = manager?._voice ?? null;
      const nativeSentence = finite(voice?.sentenceDelay, 0);
      const state = manager ? states.get(manager) : undefined;
      return {
        patched: {
          manager: !!managerProto && patches.has(managerProto, '_createController'),
          controller: !!controllerProto && patches.has(controllerProto, '_scheduleSpeak'),
        },
        active: !!manager?.active,
        paused: !!manager?.paused,
        settings,
        speed,
        voice: voice ? { id: String(voice.id ?? ''), tier: String(voice.tier ?? ''), nativeSentenceDelay: nativeSentence } : null,
        // What the next boundary would get with this voice at this speed
        gaps: {
          sentence: computeGap({ scheduled: nativeSentence, nativeSentence, paragraph: false, speed, settings }),
          paragraph: computeGap({ scheduled: nativeSentence + ZOTERO_PARAGRAPH_MS, nativeSentence, paragraph: true, speed, settings }),
        },
        last: state?.last ?? null,
        count: state?.count ?? 0,
      };
    } catch (e) {
      return { error: String(e) };
    }
  }

  return { attach, inspect, patchCounts: patches.counts, dispose: () => patches.restoreAll() };
}
