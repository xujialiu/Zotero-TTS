import { PREF_PREFIX, type PrefsBackend } from '../core/settings';

/** The three source switches and the nearby manual-ID controls. */
export const FISH_SOURCE_IDS = {
  root: 'ztts-fish-sources',
  official: 'ztts-fish-include-official',
  own: 'ztts-fish-include-own',
  manual: 'ztts-fish-include-manual',
  modelIds: 'ztts-fish-model-ids',
} as const;

/** Preference names, relative to PREF_PREFIX, for the source switches. */
export const FISH_SOURCE_PREFS = {
  official: 'fish.includeOfficial',
  own: 'fish.includeOwn',
  manual: 'fish.includeManual',
} as const;

type SourceName = keyof typeof FISH_SOURCE_PREFS;

const SOURCE_ROWS: readonly { name: SourceName; id: string; pref: string; observer: string }[] = [
  { name: 'official', id: FISH_SOURCE_IDS.official, pref: FISH_SOURCE_PREFS.official, observer: 'zotero-tts.fish.includeOfficial' },
  { name: 'own', id: FISH_SOURCE_IDS.own, pref: FISH_SOURCE_PREFS.own, observer: 'zotero-tts.fish.includeOwn' },
  { name: 'manual', id: FISH_SOURCE_IDS.manual, pref: FISH_SOURCE_PREFS.manual, observer: 'zotero-tts.fish.includeManual' },
];

export interface FishVoiceSourcesDeps {
  prefs: PrefsBackend;
  /** Whether changing a source changes the voices of an enabled Read Aloud player. */
  fishEnabled(): boolean;
  /** Repaints after settings restore or a preference observer event. */
  watch?(observer: string, onChange: () => void): () => void;
}

export interface FishVoiceSourcesController {
  /** Repaint switch state and the Model IDs field. */
  refresh(): void;
  /** Unregister observers and reject late source changes. */
  dispose(): void;
}

function boolPref(prefs: PrefsBackend, pref: string): boolean {
  // The first build did not have these prefs. Treat an absent value as the
  // agreed on default, so an upgrade keeps offering every source.
  return prefs.get(PREF_PREFIX + pref) !== false;
}

/** Wire the three source switches and the retained Model IDs field. */
export function initFishVoiceSources(
  doc: { getElementById(id: string): any },
  deps: FishVoiceSourcesDeps,
): FishVoiceSourcesController {
  const boxes = new Map(SOURCE_ROWS.map((row) => [row.name, doc.getElementById(row.id)]));
  const modelIds = doc.getElementById(FISH_SOURCE_IDS.modelIds);

  let disposed = false;
  const stops: Array<() => void> = [];

  const fishEnabled = (): boolean => {
    try {
      return deps.fishEnabled();
    } catch {
      return false;
    }
  };

  const sourceOn = (name: SourceName): boolean => boolPref(deps.prefs, FISH_SOURCE_PREFS[name]);

  function paint(): void {
    const on = fishEnabled();
    for (const row of SOURCE_ROWS) {
      const box = boxes.get(row.name);
      if (box) {
        box.checked = sourceOn(row.name);
        box.disabled = on;
      }
    }
    const manual = sourceOn('manual');
    // Provider rows lock their own inputs while Fish is enabled. The source
    // panel also locks this field when Manual voices are off, including while
    // Fish is disabled, so the saved text remains visible but untouched.
    if (modelIds) modelIds.disabled = on || !manual;

  }

  function onCommand(name: SourceName): void {
    if (disposed) return;
    // Enabled Fish settings are a checked configuration. Even a synthetic
    // command must not edit it; Disable unlocks the source choices.
    if (fishEnabled()) {
      paint();
      return;
    }
    const wanted = !!boxes.get(name)?.checked;
    if (wanted !== sourceOn(name)) deps.prefs.set(PREF_PREFIX + FISH_SOURCE_PREFS[name], wanted);
    paint();
  }

  for (const row of SOURCE_ROWS) {
    boxes.get(row.name)?.addEventListener('command', () => onCommand(row.name));
    const stop = deps.watch?.(row.observer, paint);
    if (stop) stops.push(stop);
  }
  const stopEnabled = deps.watch?.('zotero-tts.fish.enabled', paint);
  if (stopEnabled) stops.push(stopEnabled);
  paint();

  function dispose(): void {
    if (disposed) return;
    disposed = true;
    for (const stop of stops.splice(0)) stop();
  }

  return { refresh: paint, dispose };
}
