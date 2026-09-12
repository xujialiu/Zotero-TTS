import type { ProviderId } from './providers/types';
import type { ShortcutAction } from './shortcut-actions';
import { VOLUME_DEFAULT, VOLUME_MAX, VOLUME_MIN } from './read-aloud-volume';

export const PROVIDER_IDS: readonly ProviderId[] = ['openai', 'azure', 'cloudflare', 'speechify', 'fish', 'fishspeech', 'local', 'system'];

export type AutoScrollMode = 'outside' | 'sentence';
export const autoScrollMode = (value: unknown): AutoScrollMode => value === 'outside' ? 'outside' : 'sentence';

export interface Settings {
  /** Each provider is switched on independently; every enabled one contributes voices. */
  openai: {
    enabled: boolean;
    apiKey: string;
    baseURL: string;
    model: string;
    voice: string;
    /** Comma-separated voice ids to offer; empty means "ask the server, else the voices its preset documents, else OpenAI's own". */
    voices: string;
    /** Extra request headers, `Name: value` pairs separated by `;` or newlines (core/headers.ts). */
    headers: string;
    /** Which server the section talks to (core/server-presets.ts); empty means "guess from the address". */
    server: string;
    /** The Base URL, Model, API key, Voices and Extra headers last used with each server, a JSON object keyed by preset (core/server-presets.ts parsePresetValues): what the Server dropdown restores on a switch back, so nothing typed for one server is sent to another. */
    presetValues: string;
  };
  azure: { enabled: boolean; apiKey: string; region: string; voice: string };
  /**
   * Cloudflare Workers AI (core/providers/cloudflare.ts, issue #72): the
   * account id is part of every request's URL, the token its
   * Authorization header. No address and no model: every text-to-speech
   * model the account lists contributes its voices.
   */
  cloudflare: { enabled: boolean; accountId: string; apiToken: string };
  /**
   * Speechify (core/providers/speechify.ts, issue #79): one key, no
   * address and no model — the voice's language picks the model, and
   * every voice the key lists is offered.
   */
  speechify: { enabled: boolean; apiKey: string };
  /**
   * Fish Audio's cloud API (core/providers/fish.ts, issue #89): one key;
   * `freeOnly` sends every request to the free model, off to the paid one;
   * Each voice source is independent; disabling manual voices retains
   * the pasted ids and links in `voices`.
   */
  fish: { enabled: boolean; apiKey: string; freeOnly: boolean; voices: string; includeOfficial: boolean; includeOwn: boolean; includeManual: boolean };
  /** A Fish Speech server of the user's own (core/providers/fishspeech.ts, issue #89); `headers` as openai.headers. */
  fishspeech: { enabled: boolean; baseURL: string; headers: string };
  /** `headers`: extra request headers for a gateway in front of the server, same format as openai.headers. */
  local: { enabled: boolean; engine: string; baseURL: string; voice: string; headers: string };
  /**
   * The operating system's own voices, synthesized by the plugin through a
   * helper process (core/providers/system) so they are ordinary plugin
   * voices — browsable, sampleable, favoritable, cached, word-highlighted.
   * Nothing to configure: there is no key and no address, only the switch.
   * Windows only for now; elsewhere enabling it fails with a message.
   */
  system: { enabled: boolean };
  /**
   * The WebDAV folder the plugin syncs through (core/webdav.ts,
   * ui/webdav-rows.ts); the password is a plain pref like the API keys.
   * `syncPositions` carries the reading positions through the folder
   * (read-aloud/position-transport.ts, #40); `autoUploadSettings` keeps
   * this machine's settings file there fresh (core/settings-autoupload.ts,
   * #41). Both are switches, so they live here in DEFAULTS and ride
   * settings backup; the position data and the machine id never do.
   */
  webdav: { url: string; username: string; password: string; syncPositions: boolean; autoUploadSettings: boolean; syncSettings: boolean };
  /** Warm the audio cache this many sentences ahead of playback (read-aloud/remote-interface.ts); `prefetchEnabled` is the switch. */
  prefetch: number;
  prefetchEnabled: boolean;
  /** Keep synthesized audio in the in-memory LRU (core/memory-cache.ts). */
  cacheAudio: boolean;
  /**
   * Keyboard shortcuts that drive Zotero's own Read Aloud — the playback
   * speed and volume, skipping by sentence or paragraph, the highlight level
   * (core/shortcut-actions.ts) — as text understood by core/shortcuts.ts
   * ("Shift+Z"). Empty disables one.
   */
  shortcuts: Record<ShortcutAction, string>;
  readAloud: {
    /** Follow only clipped content, or center each new sentence. */
    autoScrollMode: AutoScrollMode;
    /** Expand each newly shown player once, leaving manual folding alone. */
    openExpanded: boolean;
    /** One Read Aloud voice for every document and every open tab (read-aloud/memory-sync.ts); the pref name predates the speed's own switch below. */
    sameForAllDocuments: boolean;
    /** One speed for every document and every open tab (read-aloud/default-speed.ts); off, Zotero keeps a speed per document language. */
    globalSpeed: boolean;
    /**
     * Voices marked with the heart in the settings' voice browser: a JSON
     * array of encoded voice ids (read-aloud/favorites.ts). A string
     * because voice ids may contain any character, commas included.
     */
    favoriteVoices: string;
    /** Publish only the favorites; with none marked (or none listed), everything is offered. */
    favoritesOnly: boolean;
    /**
     * The pause before the next sentence, for every voice in the player
     * whatever its tier (read-aloud/pauses.ts, issue #44): `sentenceDelayMs`
     * is the pause at 1× speed and shrinks with the speed. Off, each voice
     * pauses as Zotero's catalog says — 300 ms on a few Premium voices,
     * none elsewhere — and that value does not follow the speed.
     */
    sentenceDelayEnabled: boolean;
    sentenceDelayMs: number;
    /** Added on top where the next sentence begins a paragraph; off, Zotero's own 200 ms, for every voice alike. */
    paragraphDelayEnabled: boolean;
    paragraphDelayMs: number;
    /**
     * How loud Read Aloud plays, in percent of Zotero's own output, for
     * every voice in the player and the samples (read-aloud/volume.ts,
     * issue #62): 100 leaves the audio as Zotero plays it. The volume keys
     * and the pane's field both write this one number.
     */
    volume: number;
    /**
     * Put back a page's first line that Zotero's document analysis threw
     * out of the reading order when a sentence runs onto it
     * (read-aloud/skipped-lines.ts, issue #87). Read when a document's
     * structure loads, so a change applies to documents opened after it.
     */
    restoreSkippedLines: boolean;
  };
  /** The colors of Zotero's Read Aloud highlights (read-aloud/highlight-style.ts); opacities in percent. */
  highlight: {
    wordColor: string;
    wordAlpha: number;
    sentenceColor: string;
    sentenceAlpha: number;
    /** In word mode, keep the sentence highlighted as well. */
    sentenceUnderWord: boolean;
  };
}

export interface PrefsBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Remove a user value so the default applies again; optional because tests' fakes may omit it. */
  clear?(key: string): void;
}

export const PREF_PREFIX = 'extensions.zotero.zotero-tts.';

/** The longest pause the pane accepts, in milliseconds; both pause settings are clamped to 0..this. */
export const MAX_PAUSE_MS = 5000;

export const DEFAULTS: Settings = {
  openai: {
    enabled: true,
    apiKey: '',
    baseURL: 'https://api.openai.com',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
    voices: '',
    headers: '',
    server: '',
    presetValues: '',
  },
  azure: { enabled: false, apiKey: '', region: 'eastasia', voice: 'zh-CN-XiaoxiaoNeural' },
  cloudflare: { enabled: false, accountId: '', apiToken: '' },
  speechify: { enabled: false, apiKey: '' },
  fish: { enabled: false, apiKey: '', freeOnly: true, voices: '', includeOfficial: true, includeOwn: true, includeManual: true },
  fishspeech: { enabled: false, baseURL: 'http://localhost:8080', headers: '' },
  local: { enabled: false, engine: 'kokoro', baseURL: 'http://localhost:8880', voice: 'af_bella', headers: '' },
  system: { enabled: false },
  webdav: { url: '', username: '', password: '', syncPositions: false, autoUploadSettings: false, syncSettings: false },
  prefetch: 3,
  prefetchEnabled: true,
  cacheAudio: true,
  shortcuts: {
    speedReset: 'Shift+Z',
    speedDown: 'Shift+X',
    speedUp: 'Shift+C',
    // Taken only while a Read Aloud session is open: the reader uses these to
    // grow a text selection by a line and to resize a selected annotation
    volumeDown: 'Shift+ArrowDown',
    volumeUp: 'Shift+ArrowUp',
    // Bare arrows: taken only while a Read Aloud session is open, the reader pages with them otherwise
    previousSentence: 'ArrowLeft',
    nextSentence: 'ArrowRight',
    previousParagraph: 'Shift+ArrowLeft',
    nextParagraph: 'Shift+ArrowRight',
    // The one smart key (notes/shift_space_logic.md), consumed whenever Read
    // Aloud exists: session open, play/pause; idle, start from the selection,
    // else the stored position, else Zotero's default start
    startFromSelection: 'Shift+Space',
    // Taken only while a Read Aloud session is open
    returnToSpoken: 'Shift+Enter',
    // The player's Options panel; taken only while the player is on screen
    toggleOptions: 'Shift+O',
    // Every player in every window; taken only while one is open somewhere (issue #71)
    stopReading: 'Shift+S',
    // Zotero's own highlight level, word on / off (issue #67); taken on any
    // reader, idle included — the level is a setting, set before play too
    toggleWordHighlight: 'Shift+W',
    toggleAutoScroll: 'Shift+A',
  },
  readAloud: {
    autoScrollMode: 'sentence',
    sameForAllDocuments: true,
    globalSpeed: true,
    favoriteVoices: '',
    favoritesOnly: false,
    // On at 0 by the owner's decision (issue #44): every voice runs sentence
    // to sentence, the Premium voices' 300 ms included; Zotero's own pacing
    // is the off state. The paragraph default equals Zotero's own 200 ms at
    // 1× and, unlike Zotero's, shrinks with the speed.
    sentenceDelayEnabled: true,
    sentenceDelayMs: 0,
    paragraphDelayEnabled: true,
    paragraphDelayMs: 200,
    volume: VOLUME_DEFAULT,
    // On by the owner's decision (issue #87): a line put back is part of a
    // sentence, and the off state is for a page header read aloud
    restoreSkippedLines: true,
    openExpanded: false,
  },
  // A blue word (near Zotero's own #4072e5) on a yellow sentence, both at 70%, the sentence
  // kept under the word; the reader still draws them at its own 0.4 (light) / 0.3 (dark).
  // Zotero's own is #4072e5 at 45% and 30%. Green at 100% until 1.8.1.
  highlight: { wordColor: '#3478f6', wordAlpha: 70, sentenceColor: '#ffff00', sentenceAlpha: 70, sentenceUnderWord: true },
};

function str(prefs: PrefsBackend, key: string, fallback: string): string {
  const v = prefs.get(PREF_PREFIX + key);
  return typeof v === 'string' ? v : fallback;
}

function num(prefs: PrefsBackend, key: string, fallback: number, min: number, max: number): number {
  const v = prefs.get(PREF_PREFIX + key);
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function bool(prefs: PrefsBackend, key: string, fallback: boolean): boolean {
  const v = prefs.get(PREF_PREFIX + key);
  return typeof v === 'boolean' ? v : fallback;
}

export function loadSettings(prefs: PrefsBackend): Settings {
  return {
    openai: {
      enabled: bool(prefs, 'openai.enabled', DEFAULTS.openai.enabled),
      apiKey: str(prefs, 'openai.apiKey', DEFAULTS.openai.apiKey),
      baseURL: str(prefs, 'openai.baseURL', DEFAULTS.openai.baseURL),
      model: str(prefs, 'openai.model', DEFAULTS.openai.model),
      voice: str(prefs, 'openai.voice', DEFAULTS.openai.voice),
      voices: str(prefs, 'openai.voices', DEFAULTS.openai.voices),
      headers: str(prefs, 'openai.headers', DEFAULTS.openai.headers),
      server: str(prefs, 'openai.server', DEFAULTS.openai.server),
      presetValues: str(prefs, 'openai.presetValues', DEFAULTS.openai.presetValues),
    },
    azure: {
      enabled: bool(prefs, 'azure.enabled', DEFAULTS.azure.enabled),
      apiKey: str(prefs, 'azure.apiKey', DEFAULTS.azure.apiKey),
      region: str(prefs, 'azure.region', DEFAULTS.azure.region),
      voice: str(prefs, 'azure.voice', DEFAULTS.azure.voice),
    },
    cloudflare: {
      enabled: bool(prefs, 'cloudflare.enabled', DEFAULTS.cloudflare.enabled),
      accountId: str(prefs, 'cloudflare.accountId', DEFAULTS.cloudflare.accountId),
      apiToken: str(prefs, 'cloudflare.apiToken', DEFAULTS.cloudflare.apiToken),
    },
    speechify: {
      enabled: bool(prefs, 'speechify.enabled', DEFAULTS.speechify.enabled),
      apiKey: str(prefs, 'speechify.apiKey', DEFAULTS.speechify.apiKey),
    },
    fish: {
      enabled: bool(prefs, 'fish.enabled', DEFAULTS.fish.enabled),
      apiKey: str(prefs, 'fish.apiKey', DEFAULTS.fish.apiKey),
      freeOnly: bool(prefs, 'fish.freeOnly', DEFAULTS.fish.freeOnly),
      voices: str(prefs, 'fish.voices', DEFAULTS.fish.voices),
      includeOfficial: bool(prefs, 'fish.includeOfficial', DEFAULTS.fish.includeOfficial),
      includeOwn: bool(prefs, 'fish.includeOwn', DEFAULTS.fish.includeOwn),
      includeManual: bool(prefs, 'fish.includeManual', DEFAULTS.fish.includeManual),
    },
    fishspeech: {
      enabled: bool(prefs, 'fishspeech.enabled', DEFAULTS.fishspeech.enabled),
      baseURL: str(prefs, 'fishspeech.baseURL', DEFAULTS.fishspeech.baseURL),
      headers: str(prefs, 'fishspeech.headers', DEFAULTS.fishspeech.headers),
    },
    local: {
      enabled: bool(prefs, 'local.enabled', DEFAULTS.local.enabled),
      engine: str(prefs, 'local.engine', DEFAULTS.local.engine),
      baseURL: str(prefs, 'local.baseURL', DEFAULTS.local.baseURL),
      voice: str(prefs, 'local.voice', DEFAULTS.local.voice),
      headers: str(prefs, 'local.headers', DEFAULTS.local.headers),
    },
    system: {
      enabled: bool(prefs, 'system.enabled', DEFAULTS.system.enabled),
    },
    webdav: {
      url: str(prefs, 'webdav.url', DEFAULTS.webdav.url),
      username: str(prefs, 'webdav.username', DEFAULTS.webdav.username),
      password: str(prefs, 'webdav.password', DEFAULTS.webdav.password),
      syncPositions: bool(prefs, 'webdav.syncPositions', DEFAULTS.webdav.syncPositions),
      autoUploadSettings: bool(prefs, 'webdav.autoUploadSettings', DEFAULTS.webdav.autoUploadSettings),
      syncSettings: bool(prefs, 'webdav.syncSettings', DEFAULTS.webdav.syncSettings),
    },
    prefetch: num(prefs, 'prefetch', DEFAULTS.prefetch, 1, 10),
    prefetchEnabled: bool(prefs, 'prefetchEnabled', DEFAULTS.prefetchEnabled),
    cacheAudio: bool(prefs, 'cacheAudio', DEFAULTS.cacheAudio),
    shortcuts: {
      speedReset: str(prefs, 'shortcuts.speedReset', DEFAULTS.shortcuts.speedReset),
      speedDown: str(prefs, 'shortcuts.speedDown', DEFAULTS.shortcuts.speedDown),
      speedUp: str(prefs, 'shortcuts.speedUp', DEFAULTS.shortcuts.speedUp),
      volumeDown: str(prefs, 'shortcuts.volumeDown', DEFAULTS.shortcuts.volumeDown),
      volumeUp: str(prefs, 'shortcuts.volumeUp', DEFAULTS.shortcuts.volumeUp),
      previousSentence: str(prefs, 'shortcuts.previousSentence', DEFAULTS.shortcuts.previousSentence),
      nextSentence: str(prefs, 'shortcuts.nextSentence', DEFAULTS.shortcuts.nextSentence),
      previousParagraph: str(prefs, 'shortcuts.previousParagraph', DEFAULTS.shortcuts.previousParagraph),
      nextParagraph: str(prefs, 'shortcuts.nextParagraph', DEFAULTS.shortcuts.nextParagraph),
      startFromSelection: str(prefs, 'shortcuts.startFromSelection', DEFAULTS.shortcuts.startFromSelection),
      returnToSpoken: str(prefs, 'shortcuts.returnToSpoken', DEFAULTS.shortcuts.returnToSpoken),
      toggleOptions: str(prefs, 'shortcuts.toggleOptions', DEFAULTS.shortcuts.toggleOptions),
      stopReading: str(prefs, 'shortcuts.stopReading', DEFAULTS.shortcuts.stopReading),
      toggleWordHighlight: str(prefs, 'shortcuts.toggleWordHighlight', DEFAULTS.shortcuts.toggleWordHighlight),
      toggleAutoScroll: str(prefs, 'shortcuts.toggleAutoScroll', DEFAULTS.shortcuts.toggleAutoScroll),
    },
    readAloud: {
      autoScrollMode: autoScrollMode(prefs.get(PREF_PREFIX + 'readAloud.autoScrollMode')),
      sameForAllDocuments: bool(prefs, 'readAloud.sameForAllDocuments', DEFAULTS.readAloud.sameForAllDocuments),
      globalSpeed: bool(prefs, 'readAloud.globalSpeed', DEFAULTS.readAloud.globalSpeed),
      favoriteVoices: str(prefs, 'readAloud.favoriteVoices', DEFAULTS.readAloud.favoriteVoices),
      favoritesOnly: bool(prefs, 'readAloud.favoritesOnly', DEFAULTS.readAloud.favoritesOnly),
      sentenceDelayEnabled: bool(prefs, 'readAloud.sentenceDelayEnabled', DEFAULTS.readAloud.sentenceDelayEnabled),
      sentenceDelayMs: num(prefs, 'readAloud.sentenceDelayMs', DEFAULTS.readAloud.sentenceDelayMs, 0, MAX_PAUSE_MS),
      paragraphDelayEnabled: bool(prefs, 'readAloud.paragraphDelayEnabled', DEFAULTS.readAloud.paragraphDelayEnabled),
      paragraphDelayMs: num(prefs, 'readAloud.paragraphDelayMs', DEFAULTS.readAloud.paragraphDelayMs, 0, MAX_PAUSE_MS),
      volume: num(prefs, 'readAloud.volume', DEFAULTS.readAloud.volume, VOLUME_MIN, VOLUME_MAX),
      restoreSkippedLines: bool(prefs, 'readAloud.restoreSkippedLines', DEFAULTS.readAloud.restoreSkippedLines),
      openExpanded: bool(prefs, 'readAloud.openExpanded', DEFAULTS.readAloud.openExpanded),
    },
    highlight: {
      wordColor: str(prefs, 'highlight.wordColor', DEFAULTS.highlight.wordColor),
      wordAlpha: num(prefs, 'highlight.wordAlpha', DEFAULTS.highlight.wordAlpha, 0, 100),
      sentenceColor: str(prefs, 'highlight.sentenceColor', DEFAULTS.highlight.sentenceColor),
      sentenceAlpha: num(prefs, 'highlight.sentenceAlpha', DEFAULTS.highlight.sentenceAlpha, 0, 100),
      sentenceUnderWord: bool(prefs, 'highlight.sentenceUnderWord', DEFAULTS.highlight.sentenceUnderWord),
    },
  };
}

/**
 * Whether the Read Aloud interface gets the audio cache. Prefetch has
 * nowhere to put what it synthesizes without it — `prefetchAfter` returns on
 * its first line when the cache is undefined (read-aloud/remote-interface.ts)
 * — and the pane locks the two settings together, but only once it has been
 * opened (ui/prefetch-rows.ts). A profile carrying prefetch on and the cache
 * off is given the cache here rather than a prefetch that silently does
 * nothing.
 */
export function audioCacheOn(settings: Settings): boolean {
  return settings.cacheAudio || settings.prefetchEnabled;
}

/** The providers whose voices are published, in catalog order. */
export function enabledProviders(s: Settings): ProviderId[] {
  return PROVIDER_IDS.filter((id) => s[id].enabled);
}

export function saveSettings(prefs: PrefsBackend, s: Settings): void {
  for (const [k, v] of Object.entries(s.openai)) prefs.set(PREF_PREFIX + 'openai.' + k, v);
  for (const [k, v] of Object.entries(s.azure)) prefs.set(PREF_PREFIX + 'azure.' + k, v);
  for (const [k, v] of Object.entries(s.cloudflare)) prefs.set(PREF_PREFIX + 'cloudflare.' + k, v);
  for (const [k, v] of Object.entries(s.speechify)) prefs.set(PREF_PREFIX + 'speechify.' + k, v);
  for (const [k, v] of Object.entries(s.fish)) prefs.set(PREF_PREFIX + 'fish.' + k, v);
  for (const [k, v] of Object.entries(s.fishspeech)) prefs.set(PREF_PREFIX + 'fishspeech.' + k, v);
  for (const [k, v] of Object.entries(s.local)) prefs.set(PREF_PREFIX + 'local.' + k, v);
  for (const [k, v] of Object.entries(s.system)) prefs.set(PREF_PREFIX + 'system.' + k, v);
  for (const [k, v] of Object.entries(s.webdav)) prefs.set(PREF_PREFIX + 'webdav.' + k, v);
  prefs.set(PREF_PREFIX + 'prefetch', s.prefetch);
  prefs.set(PREF_PREFIX + 'prefetchEnabled', s.prefetchEnabled);
  prefs.set(PREF_PREFIX + 'cacheAudio', s.cacheAudio);
  for (const [k, v] of Object.entries(s.shortcuts)) prefs.set(PREF_PREFIX + 'shortcuts.' + k, v);
  for (const [k, v] of Object.entries(s.readAloud)) prefs.set(PREF_PREFIX + 'readAloud.' + k, v);
  for (const [k, v] of Object.entries(s.highlight)) prefs.set(PREF_PREFIX + 'highlight.' + k, v);
}

/**
 * Builds before 2026-08-22 had a single `provider` pref choosing one
 * provider. Turn a leftover value into the equivalent `enabled` flags — the
 * chosen provider on, the others off — and remove it, so the choice is
 * applied exactly once. Returns whether anything was migrated.
 */
export function migrateLegacyProviderPref(prefs: PrefsBackend): boolean {
  const legacyKey = PREF_PREFIX + 'provider';
  const legacy = prefs.get(legacyKey);
  if (typeof legacy !== 'string' || !(PROVIDER_IDS as readonly string[]).includes(legacy)) return false;
  for (const id of PROVIDER_IDS) prefs.set(PREF_PREFIX + id + '.enabled', id === legacy);
  if (prefs.clear) prefs.clear(legacyKey);
  else prefs.set(legacyKey, '');
  return true;
}

/** The only place that touches the Zotero global; deliberately isolated here so the rest of the code depends only on PrefsBackend. */
export function createZoteroPrefs(): PrefsBackend {
  return {
    get: (key) => Zotero.Prefs.get(key, true),
    set: (key, value) => Zotero.Prefs.set(key, value as never, true),
    clear: (key) => Zotero.Prefs.clear(key, true),
  };
}
