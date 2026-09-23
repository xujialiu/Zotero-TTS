/**
 * The pause between sentences, and the extra one where a paragraph
 * begins, set by the user for every voice in the player (issue #44).
 *
 * Read Aloud's engine waits a fixed number of milliseconds before the next
 * segment: the voice's `sentenceDelay` — catalog data, 300 on a few Premium
 * voices and 0 everywhere else, the plugin's own voices included — plus
 * `DELAY_PARAGRAPH` (200) when the next segment begins a paragraph
 * (reader.js 39297, 39504-39508). Neither follows the speed, though the
 * audio itself is time-stretched. The Engine waits `computeGap` instead: the
 * sentence part is the setting divided by the speed while its switch is on,
 * else the voice's own delay; the paragraph part, only before a paragraph,
 * is the setting divided by the speed while on, else Zotero's 200. The
 * settings are read at every boundary, so a change in the pane lands on the
 * next sentence in every open tab.
 */

import type { Settings } from '../settings';

/** Read Aloud's own extra before a paragraph, `DELAY_PARAGRAPH` (reader.js 39297). */
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
  /** What Read Aloud's engine would wait: the voice's `sentenceDelay`, plus its paragraph extra before a paragraph. */
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

/** The milliseconds to wait before the next segment. Pure, and the one place the arithmetic lives. */
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

/** The gap before `next`, as Read Aloud's engine schedules it and the settings then reshape it. */
export function gapBefore(next: { anchor?: string | null } | null | undefined, nativeSentence: number, speed: number, settings: PauseSettings): number {
  const paragraph = next?.anchor === 'paragraphStart';
  const native = Math.max(0, finite(nativeSentence, 0));
  return computeGap({ scheduled: native + (paragraph ? ZOTERO_PARAGRAPH_MS : 0), nativeSentence: native, paragraph, speed, settings });
}
