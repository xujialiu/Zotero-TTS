import { clampSpeed, persistSpeed } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import { readMemory, writeMemory } from './read-aloud-memory';

/**
 * The default speed — what Read Aloud starts with — as the voice browser's
 * slider sets it (ui/voice-browser-rows.ts). One value, written to every
 * place that answers "how fast":
 *
 * - the memory kept across documents (read-aloud-memory.ts), which
 *   memory-sync.ts puts in front of Zotero's own restore while "same for
 *   every document" is on;
 * - Zotero's own per-language entries (`reader.readAloudVoices`), which
 *   Zotero applies itself, switch or no switch — for the languages it has
 *   seen; a language without an entry has nowhere to hold a speed until
 *   the memory supplies one;
 * - the ReadAloudManager of every open reader, so a document that is
 *   playing changes pace at once: `setSpeed` is what the popup's own
 *   slider calls, and Zotero time-stretches the audio it already has.
 */

/** The part of Zotero's ReadAloudManager this drives — the shape ui/read-aloud-shortcuts.ts uses too. */
export interface SpeedManagerLike {
  /** "A Read Aloud session is open"; paused keeps it true. */
  active?: boolean;
  speed?: number;
  selectedVoiceID?: string | null;
  setSpeed(speed: number, persist?: boolean): void;
}

/**
 * Make `speed` the default, in this order. The memory first: memory-sync's
 * observer reads it back on each write of Zotero's pref below and finds the
 * speed already there. Then the readers — those not already at the speed;
 * the one whose own slider or shortcut set it (memory-sync spreads through
 * this) needs no second persist. Zotero persists for a manager only while
 * it is active with a voice: its persistence path (`_setReadAloudVoice`)
 * re-syncs and activates an idle one that still holds a voice, and audio
 * would start with the popup closed; without a voice `_persistCurrentVoice`
 * returns early. The readers before the pref write, so a fallback voice
 * persisted here for the first time moves together with its speed — which
 * memory-sync reads as "the slider", not as a voice choice
 * (read-aloud-memory.ts noteVoicesChange). Last, Zotero's entry for every
 * language: the user asked for a speed, not for a speed in one language.
 */
export function setDefaultSpeed(prefs: PrefsBackend, speed: number, managers: readonly SpeedManagerLike[] = [], log?: (e: unknown) => void): void {
  const next = clampSpeed(speed);
  writeMemory(prefs, { ...readMemory(prefs), speed: next });
  for (const manager of managers) {
    try {
      if (manager.speed === next) continue;
      manager.setSpeed(next, !!manager.active && !!manager.selectedVoiceID);
    } catch (e) {
      log?.(e);
    }
  }
  persistSpeed(prefs, null, next);
}
