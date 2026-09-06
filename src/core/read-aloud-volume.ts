/**
 * How loud Read Aloud plays, as a percentage of what Zotero would play on
 * its own (issue #62): 100 is Zotero's output unchanged, 0 is silence, 200
 * the most. The number lives in one pref, `readAloud.volume`, that the
 * settings pane's field and the two shortcuts both write; read-aloud/
 * volume.ts turns it into the gain of a node ahead of Zotero's own filter
 * chain in every open reader, so a change lands within the sentence being
 * spoken. Above 100 the boost meets Zotero's compressor, which soft-limits
 * it: quiet voices come up, loud ones change little.
 */

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 200;
export const VOLUME_STEP = 10;
export const VOLUME_DEFAULT = 100;

/** The pref in full (core/settings.ts PREF_PREFIX + `readAloud.volume`, pinned by a test), and as `Zotero.Prefs.registerObserver` wants it — relative to `extensions.zotero.`. */
export const VOLUME_PREF = 'extensions.zotero.zotero-tts.readAloud.volume';
export const VOLUME_OBSERVER = 'zotero-tts.readAloud.volume';

export type VolumeAction = 'volumeDown' | 'volumeUp';
export const VOLUME_ACTIONS: readonly VolumeAction[] = ['volumeDown', 'volumeUp'];

/** A whole percent within the range; anything that is not a finite number reads as 100. */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return VOLUME_DEFAULT;
  return Math.min(VOLUME_MAX, Math.max(VOLUME_MIN, Math.round(value)));
}

export function nextVolume(current: unknown, action: VolumeAction): number {
  return clampVolume(clampVolume(current) + (action === 'volumeUp' ? VOLUME_STEP : -VOLUME_STEP));
}

/** The gain a percentage means on the node: 1 at 100. */
export function gainOf(percent: unknown): number {
  return clampVolume(percent) / 100;
}
