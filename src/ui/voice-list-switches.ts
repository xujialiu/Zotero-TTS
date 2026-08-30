import { FAVORITES_ONLY_OBSERVER } from '../read-aloud/favorites';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { refuseWhileReading, type ReadingGuardDeps } from './reading-guard';

/**
 * The checkboxes of the pane that edit what the Read Aloud player lists —
 * *Offer only favorite voices*, and nothing else since issue #17 retired
 * *Hide System Local voices* — and the only rows in the pane that own a
 * checkbox instead of binding it.
 *
 * They have to own it. A `preference=`-bound checkbox has already written
 * the pref by the time any listener runs: `_syncToPrefOnModify`
 * (chrome/content/zotero/preferences/preferences.js:465) dispatches
 * `beforesynctopreference`, a plain non-cancelable Event, and then calls
 * `Zotero.Prefs.set`; the binding's own listeners sit on
 * `command`/`input`/`change` (:542). There is no veto hook, so the write is
 * ours to make — or not to make, when a tab is reading
 * (ui/reading-guard.ts).
 *
 * The cost of unbinding is that nothing redraws the box any more, and the
 * pref is written from elsewhere too: a settings restore writes it. So the
 * box follows its own pref observer, and `refresh()` repaints on demand.
 */

export interface VoiceListSwitch {
  /** The checkbox in addon/content/preferences.xhtml. */
  id: string;
  /** Its pref, without `PREF_PREFIX`. */
  pref: string;
  /** Its name for `Zotero.Prefs.registerObserver`. */
  observer: string;
}

export const VOICE_LIST_SWITCHES: readonly VoiceListSwitch[] = [
  { id: 'ztts-favorites-only', pref: 'readAloud.favoritesOnly', observer: FAVORITES_ONLY_OBSERVER },
];

export interface VoiceListSwitchesDeps extends ReadingGuardDeps {
  prefs: PrefsBackend;
  /** `Zotero.Prefs.registerObserver` on one pref, returning its unregister. Omitted, the boxes only follow `refresh()`. */
  watch?(observer: string, onChange: () => void): () => void;
}

export function initVoiceListSwitches(
  doc: { getElementById(id: string): any },
  deps: VoiceListSwitchesDeps,
): { refresh(): void; dispose(): void } {
  const key = (row: VoiceListSwitch) => PREF_PREFIX + row.pref;
  const value = (row: VoiceListSwitch) => deps.prefs.get(key(row)) === true;

  /** Every box as its pref says. Setting `checked` fires no command, so this never writes back. */
  function paint(): void {
    for (const row of VOICE_LIST_SWITCHES) {
      const box = doc.getElementById(row.id);
      if (box) box.checked = value(row);
    }
  }

  /**
   * The box has flipped itself by the time `command` fires, so `checked` is
   * what the user asked for and the pref is still what it was. Refused, the
   * box goes back to the pref; nothing else moved.
   */
  function onCommand(row: VoiceListSwitch): void {
    const box = doc.getElementById(row.id);
    const wanted = !!box?.checked;
    if (wanted === value(row)) return;
    if (refuseWhileReading(deps)) {
      if (box) box.checked = value(row);
      return;
    }
    deps.prefs.set(key(row), wanted);
  }

  const stops: Array<() => void> = [];
  for (const row of VOICE_LIST_SWITCHES) {
    doc.getElementById(row.id)?.addEventListener('command', () => onCommand(row));
    const stop = deps.watch?.(row.observer, paint);
    if (stop) stops.push(stop);
  }
  paint();

  return {
    refresh: paint,
    dispose: () => {
      for (const stop of stops.splice(0)) stop();
    },
  };
}
