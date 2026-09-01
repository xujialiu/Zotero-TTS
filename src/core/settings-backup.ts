import { DEFAULTS, loadSettings, PREF_PREFIX, type PrefsBackend, type Settings } from './settings';

/**
 * The settings as one JSON file, for moving them to another machine or
 * keeping them across a profile reset. Every setting is included — the API
 * keys too, a backup without them would be of little use — so the file is
 * as sensitive as prefs.js itself, and the pane says so. Restoring goes
 * through the same validation as loading: a value of the wrong kind is
 * skipped and reported, never written, since Zotero's pref branch refuses
 * a value whose type differs from the declared default. Keys the file does
 * not mention (from an older plugin version, say) keep their current values.
 */

export const BACKUP_FORMAT = 'zotero-tts-settings';
export const BACKUP_VERSION = 1;
export const BACKUP_FILENAME = 'zotero-tts-settings.json';

/** This machine's settings file on the server (#41): one per machine, because settings cannot merge. */
export function machineSettingsFilename(machineId: string): string {
  return `zotero-tts-settings_${machineId}.json`;
}

/**
 * Every settings file the pull flow lists: the per-machine files, and the
 * unsuffixed one manual uploads wrote before 1.11. The capture is the
 * machine id, undefined for the legacy file. The positions file does not
 * match — different prefix.
 */
export const SETTINGS_FILE_PATTERN = /^zotero-tts-settings(?:_(.+))?\.json$/;

export type SettingValue = string | number | boolean;
/** `{ 'openai.apiKey': … }`: the pref names without their prefix, as in prefs.js. */
export type FlatSettings = Record<string, SettingValue>;

export interface SettingsBackup {
  format: typeof BACKUP_FORMAT;
  version: number;
  pluginVersion?: string;
  exportedAt?: string;
  /** Which computer wrote it (core/machine-id.ts); absent in files from before 1.11 and in ones old builds write. */
  machine?: string;
  settings: FlatSettings;
}

export function flattenSettings(s: Settings): FlatSettings {
  const out: FlatSettings = {};
  const walk = (value: unknown, prefix: string) => {
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) walk(v, prefix ? `${prefix}.${k}` : k);
    } else {
      out[prefix] = value as SettingValue;
    }
  };
  walk(s, '');
  return out;
}

/** Every setting this version knows, with the kind of value each holds. */
const KNOWN = flattenSettings(DEFAULTS);

export function createBackup(prefs: PrefsBackend, meta: { pluginVersion?: string; exportedAt?: string; machine?: string } = {}): SettingsBackup {
  return { format: BACKUP_FORMAT, version: BACKUP_VERSION, ...meta, settings: flattenSettings(loadSettings(prefs)) };
}

export function serializeBackup(backup: SettingsBackup): string {
  return JSON.stringify(backup, null, 2) + '\n';
}

export class BackupError extends Error {}

export interface ParsedBackup {
  settings: FlatSettings;
  /** Keys that were skipped: unknown to this version, or holding a value of the wrong kind. */
  ignored: string[];
  pluginVersion?: string;
  exportedAt?: string;
  machine?: string;
}

/** The value as the kind `like` is, when the reading is unambiguous; undefined otherwise. */
function coerce(value: unknown, like: SettingValue): SettingValue | undefined {
  switch (typeof like) {
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 'true') return true;
      if (value === 'false') return false;
      return undefined;
    case 'number': {
      const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
      return Number.isFinite(n) ? n : undefined;
    }
    default:
      if (typeof value === 'string') return value;
      return typeof value === 'number' || typeof value === 'boolean' ? String(value) : undefined;
  }
}

export function parseBackup(text: string): ParsedBackup {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new BackupError('The file is not JSON');
  }
  const backup = data as Partial<SettingsBackup> | null;
  if (!backup || typeof backup !== 'object' || backup.format !== BACKUP_FORMAT || !backup.settings || typeof backup.settings !== 'object') {
    throw new BackupError('The file is not a Zotero-TTS settings backup');
  }
  const settings: FlatSettings = {};
  const ignored: string[] = [];
  for (const [key, raw] of Object.entries(backup.settings)) {
    const like = KNOWN[key];
    const value = like === undefined ? undefined : coerce(raw, like);
    if (value === undefined) ignored.push(key);
    else settings[key] = value;
  }
  return {
    settings,
    ignored,
    pluginVersion: typeof backup.pluginVersion === 'string' ? backup.pluginVersion : undefined,
    exportedAt: typeof backup.exportedAt === 'string' ? backup.exportedAt : undefined,
    machine: typeof backup.machine === 'string' ? backup.machine : undefined,
  };
}

/** Writes the parsed settings to the prefs and returns how many. */
export function applyBackup(prefs: PrefsBackend, parsed: ParsedBackup): number {
  let applied = 0;
  for (const [key, value] of Object.entries(parsed.settings)) {
    prefs.set(PREF_PREFIX + key, value);
    applied++;
  }
  return applied;
}
