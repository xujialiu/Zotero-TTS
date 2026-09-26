import type { RemainingSnapshot } from '../core/engine/session';
import type { L10nArgs } from '../core/l10n';
import { remainingTimeLabels } from '../ui/remaining-time';
import type { FlatSettings } from '../core/settings-backup';
import { NAVIGATION_ACTIONS, type NavigationAction } from '../core/shortcut-actions';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import { VOLUME_PREF, clampVolume } from '../core/read-aloud-volume';
import { parseFavoriteVoices, serializeFavoriteVoices, toggleFavoriteVoice } from './favorites';
import { baseLanguage, dropdownLabels, languageDisplayName } from './language-dropdown';
import { compareVoiceLabels } from './voice-catalog';

export interface PlayerOption { value: string; label: string }
export interface PlayerSnapshot {
  expandOnOpen: boolean; opened: boolean; active: boolean; playing: boolean; buffering: boolean;
  provider: string; locale: string; voice: string; speed: number; volume: number; automatic: boolean;
  providers: PlayerOption[]; locales: PlayerOption[]; voices: PlayerOption[]; favorites: string[];
  error: string | null;
  remaining?: string[];
}
export interface PlayerControllerDeps {
  prefs: PrefsBackend;
  labels(): Record<string, string>;
  clone(reader: any, value: unknown): any;
  start(reader: any): void;
  close(reader: any): void;
  togglePaused(reader: any): void;
  rememberSpeed(speed: number): void;
  follow(reader: any): void;
  navigate(reader: any, action: NavigationAction): void;
  automatic(reader: any): boolean;
  manual(reader: any): void;
  anyReading(): boolean;
  affectedTabs?(changes: FlatSettings): string[];
  message(key: string, args?: L10nArgs): string;
  remainingTime?(reader: any): RemainingSnapshot;
}

/** The reader engine is isolated here; the player consumes only JSON and commands. */
export function createPlayerController(deps: PlayerControllerDeps) {
  const managerOf = (reader: any): any => {
    try { const manager = reader?._internalReader?._readAloudManager; void manager?.active; return manager; }
    catch { return null; }
  };
  const popupOpen = (reader: any): boolean => {
    try { return !!reader?._internalReader?._state?.readAloudState?.popupOpen; }
    catch { return false; }
  };
  const pref = (key: string) => deps.prefs.get(PREF_PREFIX + 'readAloud.' + key);
  const write = (key: string, value: unknown) => deps.prefs.set(PREF_PREFIX + 'readAloud.' + key, value);
  // Reader-compartment arrays must be walked by index, never with a sandbox callback.
  const voicesOf = (source: any): PlayerOption[] => {
    const rows: PlayerOption[] = [];
    for (let i = 0; i < (source?.length ?? 0); i++) {
      const voice = source[i];
      if (typeof voice?.id === 'string') rows.push({ value: voice.id, label: String(voice.label ?? voice.name ?? voice.id) });
    }
    return rows.sort((a, b) => compareVoiceLabels(a.label, b.label));
  };
  function snapshot(reader: any): PlayerSnapshot {
    const m = managerOf(reader);
    const labels = deps.labels();
    const providers: PlayerOption[] = [];
    if (m?.tiers) for (const tier of m.tiers) providers.push({ value: String(tier), label: labels[tier] ?? String(tier) });
    providers.sort((a, b) => compareVoiceLabels(a.label, b.label));
    const languages: string[] = [];
    if (m?.languages) for (const language of m.languages) languages.push(String(language));
    const locales = [...dropdownLabels(languages, languageDisplayName)].map(([value, label]) => ({ value, label }));
    locales.sort((a, b) => a.value === 'mul' ? -1 : b.value === 'mul' ? 1 : compareVoiceLabels(a.label, b.label));
    const region = m?.currentVoiceRegion ?? m?.region;
    const full = m?.lang ? String(m.lang) + (region ? '-' + region : '') : '';
    const locale = locales.some(v => v.value === full) ? full : locales.some(v => v.value === m?.lang) ? String(m.lang) : '';
    return {
      expandOnOpen: pref('openExpanded') === true,
      remaining: m && pref('remainingTime') !== false && deps.remainingTime ? remainingTimeLabels(deps.remainingTime(reader), deps.message) : [],
      opened: popupOpen(reader) || !!m?.active,
      active: !!m?.active, playing: !!m?.active && !m?.paused, buffering: !!m?.buffering,
      provider: String(m?.selectedTier ?? ''), locale, voice: String(m?.selectedVoiceID ?? ''),
      speed: Number(m?.speed) || 1, volume: clampVolume(deps.prefs.get(VOLUME_PREF)),
      automatic: !!m && deps.automatic(reader), providers, locales,
      voices: voicesOf(m?.voicesForLanguage), favorites: parseFavoriteVoices(pref('favoriteVoices')),
      error: m?.error ? deps.message(m.error === 'quota-exceeded' ? 'ztts-player-quota-error' : 'ztts-player-playback-error') : null,
    };
  }
  async function command(reader: any, action: string, value?: unknown): Promise<void> {
    const m = managerOf(reader);
    if (!m) throw new Error(deps.message('ztts-player-unavailable'));
    const state = snapshot(reader);
    const requireChoice = (options: PlayerOption[]): string => {
      if (typeof value !== 'string' || !options.some(v => v.value === value)) throw new Error(deps.message('ztts-player-unavailable-choice'));
      return value;
    };
    const number = (min: number, max: number): number => {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(deps.message('ztts-player-invalid-value'));
      return value;
    };
    switch (action) {
      case 'open':
        if (!m.active) deps.start(reader);
        else if (m.paused) deps.togglePaused(reader);
        return;
      case 'play':
        if (m.active) deps.togglePaused(reader); else deps.start(reader);
        return;
      case 'close': deps.close(reader); return;
      case 'navigate': {
        const action = NAVIGATION_ACTIONS.find(action => action === value);
        if (!action) throw new Error(deps.message('ztts-player-invalid-value'));
        if (m.active) deps.navigate(reader, action);
        return;
      }
      case 'provider': await m.selectTier(requireChoice(state.providers)); return;
      case 'locale': {
        const language = requireChoice(state.locales), base = baseLanguage(language);
        await m.setLanguage(base, deps.clone(reader, { region: language.includes('-') ? language.slice(base.length + 1) : null, persist: true }));
        return;
      }
      case 'voice': await m.selectVoice(requireChoice(state.voices)); return;
      case 'speed': {
        const speed = number(0.5, 3);
        m.setSpeed(speed, !!m.active);
        deps.rememberSpeed(speed);
        return;
      }
      case 'volume': deps.prefs.set(VOLUME_PREF, Math.round(number(0, 100))); return;
      case 'automatic':
        if (typeof value !== 'boolean') throw new Error(deps.message('ztts-player-invalid-value'));
        if (value) deps.follow(reader);
        else deps.manual(reader);
        return;
      case 'favorite': {
        const voice = requireChoice(voicesOf(m.allVoices));
        const next = serializeFavoriteVoices(toggleFavoriteVoice(state.favorites, voice));
        const affected = deps.affectedTabs ? deps.affectedTabs({ 'readAloud.favoriteVoices': next }).length > 0
          : pref('favoritesOnly') === true && deps.anyReading();
        if (affected) throw new Error(deps.message('ztts-player-favorite-guard'));
        write('favoriteVoices', next);
        return;
      }
      case 'retry':
        if (!m.active) deps.start(reader);
        else if (typeof m.retry === 'function') await m.retry();
        return;
      default: throw new Error(deps.message('ztts-player-invalid-value'));
    }
  }
  return { snapshot, command };
}
