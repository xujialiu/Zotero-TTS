import { loadSettings, PREF_PREFIX, type PrefsBackend } from '../core/settings';

/**
 * Prefetch and the audio cache are one feature, and the pane says so.
 *
 * The warmer has nowhere to put what it synthesizes without the cache:
 * `prefetchAfter` returns on its first line when `deps.cache` is undefined
 * (read-aloud/remote-interface.ts), which is what src/index.ts hands over
 * while `cacheAudio` is off. Checked but silently doing nothing is a state
 * only the debug log reveals — measured 2026-08-29, notes/NOTES.md — so
 * while the switch is on the cache is turned on and its checkbox locked.
 *
 * Turned on, not borrowed: switching prefetch off again leaves the cache on
 * and merely returns the choice to the user. Re-reading a passage is still
 * free, which is what the cache is for on its own.
 */

/** The prefetch switch, as `Zotero.Prefs.registerObserver` names it (relative to `extensions.zotero.`). */
export const PREFETCH_ENABLED_OBSERVER = 'zotero-tts.prefetchEnabled';
export const CACHE_AUDIO_PREF = `${PREF_PREFIX}cacheAudio`;
export const CACHE_AUDIO_CHECKBOX_ID = 'ztts-cache-audio';

export interface PrefetchRowsDeps {
  prefs: PrefsBackend;
  /** `Zotero.Prefs.registerObserver` on the switch; returns its unregister. Omitted, the rows only follow `refresh()`. */
  watch?(onChange: () => void): () => void;
}

export function initPrefetchRows(doc: { getElementById(id: string): any }, deps: PrefetchRowsDeps): { refresh(): void; dispose(): void } {
  /**
   * The pref first — the checkbox is `preference=`-bound, so Zotero redraws
   * it checked from the write — then the lock. A `set` of the value already
   * there is skipped: default prefs are not stored, and writing one
   * materializes a user value for nothing (notes/NOTES.md).
   */
  function paint(): void {
    const settings = loadSettings(deps.prefs);
    if (settings.prefetchEnabled && !settings.cacheAudio) deps.prefs.set(CACHE_AUDIO_PREF, true);
    const box = doc.getElementById(CACHE_AUDIO_CHECKBOX_ID);
    if (box) box.disabled = settings.prefetchEnabled;
  }

  const stop = deps.watch?.(paint);
  paint();
  return { refresh: paint, dispose: () => stop?.() };
}
