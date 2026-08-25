import { MULTILINGUAL, type ProviderId } from '../core/providers/types';
import { sampleTextForLocale } from '../core/sample-text';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import type { CatalogEntry } from '../read-aloud/catalog';
import { parseFavoriteVoices, serializeFavoriteVoices, toggleFavoriteVoice } from '../read-aloud/favorites';
import { compareVoiceLabels, encodeVoiceId, pluginVoiceLabel } from '../read-aloud/voice-catalog';

/**
 * The voice browser of the settings pane: every voice the enabled providers
 * publish, grouped by locale — locales on the left, that locale's voices on
 * the right, each with a play button for a short sample in the locale's own
 * language (core/sample-text.ts) and a heart that marks it as a favorite
 * (read-aloud/favorites.ts). Samples are synthesized by the provider like
 * any sentence and kept for the pane's lifetime, so replaying is free.
 * Labels drop the TTS- prefix — everything here is the plugin's.
 */

export const VOICE_BROWSER_IDS = {
  reload: 'ztts-voices-reload',
  status: 'ztts-voices-status',
  locales: 'ztts-voices-locales',
  voices: 'ztts-voices-list',
} as const;

export const GLYPHS = { play: '▶', stop: '■', loading: '…', favorite: '♥', notFavorite: '♡' } as const;

const FAVORITES_PREF = PREF_PREFIX + 'readAloud.favoriteVoices';
const XHTML = 'http://www.w3.org/1999/xhtml';

export interface SamplePlayer {
  /** Starts the audio; onDone fires once, when playback ends or fails. */
  play(audio: Blob, onDone: () => void): Promise<void>;
  stop(): void;
}

export interface VoiceBrowserDeps {
  prefs: PrefsBackend;
  /** The same catalog the Read Aloud interface publishes (read-aloud/catalog.ts listNamedCatalog). */
  listCatalog(): Promise<CatalogEntry[]>;
  /** One bounded synthesis of the sample text; rejects with a readable message. */
  synthesizeSample(provider: ProviderId, voiceId: string, text: string): Promise<Blob>;
  player: SamplePlayer;
  /** Display name of a locale ("zh-CN" → "Chinese (China)"); injected so tests do not depend on the ICU data. */
  localeName?(code: string): string;
}

type BrowserVoice = { provider: ProviderId; id: string; encoded: string; label: string };
type LocaleGroup = { locale: string; name: string; voices: BrowserVoice[] };

function defaultLocaleName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** The catalog as the browser shows it: one group per locale, Multilingual first, the rest by display name; voices by label. */
export function groupVoicesByLocale(catalog: CatalogEntry[], localeName: (code: string) => string): LocaleGroup[] {
  const byLocale = new Map<string, BrowserVoice[]>();
  for (const entry of catalog) {
    for (const voice of entry.voices) {
      const list = byLocale.get(voice.locale) ?? [];
      list.push({
        provider: entry.provider,
        id: voice.id,
        encoded: encodeVoiceId(entry.provider, voice.id),
        label: pluginVoiceLabel(entry.provider, voice.label, entry.name, false),
      });
      byLocale.set(voice.locale, list);
    }
  }
  const groups = [...byLocale.entries()].map(([locale, voices]) => ({
    locale,
    name: localeName(locale),
    voices: voices.sort((a, b) => compareVoiceLabels(a.label, b.label)),
  }));
  return groups.sort((a, b) => {
    const mul = Number(b.locale === MULTILINGUAL) - Number(a.locale === MULTILINGUAL);
    return mul || compareVoiceLabels(a.name, b.name);
  });
}

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ROW_BUTTON_STYLE = 'border: none; background: transparent; cursor: pointer; color: inherit; font: inherit; padding: 0 2px;';
const LOCALE_STYLE =
  'display: block; width: 100%; text-align: start; border: none; background: transparent; color: inherit; font: inherit; padding: 3px 8px; border-radius: 3px; cursor: pointer; white-space: nowrap;';
const LOCALE_SELECTED_STYLE = LOCALE_STYLE + ' background: SelectedItem; color: SelectedItemText;';

export function initVoiceBrowserRows(
  doc: {
    getElementById(id: string): any;
    createElementNS(ns: string, tag: string): any;
  },
  deps: VoiceBrowserDeps,
): { load(): Promise<void>; refresh(): void } {
  const localeName = deps.localeName ?? defaultLocaleName;
  const status = (text: string) => doc.getElementById(VOICE_BROWSER_IDS.status)?.setAttribute('value', text);

  let groups: LocaleGroup[] = [];
  let selected: string | null = null;
  let loading = false;
  /** The encoded id being fetched / being played; at most one of each, ever. */
  let busy: string | null = null;
  let playing: string | null = null;
  const samples = new Map<string, Blob>();
  const playButtons = new Map<string, any>();

  const readFavorites = () => parseFavoriteVoices(deps.prefs.get(FAVORITES_PREF));

  const setPlayGlyph = (encoded: string, glyph: string) => {
    const button = playButtons.get(encoded);
    if (button) button.textContent = glyph;
  };

  /** Resets our state as well as the player: the fake of one must not be trusted to call back the other. */
  const stopPlayback = () => {
    deps.player.stop();
    if (playing) {
      setPlayGlyph(playing, GLYPHS.play);
      playing = null;
    }
  };

  async function onPlay(voice: BrowserVoice, locale: string): Promise<void> {
    if (playing === voice.encoded) {
      stopPlayback();
      return;
    }
    if (busy) return;
    busy = voice.encoded;
    setPlayGlyph(voice.encoded, GLYPHS.loading);
    try {
      const text = sampleTextForLocale(locale);
      const key = voice.encoded + '\n' + text;
      let audio = samples.get(key);
      if (!audio) {
        audio = await deps.synthesizeSample(voice.provider, voice.id, text);
        samples.set(key, audio);
      }
      stopPlayback();
      playing = voice.encoded;
      setPlayGlyph(voice.encoded, GLYPHS.stop);
      await deps.player.play(audio, () => {
        if (playing === voice.encoded) {
          playing = null;
          setPlayGlyph(voice.encoded, GLYPHS.play);
        }
      });
    } catch (e) {
      if (playing === voice.encoded) playing = null;
      setPlayGlyph(voice.encoded, GLYPHS.play);
      status(`Sample failed: ${describeError(e)}`);
    } finally {
      busy = null;
    }
  }

  function onHeart(voice: BrowserVoice, button: any): void {
    const next = toggleFavoriteVoice(readFavorites(), voice.encoded);
    deps.prefs.set(FAVORITES_PREF, serializeFavoriteVoices(next));
    paintHeart(button, next.includes(voice.encoded));
  }

  function paintHeart(button: any, favorite: boolean): void {
    button.textContent = favorite ? GLYPHS.favorite : GLYPHS.notFavorite;
    button.setAttribute('style', ROW_BUTTON_STYLE + (favorite ? ' color: #e0245e;' : ''));
  }

  function renderLocales(): void {
    const column = doc.getElementById(VOICE_BROWSER_IDS.locales);
    if (!column) return;
    column.replaceChildren(
      ...groups.map((group) => {
        const button = doc.createElementNS(XHTML, 'button');
        button.textContent = `${group.name} (${group.voices.length})`;
        button.setAttribute('style', group.locale === selected ? LOCALE_SELECTED_STYLE : LOCALE_STYLE);
        button.addEventListener('click', () => {
          selected = group.locale;
          renderLocales();
          renderVoices();
        });
        return button;
      }),
    );
  }

  function renderVoices(): void {
    const column = doc.getElementById(VOICE_BROWSER_IDS.voices);
    if (!column) return;
    playButtons.clear();
    const group = groups.find((g) => g.locale === selected);
    const favorites = readFavorites();
    column.replaceChildren(
      ...(group?.voices ?? []).map((voice) => {
        const row = doc.createElementNS(XHTML, 'div');
        row.setAttribute('style', 'display: flex; align-items: center; gap: 6px; padding: 2px 4px;');

        const play = doc.createElementNS(XHTML, 'button');
        play.textContent = busy === voice.encoded ? GLYPHS.loading : playing === voice.encoded ? GLYPHS.stop : GLYPHS.play;
        play.setAttribute('style', ROW_BUTTON_STYLE);
        play.setAttribute('title', 'Play a sample');
        play.addEventListener('click', () => void onPlay(voice, group!.locale));
        playButtons.set(voice.encoded, play);
        row.appendChild(play);

        const heart = doc.createElementNS(XHTML, 'button');
        heart.setAttribute('title', 'Favorite');
        paintHeart(heart, favorites.includes(voice.encoded));
        heart.addEventListener('click', () => onHeart(voice, heart));
        row.appendChild(heart);

        const label = doc.createElementNS(XHTML, 'span');
        label.textContent = voice.label;
        label.setAttribute('style', 'flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;');
        row.appendChild(label);

        return row;
      }),
    );
  }

  function render(): void {
    renderLocales();
    renderVoices();
  }

  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    status('Listing voices…');
    try {
      groups = groupVoicesByLocale(await deps.listCatalog(), localeName);
      const total = groups.reduce((n, g) => n + g.voices.length, 0);
      if (!groups.some((g) => g.locale === selected)) selected = groups[0]?.locale ?? null;
      render();
      status(
        total
          ? `${total} voices. Play a sample; the heart marks a favorite.`
          : 'No voices. Enable a provider above, then press Reload.',
      );
    } catch (e) {
      groups = [];
      render();
      status(`Listing voices failed: ${describeError(e)}`);
    } finally {
      loading = false;
    }
  }

  doc.getElementById(VOICE_BROWSER_IDS.reload)?.addEventListener('command', () => void load());

  return { load, refresh: render };
}

/**
 * The audio as a data: URL, so the pane's <audio> element never needs a
 * blob URL — URL.createObjectURL in the plugin sandbox is untested ground,
 * and a sample is small enough (a few seconds of speech) to inline.
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return `data:${blob.type || 'audio/mpeg'};base64,${btoa(binary)}`;
}

/** Plays one sample at a time through a fresh <audio> element of the pane's own document. */
export function createSamplePlayer(createAudio: () => HTMLAudioElement): SamplePlayer {
  let current: HTMLAudioElement | null = null;
  let done: (() => void) | null = null;
  const finish = () => {
    const cb = done;
    done = null;
    cb?.();
  };
  const stop = () => {
    const el = current;
    current = null;
    if (el) {
      try {
        el.pause();
        el.removeAttribute('src');
      } catch {
        // The pane may be tearing down; there is nothing to silence then
      }
    }
    finish();
  };
  return {
    async play(audio, onDone) {
      stop();
      const el = createAudio();
      current = el;
      done = onDone;
      el.addEventListener('ended', finish);
      el.addEventListener('error', finish);
      el.src = await blobToDataURL(audio);
      await el.play();
    },
    stop,
  };
}
