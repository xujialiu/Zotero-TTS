import { MULTILINGUAL, type ProviderId } from '../core/providers/types';
import { clampSpeed, readPersistedSpeed } from '../core/read-aloud-speed';
import { sampleTextForLocale } from '../core/sample-text';
import { PREF_PREFIX, type PrefsBackend } from '../core/settings';
import type { CatalogEntry } from '../read-aloud/catalog';
import { setDefaultSpeed, type SpeedManagerLike } from '../read-aloud/default-speed';
import { regionOfLocale, setDefaultVoice } from '../read-aloud/default-voice';
import { parseFavoriteVoices, serializeFavoriteVoices, toggleFavoriteVoice } from '../read-aloud/favorites';
import { isMultilingualVoiceId, memoryLangForLocale, readMemory, sameChoice, type VoiceChoice } from '../read-aloud/read-aloud-memory';
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
 *
 * A speed slider — the popup's own, 0.5×–3.0× by 0.1 — plays the samples at
 * the speed Read Aloud will read at, and releasing it makes its value that
 * speed: the default Read Aloud starts with, in every document and at once
 * in one that is playing (read-aloud/default-speed.ts) — while the "one
 * speed everywhere" switch is on; off, Zotero keeps a speed per document
 * language and the slider drives the samples only. Dragging (`input`)
 * drives the samples only; the commit is the `change` on release, the way
 * the popup's own slider persists on pointer-up. Audio is always
 * synthesized at the voice's natural pace (core/providers/types.ts): Read
 * Aloud time-stretches it on playback with the pitch kept, and so does the
 * sample player, so the cached sample serves every speed.
 *
 * The voice Read Aloud starts with — the one remembered across documents
 * (read-aloud/read-aloud-memory.ts), which is the popup's last pick — is
 * shown: the browser opens on its tier and language, its row is painted
 * like a selected column entry, and the status line names it with the
 * speed; a pick in any tab's popup while the pane is open moves the
 * highlight there (the pane observes the memory pref). The memory is the
 * source of truth; the browser is its view.
 */

export const VOICE_BROWSER_IDS = {
  reload: 'ztts-voices-reload',
  status: 'ztts-voices-status',
  tiers: 'ztts-voices-tiers',
  locales: 'ztts-voices-locales',
  voices: 'ztts-voices-list',
  speed: 'ztts-voices-speed',
  speedValue: 'ztts-voices-speed-value',
} as const;

/**
 * The speed Read Aloud will start with: the one kept across documents
 * (read-aloud/read-aloud-memory.ts — set by this slider, and learned from
 * every popup slider move and shortcut, whether or not the "same for every
 * document" switch applies it), else the one Zotero itself last persisted
 * for any language, else 1.
 */
export function startingSpeed(prefs: PrefsBackend): number {
  return clampSpeed(readMemory(prefs).speed ?? readPersistedSpeed(prefs, null));
}

/** Zotero's popup shows the speed as "1.0×"; so does the slider's label here. */
export const formatSpeed = (speed: number) => `${speed.toFixed(1)}×`;

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
  /** Starts the audio at `rate` times its natural pace, pitch kept; onDone fires once, when playback ends or fails. */
  play(audio: Blob, rate: number, onDone: () => void): Promise<void>;
  /** Changes the pace of whatever is playing right now; nothing to do otherwise. */
  setRate(rate: number): void;
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
  /** The ReadAloudManager of every open reader, looked up when the slider is released; omitted where there is no Zotero to ask. */
  readAloudManagers?(): SpeedManagerLike[];
  /** The "one speed everywhere" switch, read when the slider is released; off, the slider drives the samples only. Omitted means on. */
  globalSpeed?(): boolean;
  /** A reader that misbehaved while the speed was applied; the speed is stored regardless. */
  log?(e: unknown): void;
  /**
   * Calls back whenever the memory pref changes — the popup's slider and
   * the shortcuts move it through memory-sync — and returns the way to stop.
   * The pane's own writes come back through it too; the slider is already
   * there then.
   */
  watchMemory?(onChange: () => void): () => void;
  /**
   * Puts a default just picked here in front of every tab that is reading
   * (read-aloud/memory-sync.ts spreadVoice); the memory and Zotero's entry
   * say it by then. Omitted where there is no Zotero to reach.
   */
  spreadVoice?(choice: VoiceChoice | null): void;
}

export type BrowserVoice = {
  /** null for Zotero's own voices: Zotero synthesizes those, and their ids are its own. */
  provider: ProviderId | null;
  id: string;
  /** The id Read Aloud knows the voice by: `provider::id` for the plugin's, Zotero's own for Zotero's. */
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

/**
 * The rows the remembered voice names: those with its id under the language
 * key it was chosen under (memoryLangForLocale — Zotero's own key, so a
 * Zotero voice listed under several locales is the default only where it
 * was picked). A voice that is global by its id (isMultilingualVoiceId —
 * a choice from before the catalog filed such voices under "Multiple
 * languages") is applied to every document whatever key it was remembered
 * under, so any row of it is the default then.
 */
export function defaultVoiceRows(voices: readonly BrowserVoice[], choice: VoiceChoice | null): BrowserVoice[] {
  if (!choice) return [];
  const byId = voices.filter((voice) => voice.encoded === choice.id);
  const exact = byId.filter((voice) => memoryLangForLocale(voice.locale) === choice.lang);
  if (exact.length) return exact;
  return isMultilingualVoiceId(choice.id) ? byId : [];
}

/**
 * The status line's account of what Read Aloud starts with: the default
 * voice by its row's label and language — by its id when no listed row is
 * it, so a provider switched off does not read as "no default" — or
 * Zotero's own per-language choice when none is remembered, and the
 * default speed; `speed` null while "one speed everywhere" is off, when
 * Zotero keeps a speed per document language and the slider only paces
 * the samples.
 */
export function defaultVoiceLine(choice: VoiceChoice | null, home: BrowserVoice | null, localeName: (code: string) => string, speed: number | null): string {
  const voice = !choice ? 'Zotero’s own choice' : home ? `${home.label} · ${localeName(home.locale)}` : `${choice.id} (not listed now)`;
  return `Default: ${voice} · ${speed === null ? 'speed per language' : formatSpeed(speed)}`;
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
const ROW_STYLE = 'display: flex; align-items: center; gap: 6px; padding: 3px 4px; border-radius: 3px;';
/** The default voice's row: painted like a selected column entry. */
const ROW_DEFAULT_STYLE = ROW_STYLE + ' background: SelectedItem; color: SelectedItemText;';
/** The voice's name, a button like the column entries: a click makes the voice the default. */
const ROW_LABEL_STYLE =
  'flex: 1; min-width: 0; text-align: start; appearance: none; border: none; background: transparent; color: inherit; font: inherit;' +
  ` line-height: ${LINE_HEIGHT}; min-height: 0; margin: 0; padding: 0 2px; cursor: pointer; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
const DEFAULT_ROW_TITLE = 'The default voice: Read Aloud starts with it. Click to clear it';
const PICK_ROW_TITLE = 'Click to make it the default voice';

export function initVoiceBrowserRows(
  doc: {
    getElementById(id: string): any;
    createElementNS(ns: string, tag: string): any;
  },
  deps: VoiceBrowserDeps,
): { load(): Promise<void>; refresh(): void; dispose(): void } {
  const localeName = deps.localeName ?? defaultLocaleName;
  const status = (text: string) => doc.getElementById(VOICE_BROWSER_IDS.status)?.setAttribute('value', text);

  let tiers: TierGroup[] = [];
  /** Every voice of the last listing, flat; null until one has arrived. */
  let listed: BrowserVoice[] | null = null;
  /** What failed to list last time, shown beside what did until the next listing. */
  let problems: string[] = [];
  let selectedTier: VoiceTier | null = null;
  let selectedLocale: string | null = null;
  let loading = false;
  /** The encoded id being fetched / being played; at most one of each, ever. */
  let busy: string | null = null;
  let playing: string | null = null;
  let speed = startingSpeed(deps.prefs);
  /** The remembered voice and the listed rows that are it (defaultVoiceRows); the first row is where the browser opens. */
  let choice = readMemory(deps.prefs).voice;
  let defaults: BrowserVoice[] = [];
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
      await deps.player.play(audio, speed, () => {
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

  /**
   * A row clicked: its voice is the default now — the memory and Zotero's
   * entry for its language (read-aloud/default-voice.ts), then every tab
   * that is reading (the spreadVoice dep); the default clicked again is
   * cleared. The memory observer, where there is one, has followed the
   * write already; followChoice is idempotent for the rest.
   */
  function onPick(voice: BrowserVoice): void {
    const next = defaults.includes(voice)
      ? null
      : { id: voice.encoded, lang: memoryLangForLocale(voice.locale), region: regionOfLocale(voice.locale), tier: voice.tier };
    setDefaultVoice(deps.prefs, next);
    deps.spreadVoice?.(next ? { id: next.id, lang: next.lang } : null);
    followChoice();
    paintStatus();
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
        const isDefault = defaults.includes(voice);
        const row = doc.createElementNS(XHTML, 'div');
        row.setAttribute('style', isDefault ? ROW_DEFAULT_STYLE : ROW_STYLE);

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

        const label = doc.createElementNS(XHTML, 'button');
        label.textContent = voice.label;
        label.setAttribute('style', ROW_LABEL_STYLE);
        label.setAttribute('title', isDefault ? DEFAULT_ROW_TITLE : PICK_ROW_TITLE);
        label.addEventListener('click', () => onPick(voice));
        row.appendChild(label);

        return row;
      }),
    );
  }

  /** The slider and its label show `speed`; a pane without the slider (an older markup) just has no speed control. */
  function paintSpeed(): void {
    const slider = doc.getElementById(VOICE_BROWSER_IDS.speed);
    if (slider) slider.value = String(speed);
    const label = doc.getElementById(VOICE_BROWSER_IDS.speedValue);
    if (label) label.textContent = formatSpeed(speed);
  }

  /**
   * The status line once voices are listed: the default voice and the speed
   * (defaultVoiceLine) — the slider's value, which is the default while
   * "one speed everywhere" is on, read here so the checkbox applies at
   * the next repaint — with what failed to list beside it, never instead
   * of it. Nothing listed says why. Until the first listing the line is
   * load()'s own message, so this leaves it alone.
   */
  function paintStatus(): void {
    if (!listed) return;
    if (!listed.length) {
      status(problems.length ? `Listing voices failed: ${problems.join('; ')}` : 'No voices. Enable a provider above, then press Reload.');
      return;
    }
    const trouble = problems.length ? ` — ${problems.join('; ')}` : '';
    const defaultSpeed = (deps.globalSpeed?.() ?? true) ? speed : null;
    status(defaultVoiceLine(choice, defaults[0] ?? null, localeName, defaultSpeed) + trouble);
  }

  /** A drag of the slider: the value it reports, kept on Zotero's range, applied to the sample playing right now. */
  function onSpeedInput(): void {
    const slider = doc.getElementById(VOICE_BROWSER_IDS.speed);
    speed = clampSpeed(Number(slider?.value));
    paintSpeed();
    paintStatus();
    deps.player.setRate(speed);
  }

  /** The slider released (or stepped by a key): its value is the default speed now, everywhere at once — unless the speed is Zotero's per language. */
  function onSpeedChange(): void {
    onSpeedInput();
    if (deps.globalSpeed?.() ?? true) setDefaultSpeed(deps.prefs, speed, deps.readAloudManagers?.() ?? [], deps.log);
  }

  /**
   * The memory moved elsewhere — the popup's slider or a shortcut for the
   * speed, a voice picked in some tab's popup (memory-sync learns it) for
   * the voice: the slider, the highlighted row and the status line follow,
   * and so does a sample that is playing. The pane's own writes come back
   * through here and find everything there already.
   */
  function onMemoryChange(): void {
    const nextSpeed = startingSpeed(deps.prefs);
    if (nextSpeed !== speed) {
      speed = nextSpeed;
      paintSpeed();
      deps.player.setRate(speed);
    }
    followChoice();
    paintStatus();
  }

  /**
   * The remembered voice as it is now: when it changed, the highlight moves
   * to it and the columns open on its row, the way the first listing does —
   * the pane is the memory's view. Nothing listed is it (cleared, or not
   * listed now): the highlight goes and the columns stay where they are.
   */
  function followChoice(): void {
    const next = readMemory(deps.prefs).voice;
    if (sameChoice(next, choice)) return;
    choice = next;
    defaults = defaultVoiceRows(listed ?? [], choice);
    // A default row in view (the row just clicked, say) keeps the columns
    // where they are; only a default elsewhere moves them
    const home = defaults.find((v) => v.tier === selectedTier && v.locale === selectedLocale) ?? defaults[0];
    if (home) {
      selectedTier = home.tier;
      selectedLocale = home.locale;
      render();
    } else {
      renderVoices();
    }
  }

  function render(): void {
    renderTiers();
    renderLocales();
    renderVoices();
  }

  /**
   * After a settings restore: hearts from the pref, the speed and the
   * default voice from what is remembered now. The tier and language being
   * browsed stay — only the first listing opens on the default.
   */
  function refresh(): void {
    speed = startingSpeed(deps.prefs);
    choice = readMemory(deps.prefs).voice;
    defaults = defaultVoiceRows(listed ?? [], choice);
    paintSpeed();
    paintStatus();
    render();
  }

  /**
   * Keep the selection where it was when the new listing still has it. The
   * first listing — and one that lost the tier being browsed — opens on the
   * default voice's tier and language, where its row is; without a listed
   * default, on the plugin's own tier, else the first that holds voices.
   */
  function reselect(): void {
    if (!selectedTier || !tiers.some((g) => g.tier === selectedTier && g.count)) {
      const home = defaults[0];
      selectedTier = home?.tier ?? TIER_PREFERENCE.find((tier) => tiers.some((g) => g.tier === tier && g.count)) ?? 'local';
      selectedLocale = home?.locale ?? selectedLocale;
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
    const failures: string[] = [];
    const failed = (what: string) => (e: unknown) => {
      failures.push(what ? `${what}: ${describeError(e)}` : describeError(e));
      return [];
    };
    try {
      const [catalog, zoteroVoices] = await Promise.all([
        deps.listCatalog().catch(failed('the plugin’s voices')),
        // Zotero's own failures already name Zotero (read-aloud/zotero-voices.ts)
        deps.listZoteroVoices?.().catch(failed('')) ?? Promise.resolve([]),
      ]);
      listed = browserVoices(catalog, zoteroVoices);
      problems = failures;
      tiers = groupVoicesByTier(listed, localeName);
      defaults = defaultVoiceRows(listed, choice);
      reselect();
      render();
      paintStatus();
    } finally {
      loading = false;
    }
  }

  doc.getElementById(VOICE_BROWSER_IDS.reload)?.addEventListener('command', () => void load());
  doc.getElementById(VOICE_BROWSER_IDS.speed)?.addEventListener('input', onSpeedInput);
  doc.getElementById(VOICE_BROWSER_IDS.speed)?.addEventListener('change', onSpeedChange);
  paintSpeed();
  const unwatch = deps.watchMemory?.(onMemoryChange) ?? null;

  /** The pane is closing: stop following the memory, and stop the sample. */
  function dispose(): void {
    unwatch?.();
    stopPlayback();
  }

  return { load, refresh, dispose };
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

/**
 * Plays one sample at a time through a fresh <audio> element of the pane's
 * own document. The speed is the element's playbackRate with preservesPitch
 * on — a time-stretch with the pitch kept, which is what Read Aloud does to
 * its own audio (the reader's stretchAudioBuffer; a plain rate change would
 * shift the pitch like a turntable, and that is not how reading sounds).
 */
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
  /**
   * Both rates: setting `src` runs the element's load algorithm, whose step 7
   * puts playbackRate back to defaultPlaybackRate — a rate set before the
   * source is lost, and the sample plays at 1× (the first build did exactly
   * that). So the rate goes on after the source, and onto the default too,
   * which any later load would copy again.
   */
  const applyRate = (el: HTMLAudioElement, rate: number) => {
    el.defaultPlaybackRate = rate;
    el.playbackRate = rate;
  };
  return {
    async play(audio, rate, onDone) {
      stop();
      const el = createAudio();
      current = el;
      done = onDone;
      el.addEventListener('ended', finish);
      el.addEventListener('error', finish);
      el.src = await blobToDataURL(audio);
      el.preservesPitch = true;
      applyRate(el, rate);
      await el.play();
    },
    setRate(rate) {
      if (current) applyRate(current, rate);
    },
    stop,
  };
}
