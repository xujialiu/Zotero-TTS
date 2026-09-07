/**
 * How loud Read Aloud plays, as a percentage of what Zotero would play on
 * its own (issue #62): 100 is Zotero's output unchanged, and the most; 0
 * is silence. The number lives in one pref, `readAloud.volume`, that the
 * settings pane's field and the two shortcuts both write; read-aloud/
 * volume.ts turns it into the gain of a node ahead of Zotero's own filter
 * chain in every open reader, so a change lands within the sentence being
 * spoken. The range once ran to 200 (1.11.1): a gain above 1 lands ahead
 * of Zotero's compressor, which takes it back, so the audio never got
 * louder (issue #66) — the boost is gone until it can be made real.
 */

export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;
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

/** The gain a percentage means on the node: 1 at 100, and never more. */
export function gainOf(percent: unknown): number {
  return clampVolume(percent) / 100;
}

/** What the pref held and what `settleVolumePref` wrote in its place. */
export interface VolumeSettlement {
  from: number;
  to: number;
}

/**
 * Bring a stored level that is outside the range into it, once, at
 * startup (issue #66): 1.11.1's field wrote up to 200, and while
 * `loadSettings` reads such a pref clamped, the pane's bound field shows
 * the raw pref — a 150 it shows is a 100 it plays. Returns what was
 * written, or null when the pref is already within the range, unset, or
 * not a number (which reads as 100 and is left for the field to
 * overwrite). A write that fails throws, for the caller to log.
 */
export function settleVolumePref(prefs: { get(key: string): unknown; set(key: string, value: unknown): void }): VolumeSettlement | null {
  const stored = prefs.get(VOLUME_PREF);
  if (typeof stored !== 'number' || !Number.isFinite(stored)) return null;
  const settled = clampVolume(stored);
  if (settled === stored) return null;
  prefs.set(VOLUME_PREF, settled);
  return { from: stored, to: settled };
}
