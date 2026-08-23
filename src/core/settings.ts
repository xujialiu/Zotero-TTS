import type { ProviderId } from './providers/types';
import type { ShortcutAction } from './shortcut-actions';

export const PROVIDER_IDS: readonly ProviderId[] = ['openai', 'azure', 'local'];

export interface Settings {
  /** Each provider is switched on independently; every enabled one contributes voices. */
  openai: {
    enabled: boolean;
    apiKey: string;
    baseURL: string;
    model: string;
    voice: string;
    /** Comma-separated voice ids to offer; empty means "ask the server, else OpenAI's defaults". */
    voices: string;
    /** Extra request headers, `Name: value` pairs separated by `;` or newlines (core/headers.ts). */
    headers: string;
    /** Which server the section talks to (core/server-presets.ts); empty means "guess from the address". */
    server: string;
  };
  azure: { enabled: boolean; apiKey: string; region: string; voice: string };
  /** `headers`: extra request headers for a gateway in front of the server, same format as openai.headers. */
  local: { enabled: boolean; engine: string; baseURL: string; voice: string; headers: string };
  /** The WebDAV folder holding the settings backup (core/webdav.ts, ui/webdav-rows.ts); the password is a plain pref like the API keys. */
  webdav: { url: string; username: string; password: string };
  prefetch: number;
  /** Keep synthesized audio in the in-memory LRU (core/memory-cache.ts). */
  cacheAudio: boolean;
  /**
   * Keyboard shortcuts that drive Zotero's own Read Aloud — the playback
   * speed, and skipping by sentence or paragraph (core/shortcut-actions.ts)
   * — as text understood by core/shortcuts.ts ("Shift+Z"). Empty disables one.
   */
  shortcuts: Record<ShortcutAction, string>;
  readAloud: {
    /** Keep one Read Aloud voice and speed across documents (read-aloud/read-aloud-memory.ts). */
    sameForAllDocuments: boolean;
    /**
     * Publish multilingual voices under Zotero's `*` wildcard, so they are
     * offered under every language instead of only under their own
     * "Multiple languages" entry (which disappears — a wildcard voice never
     * creates a language entry of its own).
     */
    multilingualEverywhere: boolean;
  };
}

export interface PrefsBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  /** Remove a user value so the default applies again; optional because tests' fakes may omit it. */
  clear?(key: string): void;
}

export const PREF_PREFIX = 'extensions.zotero.zotero-tts.';

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
  },
  azure: { enabled: false, apiKey: '', region: 'eastasia', voice: 'zh-CN-XiaoxiaoNeural' },
  local: { enabled: false, engine: 'kokoro', baseURL: 'http://localhost:8880', voice: 'af_bella', headers: '' },
  webdav: { url: '', username: '', password: '' },
  prefetch: 3,
  cacheAudio: true,
  shortcuts: {
    speedReset: 'Shift+Z',
    speedDown: 'Shift+X',
    speedUp: 'Shift+C',
    // Bare arrows: taken only while a Read Aloud session is open, the reader pages with them otherwise
    previousSentence: 'ArrowLeft',
    nextSentence: 'ArrowRight',
    previousParagraph: 'Shift+ArrowLeft',
    nextParagraph: 'Shift+ArrowRight',
  },
  readAloud: { sameForAllDocuments: true, multilingualEverywhere: false },
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
    },
    azure: {
      enabled: bool(prefs, 'azure.enabled', DEFAULTS.azure.enabled),
      apiKey: str(prefs, 'azure.apiKey', DEFAULTS.azure.apiKey),
      region: str(prefs, 'azure.region', DEFAULTS.azure.region),
      voice: str(prefs, 'azure.voice', DEFAULTS.azure.voice),
    },
    local: {
      enabled: bool(prefs, 'local.enabled', DEFAULTS.local.enabled),
      engine: str(prefs, 'local.engine', DEFAULTS.local.engine),
      baseURL: str(prefs, 'local.baseURL', DEFAULTS.local.baseURL),
      voice: str(prefs, 'local.voice', DEFAULTS.local.voice),
      headers: str(prefs, 'local.headers', DEFAULTS.local.headers),
    },
    webdav: {
      url: str(prefs, 'webdav.url', DEFAULTS.webdav.url),
      username: str(prefs, 'webdav.username', DEFAULTS.webdav.username),
      password: str(prefs, 'webdav.password', DEFAULTS.webdav.password),
    },
    prefetch: num(prefs, 'prefetch', DEFAULTS.prefetch, 1, 10),
    cacheAudio: bool(prefs, 'cacheAudio', DEFAULTS.cacheAudio),
    shortcuts: {
      speedReset: str(prefs, 'shortcuts.speedReset', DEFAULTS.shortcuts.speedReset),
      speedDown: str(prefs, 'shortcuts.speedDown', DEFAULTS.shortcuts.speedDown),
      speedUp: str(prefs, 'shortcuts.speedUp', DEFAULTS.shortcuts.speedUp),
      previousSentence: str(prefs, 'shortcuts.previousSentence', DEFAULTS.shortcuts.previousSentence),
      nextSentence: str(prefs, 'shortcuts.nextSentence', DEFAULTS.shortcuts.nextSentence),
      previousParagraph: str(prefs, 'shortcuts.previousParagraph', DEFAULTS.shortcuts.previousParagraph),
      nextParagraph: str(prefs, 'shortcuts.nextParagraph', DEFAULTS.shortcuts.nextParagraph),
    },
    readAloud: {
      sameForAllDocuments: bool(prefs, 'readAloud.sameForAllDocuments', DEFAULTS.readAloud.sameForAllDocuments),
      multilingualEverywhere: bool(prefs, 'readAloud.multilingualEverywhere', DEFAULTS.readAloud.multilingualEverywhere),
    },
  };
}

/** The providers whose voices are published, in catalog order. */
export function enabledProviders(s: Settings): ProviderId[] {
  return PROVIDER_IDS.filter((id) => s[id].enabled);
}

export function saveSettings(prefs: PrefsBackend, s: Settings): void {
  for (const [k, v] of Object.entries(s.openai)) prefs.set(PREF_PREFIX + 'openai.' + k, v);
  for (const [k, v] of Object.entries(s.azure)) prefs.set(PREF_PREFIX + 'azure.' + k, v);
  for (const [k, v] of Object.entries(s.local)) prefs.set(PREF_PREFIX + 'local.' + k, v);
  for (const [k, v] of Object.entries(s.webdav)) prefs.set(PREF_PREFIX + 'webdav.' + k, v);
  prefs.set(PREF_PREFIX + 'prefetch', s.prefetch);
  prefs.set(PREF_PREFIX + 'cacheAudio', s.cacheAudio);
  for (const [k, v] of Object.entries(s.shortcuts)) prefs.set(PREF_PREFIX + 'shortcuts.' + k, v);
  for (const [k, v] of Object.entries(s.readAloud)) prefs.set(PREF_PREFIX + 'readAloud.' + k, v);
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
