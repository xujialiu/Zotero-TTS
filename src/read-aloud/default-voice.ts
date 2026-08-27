import { READ_ALOUD_VOICES_PREF, readReadAloudVoices, type VoiceEntry } from '../core/read-aloud-speed';
import type { PrefsBackend } from '../core/settings';
import { readMemory, writeMemory, type VoiceChoice } from './read-aloud-memory';

/**
 * The default voice — what Read Aloud starts with — as the voice browser's
 * row click sets it (ui/voice-browser-rows.ts); the twin of default-speed.ts.
 * Two writes, in this order:
 *
 * 1. The memory kept across documents (read-aloud-memory.ts), which
 *    memory-sync.ts puts in front of Zotero's own restore while "one voice
 *    everywhere" is on. First, so that memory-sync's observer — which fires
 *    synchronously inside the write below — finds the voice there already
 *    and learns nothing.
 * 2. Zotero's own entry for the voice's language, built as Zotero's
 *    `_setReadAloudVoice` builds it: `{ region, voice, speed, tierVoices }`
 *    with the tier pushed to the end, which is where `_findFallbackVoice`
 *    takes its target tier from. This is what a document in that language
 *    restores from, switch or no switch. The entry's speed is kept as it
 *    is — a voice moving together with a speed reads as the slider
 *    persisting a fallback (noteVoicesChange) and the pick would be
 *    dropped; an entry Zotero has not written yet takes the memory's speed,
 *    or none.
 *
 * Reaching the tabs that are reading is memory-sync's `spreadVoice`, which
 * the pane calls next. Clearing writes the memory only: Zotero's entry is
 * left as it is, and the memory no longer overrides it — "Zotero's own
 * choice".
 */

export interface DefaultVoicePick extends VoiceChoice {
  /** The voice's own region subtag (`CN` for zh-CN; none for mul) — what `_persistCurrentVoice` stores as the entry's region. */
  region: string | null;
  /** Zotero's tier of the voice: `local` for the plugin's, `standard` / `premium` for Zotero's own. */
  tier: string;
}

/** The region Zotero's `getVoiceRegion` reads off a locale: everything after the first hyphen. */
export function regionOfLocale(locale: string): string | null {
  const i = locale.indexOf('-');
  return i > 0 && i < locale.length - 1 ? locale.slice(i + 1) : null;
}

const validSpeed = (s: unknown): s is number => typeof s === 'number' && Number.isFinite(s) && s > 0;

export function setDefaultVoice(prefs: PrefsBackend, pick: DefaultVoicePick | null): void {
  const memory = readMemory(prefs);
  writeMemory(prefs, { ...memory, voice: pick ? { id: pick.id, lang: pick.lang } : null });
  if (!pick) return;
  const voices = readReadAloudVoices(prefs);
  const entry: VoiceEntry = voices[pick.lang] ?? {};
  const tierVoices: Record<string, unknown> = entry.tierVoices && typeof entry.tierVoices === 'object' ? { ...(entry.tierVoices as Record<string, unknown>) } : {};
  delete tierVoices[pick.tier];
  tierVoices[pick.tier] = pick.id;
  const speed = validSpeed(entry.speed) ? entry.speed : memory.speed;
  const next: VoiceEntry = { region: pick.region, voice: pick.id, ...(speed !== null ? { speed } : {}), tierVoices };
  prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify({ ...voices, [pick.lang]: next }));
}
