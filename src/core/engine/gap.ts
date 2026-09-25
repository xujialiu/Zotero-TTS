/**
 * The pause between sentences, and the pause where a paragraph begins, set
 * by the user for every voice in the player (issues #44, #142).
 *
 * Read Aloud's engine waits the voice's `sentenceDelay` — catalog data, 300
 * on a few Premium voices and 0 everywhere else — plus `DELAY_PARAGRAPH`
 * (200) when the next segment begins a paragraph (reader.js 39297,
 * 39504-39508), whatever the speed. The Engine waits `computeGap` instead,
 * and neither of those numbers enters it: before a paragraph, the paragraph
 * setting alone, the whole pause there and not an addition to the sentence
 * setting (issue #142, as xujialiu/OpenReader#60 reads it); elsewhere, the
 * sentence setting. Either is divided by the speed, and a switch that is off
 * means no pause. The settings are read at every boundary, so a change in
 * the pane lands on the next sentence in every open tab.
 */

import type { Settings } from '../settings';

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
  const setting = input.paragraph ? input.settings.paragraph : input.settings.sentence;
  if (!setting.enabled) return 0;
  return Math.round(Math.max(0, finite(setting.ms, 0)) / speed);
}

/** The gap before `next`, by whether it begins a paragraph. */
export function gapBefore(next: { anchor?: string | null } | null | undefined, speed: number, settings: PauseSettings): number {
  return computeGap({ paragraph: next?.anchor === 'paragraphStart', speed, settings });
}
