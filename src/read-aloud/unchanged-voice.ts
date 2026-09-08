import { createProtoPatches, type AnyFn } from './proto-patches';
import { ownerOf } from './system-voices';

/**
 * A voice list that lands while the manager is reading, on the very voice
 * it is playing with, keeps the controller (issue #75).
 *
 * Zotero's `_prepareReadAloud` runs `loadVoices` on every popup open
 * (reader.js:84260), and `loadVoices` ends in `_resolveVoice()`
 * (reader.js:82310), whose "if current voice is still valid, keep it"
 * branch calls `_applyVoice()` (reader.js:82428-82432) — and `_applyVoice`,
 * with the manager active and its segments in place, recreates the
 * controller unconditionally (reader.js:82497-82524): the one that is
 * speaking is destroyed and a new one starts the segment from its first
 * word. On a tab's first open nothing plays until the list lands, so the
 * resolve runs before playback; on every later open the list is still
 * populated, playback begins at once, and the fresh list lands mid-sentence
 * — 1.2–1.6 s in here, since the plugin's catalog (every enabled
 * provider) answers well after Zotero's own voices do (measured
 * 2026-09-08, issue #75). Zotero's own key does the same.
 *
 * So `_applyVoice` is shadowed on each tab's manager prototype
 * (proto-patches.ts, the shape of pauses.ts and volume.ts). When the
 * manager is active with a controller and segments, and the voice being
 * applied is the one in use — the same id, still in the list and in the
 * language's pool, its granularity unchanged — the shadow does what
 * Zotero's method sets before it rebuilds, the voice object from the new
 * list and the tier from it, and returns without `_createController`.
 * Every other case runs Zotero's method untouched: a changed id (a pick,
 * a fallback), a voice gone from the list, a granularity change, an idle
 * manager. The rule also spares a rebuild on a dropdown pick of the voice
 * already playing and on a tier chip of the current tier, which restarted
 * the sentence before. Zotero fixing the branch upstream makes this a
 * no-op.
 */

export interface UnchangedVoiceDeps {
  /** Components.utils.exportFunction: the shadow must be callable from the reader's compartment. Optional for tests. */
  exportFunction?(fn: AnyFn, target: object): AnyFn;
  /** Components.utils.waiveXrays: `this` arrives behind an Xray wrapper, where an own-property write would land on the wrapper. Optional for tests. */
  waiveXrays?<T>(value: T): T;
  /** Components.utils.isDeadWrapper, for the undo log (proto-patches.ts). Optional for tests. */
  isDead?(value: unknown): boolean;
  error(e: unknown): void;
  debug?(message: string): void;
}

export interface UnchangedVoiceReport {
  /** Whether this reader's manager prototype carries the shadow. */
  patched: boolean;
  /** `manager.active` — a session open, paused included. */
  active: boolean;
  /** The voice in use, by id. */
  voice: string | null;
  /** How many rebuilds the shadow skipped in this tab; advancing on a popup reopen is what proves it ran. */
  kept: number;
  /** The voice the last skipped rebuild was onto. */
  last: string | null;
}

export interface UnchangedVoice {
  /** Shadow the tab's manager prototype; false when the reader has no manager. Idempotent per tab. */
  attach(reader: unknown): boolean;
  /** The state above for one reader; null without a manager. */
  inspect(reader: unknown): UnchangedVoiceReport | null;
  /** The undo log's counts, for diagnostics.patches(). */
  patchCounts(): { total: number; live: number };
  /** Restore every prototype whose tab is still open. */
  dispose(): void;
}

export function createUnchangedVoice(deps: UnchangedVoiceDeps): UnchangedVoice {
  const patches = createProtoPatches({ exportFunction: deps.exportFunction, isDead: deps.isDead, error: deps.error });
  const waive = <T>(value: T): T => (deps.waiveXrays ? deps.waiveXrays(value) : value);
  /** Per manager (waived): the rebuilds skipped, and the last one's voice. */
  const kept = new WeakMap<object, { count: number; last: string | null }>();

  /**
   * The entry of `list` with this id, by an index loop — never `find` or
   * `some`: the lists are the reader realm's, whose methods cannot call a
   * sandbox callback and answer `undefined` / `false` without a throw
   * (measured 2026-09-08 on 1.11.4-beta5, where the guard was inert for
   * exactly that; system-voices.ts walks `_allVoices` the same way).
   */
  function byId(list: any, id: unknown): any | null {
    const length = list ? Number(list.length) || 0 : 0;
    for (let i = 0; i < length; i++) {
      const v = list[i];
      if (v && v.id === id) return v;
    }
    return null;
  }

  /**
   * The voice `_applyVoice` is about to apply, when applying it would only
   * rebuild the controller onto the voice already playing; null when
   * Zotero's method must run.
   */
  function unchanged(m: any): any | null {
    if (!m?._active || !m._controller || !m._segments || !m._voice || !m._voiceID) return null;
    if (m._voice.id !== m._voiceID) return null;
    const voice = byId(m._allVoices, m._voiceID);
    if (!voice || voice.segmentGranularity !== m._segmentGranularity) return null;
    if (!byId(m.voicesForLanguage, m._voiceID)) return null;
    return voice;
  }

  function attach(reader: unknown): boolean {
    try {
      const manager = waive((reader as any)?._internalReader?._readAloudManager);
      const proto = manager ? ownerOf(manager, '_applyVoice') : null;
      if (!proto) return false;
      if (!patches.has(proto, '_applyVoice')) {
        patches.shadow(proto, '_applyVoice', (original) =>
          function (this: unknown, ...args: unknown[]) {
            try {
              const m = waive(this) as any;
              const voice = unchanged(m);
              if (voice) {
                // What Zotero's _applyVoice sets before it rebuilds, minus the rebuild
                m._voice = voice;
                m._selectedTier = voice.tier;
                const record = kept.get(m) ?? { count: 0, last: null };
                record.count += 1;
                record.last = String(m._voiceID);
                kept.set(m, record);
                deps.debug?.(`kept the controller: the voice list landed on the voice already playing (${record.last})`);
                return undefined;
              }
            } catch (e) {
              deps.error(e);
            }
            return Reflect.apply(original, this, args);
          },
        );
        deps.debug?.('unchanged-voice attached');
      }
      return true;
    } catch (e) {
      deps.error(e);
      return false;
    }
  }

  function inspect(reader: unknown): UnchangedVoiceReport | null {
    try {
      const manager = waive((reader as any)?._internalReader?._readAloudManager);
      if (!manager) return null;
      const proto = ownerOf(manager, '_applyVoice');
      const record = kept.get(manager);
      return {
        patched: !!proto && patches.has(proto, '_applyVoice'),
        active: !!manager._active,
        voice: manager._voiceID ? String(manager._voiceID) : null,
        kept: record?.count ?? 0,
        last: record?.last ?? null,
      };
    } catch (e) {
      deps.error(e);
      return null;
    }
  }

  return {
    attach,
    inspect,
    patchCounts: () => patches.counts(),
    dispose: () => patches.restoreAll(),
  };
}
