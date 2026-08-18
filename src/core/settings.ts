import type { ProviderId } from './providers/types';

export type Mode = 'hijack' | 'standalone';

export interface Settings {
  mode: Mode;
  provider: ProviderId;
  openai: { apiKey: string; baseURL: string; model: string; voice: string };
  azure: { apiKey: string; region: string; voice: string };
  local: { engine: string; baseURL: string; voice: string };
  speed: number;
  prefetch: number;
}

export interface PrefsBackend {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

const PREFIX = 'extensions.zotero.zotero-tts.';

export const DEFAULTS: Settings = {
  mode: 'hijack',
  provider: 'openai',
  openai: {
    apiKey: '',
    baseURL: 'https://api.openai.com',
    model: 'gpt-4o-mini-tts',
    voice: 'alloy',
  },
  azure: { apiKey: '', region: 'eastasia', voice: 'zh-CN-XiaoxiaoNeural' },
  local: { engine: 'kokoro', baseURL: 'http://localhost:8880', voice: 'af_bella' },
  speed: 1,
  prefetch: 3,
};

const MODES: readonly Mode[] = ['hijack', 'standalone'];
const PROVIDERS: readonly ProviderId[] = ['openai', 'azure', 'local'];

function str(prefs: PrefsBackend, key: string, fallback: string): string {
  const v = prefs.get(PREFIX + key);
  return typeof v === 'string' ? v : fallback;
}

function num(prefs: PrefsBackend, key: string, fallback: number, min: number, max: number): number {
  const v = prefs.get(PREFIX + key);
  if (typeof v !== 'number' || Number.isNaN(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

function oneOf<T extends string>(prefs: PrefsBackend, key: string, allowed: readonly T[], fallback: T): T {
  const v = prefs.get(PREFIX + key);
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
}

export function loadSettings(prefs: PrefsBackend): Settings {
  return {
    mode: oneOf(prefs, 'mode', MODES, DEFAULTS.mode),
    provider: oneOf(prefs, 'provider', PROVIDERS, DEFAULTS.provider),
    openai: {
      apiKey: str(prefs, 'openai.apiKey', DEFAULTS.openai.apiKey),
      baseURL: str(prefs, 'openai.baseURL', DEFAULTS.openai.baseURL),
      model: str(prefs, 'openai.model', DEFAULTS.openai.model),
      voice: str(prefs, 'openai.voice', DEFAULTS.openai.voice),
    },
    azure: {
      apiKey: str(prefs, 'azure.apiKey', DEFAULTS.azure.apiKey),
      region: str(prefs, 'azure.region', DEFAULTS.azure.region),
      voice: str(prefs, 'azure.voice', DEFAULTS.azure.voice),
    },
    local: {
      engine: str(prefs, 'local.engine', DEFAULTS.local.engine),
      baseURL: str(prefs, 'local.baseURL', DEFAULTS.local.baseURL),
      voice: str(prefs, 'local.voice', DEFAULTS.local.voice),
    },
    speed: num(prefs, 'speed', DEFAULTS.speed, 0.5, 3),
    prefetch: num(prefs, 'prefetch', DEFAULTS.prefetch, 1, 10),
  };
}

export function saveSettings(prefs: PrefsBackend, s: Settings): void {
  prefs.set(PREFIX + 'mode', s.mode);
  prefs.set(PREFIX + 'provider', s.provider);
  for (const [k, v] of Object.entries(s.openai)) prefs.set(PREFIX + 'openai.' + k, v);
  for (const [k, v] of Object.entries(s.azure)) prefs.set(PREFIX + 'azure.' + k, v);
  for (const [k, v] of Object.entries(s.local)) prefs.set(PREFIX + 'local.' + k, v);
  prefs.set(PREFIX + 'speed', s.speed);
  prefs.set(PREFIX + 'prefetch', s.prefetch);
}

/** 唯一接触 Zotero 全局的地方，故意隔离在此，其余代码只依赖 PrefsBackend。 */
export function createZoteroPrefs(): PrefsBackend {
  return {
    get: (key) => Zotero.Prefs.get(key, true),
    set: (key, value) => Zotero.Prefs.set(key, value as never, true),
  };
}
