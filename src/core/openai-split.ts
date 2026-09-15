import { OPENAI_URL } from './providers/openai';
import { READ_ALOUD_VOICES_PREF, readReadAloudVoices, type VoicesMap } from './read-aloud-speed';
import { DEFAULTS, PREF_PREFIX, type PrefsBackend, type Settings } from './settings';
import type { SettingValue } from './settings-backup';
import type { SharedItem } from './settings-sync';
import { parseFavoriteVoices, serializeFavoriteVoices } from '../read-aloud/favorites';
import { readMemory, writeMemory } from '../read-aloud/read-aloud-memory';

/**
 * TEMPORARY — DELETE IN 2.0.0, with test/core/openai-split.test.ts and the
 * one-line calls in src/index.ts (the startup step), core/settings-backup.ts
 * (parseBackup) and core/settings-sync.ts (parseSharedSettings). The chore
 * issue opened when #113 ships lists them, in #22's shape.
 *
 * Until 1.12.11 the plugin had one OpenAI section for four servers: a
 * Server dropdown chose OpenAI, Chatterbox-TTS-Server, Xiaomi MiMo or Other,
 * the section's fields (`openai.apiKey`, `openai.baseURL`, `openai.model`,
 * `openai.voices`, `openai.headers`) held the values of the server in
 * force, `openai.server` named it, and `openai.presetValues` remembered the
 * fields of the other three as a JSON object keyed by preset. Issue #113
 * split it into three sections — `openai-official`, `mimo`, `compatible` —
 * and this module reads the old shape, once, wherever it can still turn
 * up: this profile's prefs at startup (migrateOpenAISplit), a settings
 * backup made before the split (convertLegacySettings), and the shared
 * settings file of a WebDAV sync that a copy still on the old version
 * writes (convertLegacyItems). Nothing writes the old shape any more, which
 * is why the deletion condition is fixed here rather than left to whoever
 * reads this in a year: a parser for a format nothing writes turns into code
 * nobody is sure it is safe to delete.
 *
 * Who loses what when it goes: a copy still on ≤1.12.11 when 2.0.0 ships
 * jumps straight to 2.0 (update.json points at the latest release only) and
 * re-enters the three sections' keys and addresses; nothing else.
 */

/** The old section's pref prefix, relative to PREF_PREFIX; no new section uses it, so any `openai.*` key is the old section's. */
export const LEGACY_OPENAI_PREFIX = 'openai.';
export const LEGACY_OPENAI_FIELDS = ['enabled', 'apiKey', 'baseURL', 'model', 'voice', 'voices', 'headers', 'server', 'presetValues'] as const;
export const isLegacyOpenAIKey = (key: string): boolean => key.startsWith(LEGACY_OPENAI_PREFIX);

/** The old section, every field with the old default where the source lacks it. */
export interface LegacyOpenAISection {
  enabled: boolean;
  apiKey: string;
  baseURL: string;
  model: string;
  voices: string;
  headers: string;
  server: string;
  presetValues: string;
}

/** The three sections the old one becomes. */
export type SplitTarget = 'openai-official' | 'mimo' | 'compatible';
export const SPLIT_TARGETS: readonly SplitTarget[] = ['openai-official', 'mimo', 'compatible'];

type LegacyPreset = 'openai' | 'chatterbox' | 'mimo' | 'other';
const LEGACY_PRESETS: readonly LegacyPreset[] = ['openai', 'chatterbox', 'mimo', 'other'];
const PRESET_FIELDS = ['baseURL', 'model', 'apiKey', 'voices', 'headers'] as const;
type PresetField = (typeof PRESET_FIELDS)[number];
type PresetFields = Partial<Record<PresetField, string>>;
const TARGET_OF: Record<LegacyPreset, SplitTarget> = { openai: 'openai-official', chatterbox: 'compatible', mimo: 'mimo', other: 'compatible' };
/** The fields each new section takes from the old five. */
const SECTION_FIELDS: Record<SplitTarget, readonly PresetField[]> = {
  'openai-official': ['apiKey', 'model', 'voices'],
  mimo: ['apiKey', 'model', 'voices'],
  compatible: ['baseURL', 'apiKey', 'model', 'voices', 'headers'],
};

/** The preset in force: the stored choice, or — for settings saved before there was one — a guess from the address, as the old section made it. */
function legacyPreset(section: Pick<LegacyOpenAISection, 'server' | 'baseURL'>): LegacyPreset {
  if ((LEGACY_PRESETS as readonly string[]).includes(section.server)) return section.server as LegacyPreset;
  try {
    return /(^|[.])api[.]openai[.]com$/i.test(new URL(section.baseURL).hostname) ? 'openai' : 'other';
  } catch {
    return 'other';
  }
}

/** The section the old one's switch and current fields go to. */
export function legacyTarget(section: Pick<LegacyOpenAISection, 'server' | 'baseURL'>): SplitTarget {
  return TARGET_OF[legacyPreset(section)];
}

/** The old `openai.presetValues` text as the memory it was; anything but a JSON object of known presets holding string fields reads as empty. */
function parsePresetValues(text: string): Partial<Record<LegacyPreset, PresetFields>> {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: Partial<Record<LegacyPreset, PresetFields>> = {};
  for (const id of LEGACY_PRESETS) {
    const entry = (data as Record<string, unknown>)[id];
    if (!entry || typeof entry !== 'object') continue;
    const fields: PresetFields = {};
    for (const field of PRESET_FIELDS) {
      const value = (entry as Record<string, unknown>)[field];
      if (typeof value === 'string') fields[field] = value;
    }
    if (Object.keys(fields).length > 0) out[id] = fields;
  }
  return out;
}

export interface SplitSections {
  'openai-official': Settings['openai-official'];
  mimo: Settings['mimo'];
  compatible: Settings['compatible'];
}

/**
 * The three sections from the old one: the server in force keeps its
 * current fields and the switch, the remembered servers land in theirs
 * switched off. Chatterbox and Other compete for the one compatible slot:
 * the one in force first, else the Chatterbox set, else the Other set. A
 * remembered server without a model gets the new section's default; a
 * server never visited leaves its section at the defaults.
 */
export function splitOpenAISection(section: LegacyOpenAISection): { sections: SplitSections; target: SplitTarget } {
  const inForce = legacyPreset(section);
  const target = TARGET_OF[inForce];
  const remembered = parsePresetValues(section.presetValues);
  const current: PresetFields = { baseURL: section.baseURL, model: section.model, apiKey: section.apiKey, voices: section.voices, headers: section.headers };
  const set = (preset: LegacyPreset): PresetFields | undefined => (preset === inForce ? current : remembered[preset]);
  const openai = set('openai') ?? {};
  const mimo = set('mimo') ?? {};
  const compatible = (inForce === 'other' ? current : (set('chatterbox') ?? set('other'))) ?? {};
  const sections: SplitSections = {
    'openai-official': {
      enabled: target === 'openai-official' && section.enabled,
      apiKey: openai.apiKey ?? '',
      model: openai.model || DEFAULTS['openai-official'].model,
      voices: openai.voices ?? '',
    },
    mimo: {
      enabled: target === 'mimo' && section.enabled,
      apiKey: mimo.apiKey ?? '',
      model: mimo.model || DEFAULTS.mimo.model,
      voices: mimo.voices ?? '',
    },
    compatible: {
      enabled: target === 'compatible' && section.enabled,
      baseURL: compatible.baseURL ?? '',
      apiKey: compatible.apiKey ?? '',
      model: compatible.model ?? '',
      voices: compatible.voices ?? '',
      headers: compatible.headers ?? '',
    },
  };
  return { sections, target };
}

const SEPARATOR = '::';
const LEGACY_VOICE_PREFIX = 'openai' + SEPARATOR;

/** An `openai::…` voice id re-prefixed to the section the old one's server went to; any other id as it is. */
export function rewriteVoiceId(id: string, target: SplitTarget): string {
  return id.startsWith(LEGACY_VOICE_PREFIX) ? target + SEPARATOR + id.slice(LEGACY_VOICE_PREFIX.length) : id;
}

/**
 * Zotero's `reader.readAloudVoices` with the old section's voices renamed:
 * each language's `voice`, and its `tierVoices` entry, whose key moves
 * from `openai` to the target in the same position — the last key is what
 * Zotero's fallback reads (read-aloud/provider-tiers.ts). Null when no
 * entry named one.
 */
export function rewriteVoicesMap(voices: VoicesMap, target: SplitTarget): VoicesMap | null {
  let changed = false;
  const out: VoicesMap = {};
  for (const [lang, entry] of Object.entries(voices)) {
    if (!entry || typeof entry !== 'object') {
      out[lang] = entry;
      continue;
    }
    let next = entry;
    if (typeof entry.voice === 'string') {
      const voice = rewriteVoiceId(entry.voice, target);
      if (voice !== entry.voice) {
        next = { ...next, voice };
        changed = true;
      }
    }
    const tiers = (entry as { tierVoices?: unknown }).tierVoices;
    if (tiers && typeof tiers === 'object' && !Array.isArray(tiers)) {
      const rebuilt: Record<string, unknown> = {};
      let tiersChanged = false;
      for (const [tier, id] of Object.entries(tiers as Record<string, unknown>)) {
        const key = tier === 'openai' ? target : tier;
        const value = typeof id === 'string' ? rewriteVoiceId(id, target) : id;
        if (key !== tier || value !== id) tiersChanged = true;
        rebuilt[key] = value;
      }
      if (tiersChanged) {
        next = { ...next, tierVoices: rebuilt };
        changed = true;
      }
    }
    out[lang] = next;
  }
  return changed ? out : null;
}

export interface SplitReport {
  target: SplitTarget;
  enabled: Record<SplitTarget, boolean>;
  /** How many of the three voice prefs — Zotero's voices, the plugin's memory, the favorites — named a voice of the old section and were rewritten. */
  rewrittenPrefs: number;
  clearedKeys: number;
}

const str = (value: unknown, fallback: string): string => (typeof value === 'string' ? value : fallback);

/** The old section as a source has it, with the old defaults for what it lacks. */
function legacySection(raw: (field: (typeof LEGACY_OPENAI_FIELDS)[number]) => unknown): LegacyOpenAISection {
  return {
    enabled: typeof raw('enabled') === 'boolean' ? (raw('enabled') as boolean) : true,
    apiKey: str(raw('apiKey'), ''),
    baseURL: str(raw('baseURL'), OPENAI_URL),
    model: str(raw('model'), DEFAULTS['openai-official'].model),
    voices: str(raw('voices'), ''),
    headers: str(raw('headers'), ''),
    server: str(raw('server'), ''),
    presetValues: str(raw('presetValues'), ''),
  };
}

/** Whether an old pref still holds a value the user set, as opposed to a default left over from the old prefs.js. */
export function legacyPrefSet(prefs: PrefsBackend, field: (typeof LEGACY_OPENAI_FIELDS)[number]): boolean {
  const key = PREF_PREFIX + LEGACY_OPENAI_PREFIX + field;
  if (prefs.has) return prefs.has(key);
  const value = prefs.get(key);
  return value !== undefined && value !== '';
}

/**
 * At startup, after migrateLegacyProviderPref: the old section's prefs, if
 * any holds a value the user set, become the three sections' prefs; the
 * remembered voices — Zotero's per-language entries, the plugin's default
 * voice, the favorites — are re-prefixed to the section the server in
 * force went to; and the old prefs are cleared (blanked where the backend
 * cannot clear), so the next start finds nothing to do. Null when there
 * was nothing.
 *
 * "A value the user set" is the whole gate (verified live 2026-09-16, the
 * first run of #113's build): Gecko keeps the old prefs.js's defaults —
 * `openai.enabled` true, `openai.baseURL`, `openai.model`, `openai.voice`
 * — registered for the rest of the process after an in-place upgrade,
 * and clearing a user value leaves such a default readable, so a gate on
 * the value read would reopen at the next in-place install and split the
 * defaults over the sections it had just filled: the OpenAI section
 * switched on with no key, the other two blanked. It did, once, on the
 * owner's profile.
 */
export function migrateOpenAISplit(prefs: PrefsBackend): SplitReport | null {
  const legacyKey = (field: string) => PREF_PREFIX + LEGACY_OPENAI_PREFIX + field;
  const raw = (field: (typeof LEGACY_OPENAI_FIELDS)[number]) => prefs.get(legacyKey(field));
  if (!LEGACY_OPENAI_FIELDS.some((field) => legacyPrefSet(prefs, field))) return null;
  const { sections, target } = splitOpenAISection(legacySection(raw));
  for (const [id, fields] of Object.entries(sections)) {
    for (const [field, value] of Object.entries(fields)) prefs.set(`${PREF_PREFIX}${id}.${field}`, value);
  }

  let rewrittenPrefs = 0;
  const voices = rewriteVoicesMap(readReadAloudVoices(prefs), target);
  if (voices) {
    prefs.set(READ_ALOUD_VOICES_PREF, JSON.stringify(voices));
    rewrittenPrefs++;
  }
  const memory = readMemory(prefs);
  if (memory.voice) {
    const id = rewriteVoiceId(memory.voice.id, target);
    if (id !== memory.voice.id) {
      writeMemory(prefs, { ...memory, voice: { ...memory.voice, id } });
      rewrittenPrefs++;
    }
  }
  const favoritesKey = PREF_PREFIX + 'readAloud.favoriteVoices';
  const favorites = parseFavoriteVoices(prefs.get(favoritesKey));
  const renamed = favorites.map((id) => rewriteVoiceId(id, target));
  if (renamed.some((id, i) => id !== favorites[i])) {
    prefs.set(favoritesKey, serializeFavoriteVoices(renamed));
    rewrittenPrefs++;
  }

  let clearedKeys = 0;
  for (const field of LEGACY_OPENAI_FIELDS) {
    // The user values go; a backend without `has` clears whatever is defined, a blank included
    if (prefs.has ? !prefs.has(legacyKey(field)) : raw(field) === undefined) continue;
    if (prefs.clear) prefs.clear(legacyKey(field));
    else prefs.set(legacyKey(field), '');
    clearedKeys++;
  }
  return {
    target,
    enabled: { 'openai-official': sections['openai-official'].enabled, mimo: sections.mimo.enabled, compatible: sections.compatible.enabled },
    rewrittenPrefs,
    clearedKeys,
  };
}

/**
 * A settings backup's flat keys with the old section read as the three:
 * the `openai.*` keys go, the sections' keys come in where the file does
 * not already hold them under the new names. A file without the old
 * section comes back as it is.
 */
export function convertLegacySettings<T>(flat: Record<string, T>): Record<string, T | SettingValue> {
  if (!Object.keys(flat).some(isLegacyOpenAIKey)) return flat;
  const { sections } = splitOpenAISection(legacySection((field) => flat[LEGACY_OPENAI_PREFIX + field]));
  const out: Record<string, T | SettingValue> = {};
  for (const [key, value] of Object.entries(flat)) if (!isLegacyOpenAIKey(key)) out[key] = value;
  for (const [id, fields] of Object.entries(sections)) {
    for (const [field, value] of Object.entries(fields)) {
      const key = `${id}.${field}`;
      if (!(key in out)) out[key] = value as SettingValue;
    }
  }
  return out;
}

/**
 * The items of a shared settings file with the old section read as the
 * three: the server in force gives its section's items field by field,
 * each with the time and machine of the field's own item, and the switch
 * item gives all three switches; the dropdown's memory item gives the
 * remembered sections' items, each with its time. Nothing is derived from
 * an item the file lacks. The old items stay for the copies still on that
 * version, and where the file already holds an item under a new key the
 * newer of the two wins.
 */
export function convertLegacyItems(items: readonly SharedItem[]): SharedItem[] {
  const source = new Map<string, SharedItem>();
  for (const item of items) if (isLegacyOpenAIKey(item.key)) source.set(item.key.slice(LEGACY_OPENAI_PREFIX.length), item);
  if (!source.size) return [...items];
  const text = (field: string): string | undefined => {
    const value = source.get(field)?.value;
    return typeof value === 'string' ? value : undefined;
  };
  const inForce = legacyPreset({ server: text('server') ?? '', baseURL: text('baseURL') ?? OPENAI_URL });
  const target = TARGET_OF[inForce];
  const derived: SharedItem[] = [];
  const emit = (key: string, value: SettingValue, from: SharedItem) => derived.push({ key, value, ts: from.ts, by: from.by });

  for (const field of SECTION_FIELDS[target]) {
    const item = source.get(field);
    if (item && typeof item.value === 'string') emit(`${target}.${field}`, item.value, item);
  }
  const enabled = source.get('enabled');
  if (enabled && typeof enabled.value === 'boolean') {
    for (const id of SPLIT_TARGETS) emit(`${id}.enabled`, id === target && enabled.value, enabled);
  }
  const memory = source.get('presetValues');
  if (memory && typeof memory.value === 'string') {
    const remembered = parsePresetValues(memory.value);
    const sets: [SplitTarget, PresetFields | undefined][] = [
      ['openai-official', remembered.openai],
      ['mimo', remembered.mimo],
      ['compatible', remembered.chatterbox ?? remembered.other],
    ];
    for (const [id, set] of sets) {
      if (id === target || !set) continue;
      for (const field of SECTION_FIELDS[id]) {
        const value = set[field];
        if (typeof value === 'string') emit(`${id}.${field}`, value, memory);
      }
    }
  }

  const out = new Map(items.map((item) => [item.key, item]));
  for (const item of derived) {
    const existing = out.get(item.key);
    if (!existing || item.ts > existing.ts) out.set(item.key, item);
  }
  return [...out.values()];
}
