import { MULTILINGUAL, type ProviderId } from '../core/providers/types';
import { sampleTextForLocale } from '../core/sample-text';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import type { CatalogEntry } from '../read-aloud/catalog';
import { parseFavoriteVoices, serializeFavoriteVoices, toggleFavoriteVoice } from '../read-aloud/favorites';
import { compareVoiceLabels, encodeVoiceId, pluginVoiceLabel } from '../read-aloud/voice-catalog';
import type { ZoteroVoice } from '../read-aloud/zotero-voices';

/**
 * The voice browser of the settings pane: every voice Read Aloud can use, in
 * three columns — tier, then that tier's languages, then that language's
 * voices. The same three steps the reader's own popup takes (Voice Mode →
 * language → voice), so what is picked here is found there.
 *
 * The tiers are Zotero's: the enabled providers' voices are the Local tier's
 * remote entries, Standard and Premium are Zotero's own cloud voices
 * (read-aloud/zotero-voices.ts). Each voice has a play button for a short
 * sample and a heart that marks it as a favorite (read-aloud/favorites.ts).
 * The plugin's voices are sampled by their provider like any sentence, in
 * the locale's own language (core/sample-text.ts); Zotero's through
 * Zotero's own sample endpoint, which speaks a text of its own and costs no
 * credits. Samples are kept for the pane's lifetime, so replaying is free.
 * The plugin's labels drop the TTS- prefix — the tier column already says
 * whose voices these are.
 */

export const VOICE_BROWSER_IDS = {
  reload: 'ztts-voices-reload',
  status: 'ztts-voices-status',
  tiers: 'ztts-voices-tiers',
  locales: 'ztts-voices-locales',
  voices: 'ztts-voices-list',
} as const;

export const GLYPHS = { play: '▶', stop: '■', loading: '…', favorite: '♥', notFavorite: '♡' } as const;

/**
 * Zotero's three tiers, in the order its Voice Mode dropdown lists them
 * (TierSelect, reader bundle 38826). The plugin's voices are published
 * under `local`, beside the operating system's; the other two are Zotero's
 * cloud voices. A tier of the plugin's own is impossible — see
 * read-aloud/voice-catalog.ts.
 */
export type VoiceTier = 'standard' | 'premium' | 'local';
export const TIERS: readonly VoiceTier[] = ['standard', 'premium', 'local'];

/** Zotero's own words for them (reader.ftl `reader-read-aloud-voice-tier-*`). */
export const TIER_LABELS: Record<VoiceTier, string> = { standard: 'Standard', premium: 'Premium', local: 'Local' };

/** Which tier to open on: the plugin's own first — this is the plugin's pane — then whichever has voices at all. */
const TIER_PREFERENCE: readonly VoiceTier[] = ['local', 'standard', 'premium'];

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
  /** Zotero's own Standard and Premium voices; omitted where there is no Zotero to ask. */
  listZoteroVoices?(): Promise<ZoteroVoice[]>;
  /** One sample of Zotero's own, in the server's own words; required for Zotero's voices to be playable. */
  sampleZoteroVoice?(voiceId: string): Promise<Blob>;
  player: SamplePlayer;
  /** Display name of a locale ("zh-CN" → "Chinese (China)"); injected so tests do not depend on the ICU data. */
  localeName?(code: string): string;
}

type BrowserVoice = {
  /** null for Zotero's own voices: Zotero synthesizes those, and their ids are its own. */
  provider: ProviderId | null;
  id: string;
  encoded: string;
  label: string;
  tier: VoiceTier;
  locale: string;
};
type LocaleGroup = { locale: string; name: string; voices: BrowserVoice[] };
type TierGroup = { tier: VoiceTier; count: number; locales: LocaleGroup[] };

function defaultLocaleName(code: string): string {
  try {
    return new Intl.DisplayNames(undefined, { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}

/**
 * Every voice the browser lists: the plugin's from the catalog it publishes,
 * Zotero's from its own. A favorite is keyed by the id Read Aloud itself
 * uses — encoded `provider::voice` for ours, Zotero's own id for Zotero's,
 * which never decodes as one of ours.
 */
export function browserVoices(catalog: CatalogEntry[], zoteroVoices: readonly ZoteroVoice[] = []): BrowserVoice[] {
  const out: BrowserVoice[] = [];
  for (const entry of catalog) {
    for (const voice of entry.voices) {
      out.push({
        provider: entry.provider,
        id: voice.id,
        encoded: encodeVoiceId(entry.provider, voice.id),
        label: pluginVoiceLabel(entry.provider, voice.label, entry.name, false),
        tier: 'local',
        locale: voice.locale,
      });
    }
  }
  for (const voice of zoteroVoices) {
    out.push({ provider: null, id: voice.id, encoded: voice.id, label: voice.label, tier: voice.tier, locale: voice.locale });
  }
  return out;
}

/**
 * The columns as the browser shows them: always all three tiers, in Zotero's
 * order — an empty one reads "(0)" rather than disappearing and shifting the
 * others under the pointer — each holding its own locales, Multilingual
 * first and the rest by display name, each holding its voices by label.
 */
export function groupVoicesByTier(voices: BrowserVoice[], localeName: (code: string) => string): TierGroup[] {
  return TIERS.map((tier) => {
    const mine = voices.filter((voice) => voice.tier === tier);
    const byLocale = new Map<string, BrowserVoice[]>();
    for (const voice of mine) {
      const list = byLocale.get(voice.locale) ?? [];
      list.push(voice);
      byLocale.set(voice.locale, list);
    }
    const locales = [...byLocale.entries()]
      .map(([locale, list]) => ({
        locale,
        name: localeName(locale),
        voices: list.sort((a, b) => compareVoiceLabels(a.label, b.label)),
      }))
      .sort((a, b) => {
        const mul = Number(b.locale === MULTILINGUAL) - Number(a.locale === MULTILINGUAL);
        return mul || compareVoiceLabels(a.name, b.name);
      });
    return { tier, count: mine.length, locales };
  });
}

const describeError = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * One line of every column: the tier and language entries, and a voice row's
 * glyph buttons and label alike, are this many ems high with 3px above and
 * below, so the three columns share one rhythm.
 *
 * All of them are native buttons, which bring a minimum height of their own —
 * and the glyphs (▶ ♡) fall back to a symbol font whose line box is taller
 * still. Left alone, the voice rows stood noticeably further apart than the
 * columns beside them, so every entry caps its own line box here.
 */
const LINE_HEIGHT = '1.5';

const ROW_BUTTON_STYLE =
  'appearance: none; border: none; background: transparent; cursor: pointer; color: inherit; font: inherit;' +
  ` display: inline-flex; align-items: center; justify-content: center; height: ${LINE_HEIGHT}em; min-height: 0; line-height: 1; margin: 0; padding: 0 2px;`;
const COLUMN_ENTRY_STYLE =
  'display: block; width: 100%; text-align: start; appearance: none; border: none; background: transparent; color: inherit; font: inherit;' +
  ` line-height: ${LINE_HEIGHT}; min-height: 0; margin: 0; padding: 3px 8px; border-radius: 3px; cursor: pointer; white-space: nowrap;`;
const COLUMN_SELECTED_STYLE = COLUMN_ENTRY_STYLE + ' background: SelectedItem; color: SelectedItemText;';
const COLUMN_EMPTY_STYLE = COLUMN_ENTRY_STYLE + ' opacity: 0.5;';

export function initVoiceBrowserRows(
  doc: {
    getElementById(id: string): any;
    createElementNS(ns: string, tag: string): any;
  },
  deps: VoiceBrowserDeps,
): { load(): Promise<void>; refresh(): void } {
  const localeName = deps.localeName ?? defaultLocaleName;
  const status = (text: string) => doc.getElementById(VOICE_BROWSER_IDS.status)?.setAttribute('value', text);

  let tiers: TierGroup[] = [];
  let selectedTier: VoiceTier | null = null;
  let selectedLocale: string | null = null;
  let loading = false;
  /** The encoded id being fetched / being played; at most one of each, ever. */
  let busy: string | null = null;
  let playing: string | null = null;
  const samples = new Map<string, Blob>();
  const playButtons = new Map<string, any>();

  const readFavorites = () => parseFavoriteVoices(deps.prefs.get(FAVORITES_PREF));
  const tierGroup = () => tiers.find((g) => g.tier === selectedTier) ?? null;
  const localeGroup = () => tierGroup()?.locales.find((l) => l.locale === selectedLocale) ?? null;

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

  /** Where this voice's sample comes from, and the key it is kept under: the plugin synthesizes ours, Zotero serves its own. */
  function sampleSource(voice: BrowserVoice): { key: string; fetch(): Promise<Blob> } {
    if (voice.provider) {
      const text = sampleTextForLocale(voice.locale);
      return { key: voice.encoded + '\n' + text, fetch: () => deps.synthesizeSample(voice.provider!, voice.id, text) };
    }
    const sample = deps.sampleZoteroVoice;
    return {
      key: voice.encoded + '\nzotero-sample',
      fetch: () => (sample ? sample(voice.id) : Promise.reject(new Error('Zotero cannot play its own voices here'))),
    };
  }

  async function onPlay(voice: BrowserVoice): Promise<void> {
    if (playing === voice.encoded) {
      stopPlayback();
      return;
    }
    if (busy) return;
    busy = voice.encoded;
    setPlayGlyph(voice.encoded, GLYPHS.loading);
    try {
      const source = sampleSource(voice);
      let audio = samples.get(source.key);
      if (!audio) {
        audio = await source.fetch();
        samples.set(source.key, audio);
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

  /** One entry of the tier or the language column: a full-width button that reads "Name (count)". */
  function columnEntry(text: string, state: 'selected' | 'empty' | 'normal', onClick: () => void): any {
    const button = doc.createElementNS(XHTML, 'button');
    button.textContent = text;
    button.setAttribute(
      'style',
      state === 'selected' ? COLUMN_SELECTED_STYLE : state === 'empty' ? COLUMN_EMPTY_STYLE : COLUMN_ENTRY_STYLE,
    );
    button.addEventListener('click', onClick);
    return button;
  }

  function renderTiers(): void {
    const column = doc.getElementById(VOICE_BROWSER_IDS.tiers);
    if (!column) return;
    column.replaceChildren(
      ...tiers.map((group) =>
        columnEntry(
          `${TIER_LABELS[group.tier]} (${group.count})`,
          group.tier === selectedTier ? 'selected' : group.count ? 'normal' : 'empty',
          () => {
            selectedTier = group.tier;
            // Standard and Premium mostly speak the same languages: staying
            // on the current one makes comparing two tiers a single click.
            if (!group.locales.some((l) => l.locale === selectedLocale)) selectedLocale = group.locales[0]?.locale ?? null;
            render();
          },
        ),
      ),
    );
  }

  function renderLocales(): void {
    const column = doc.getElementById(VOICE_BROWSER_IDS.locales);
    if (!column) return;
    column.replaceChildren(
      ...(tierGroup()?.locales ?? []).map((group) =>
        columnEntry(`${group.name} (${group.voices.length})`, group.locale === selectedLocale ? 'selected' : 'normal', () => {
          selectedLocale = group.locale;
          renderLocales();
          renderVoices();
        }),
      ),
    );
  }

  function renderVoices(): void {
    const column = doc.getElementById(VOICE_BROWSER_IDS.voices);
    if (!column) return;
    playButtons.clear();
    const favorites = readFavorites();
    column.replaceChildren(
      ...(localeGroup()?.voices ?? []).map((voice) => {
        const row = doc.createElementNS(XHTML, 'div');
        row.setAttribute('style', 'display: flex; align-items: center; gap: 6px; padding: 3px 4px;');

        const play = doc.createElementNS(XHTML, 'button');
        play.textContent = busy === voice.encoded ? GLYPHS.loading : playing === voice.encoded ? GLYPHS.stop : GLYPHS.play;
        play.setAttribute('style', ROW_BUTTON_STYLE);
        play.setAttribute('title', voice.provider ? 'Play a sample' : 'Play Zotero’s own sample');
        play.addEventListener('click', () => void onPlay(voice));
        playButtons.set(voice.encoded, play);
        row.appendChild(play);

        const heart = doc.createElementNS(XHTML, 'button');
        heart.setAttribute('title', 'Favorite');
        paintHeart(heart, favorites.includes(voice.encoded));
        heart.addEventListener('click', () => onHeart(voice, heart));
        row.appendChild(heart);

        const label = doc.createElementNS(XHTML, 'span');
        label.textContent = voice.label;
        label.setAttribute('style', `flex: 1; line-height: ${LINE_HEIGHT}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`);
        row.appendChild(label);

        return row;
      }),
    );
  }

  function render(): void {
    renderTiers();
    renderLocales();
    renderVoices();
  }

  /** Keep the selection where it was when the new listing still has it; otherwise open on the first tier that holds voices. */
  function reselect(): void {
    if (!selectedTier || !tiers.some((g) => g.tier === selectedTier && g.count)) {
      selectedTier = TIER_PREFERENCE.find((tier) => tiers.some((g) => g.tier === tier && g.count)) ?? 'local';
    }
    const group = tierGroup();
    if (!group?.locales.some((l) => l.locale === selectedLocale)) selectedLocale = group?.locales[0]?.locale ?? null;
  }

  /**
   * Both catalogs, each failing on its own: a provider that cannot list must
   * not hide Zotero's voices, and Zotero being unreachable (offline, no
   * account) must not hide the plugin's. What failed is reported beside what
   * did arrive, never instead of it.
   */
  async function load(): Promise<void> {
    if (loading) return;
    loading = true;
    status('Listing voices…');
    const problems: string[] = [];
    const failed = (what: string) => (e: unknown) => {
      problems.push(what ? `${what}: ${describeError(e)}` : describeError(e));
      return [];
    };
    try {
      const [catalog, zoteroVoices] = await Promise.all([
        deps.listCatalog().catch(failed('the plugin’s voices')),
        // Zotero's own failures already name Zotero (read-aloud/zotero-voices.ts)
        deps.listZoteroVoices?.().catch(failed('')) ?? Promise.resolve([]),
      ]);
      tiers = groupVoicesByTier(browserVoices(catalog, zoteroVoices), localeName);
      const total = tiers.reduce((n, g) => n + g.count, 0);
      reselect();
      render();
      const trouble = problems.length ? ` — ${problems.join('; ')}` : '';
      status(
        total
          ? `${total} voices. Play a sample; the heart marks a favorite.${trouble}`
          : problems.length
            ? `Listing voices failed: ${problems.join('; ')}`
            : 'No voices. Enable a provider above, then press Reload.',
      );
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
