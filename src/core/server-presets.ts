import type { Settings } from './settings';

/**
 * What kind of server the OpenAI section talks to. "OpenAI-compatible" only
 * means the API has the same shape; the servers behind it differ in what
 * they read — OpenAI wants a key and a model, Chatterbox-TTS-Server ignores
 * both and publishes its own voices, a hosted service such as Groq or
 * SiliconFlow wants everything. A preset says which fields a known server
 * uses, so the pane can gray out the rest and the provider can leave them
 * unsent; `other` keeps every field in play and lets Test connection tell.
 * A field is disabled only when the server provably ignores it — never
 * on a guess, since a wrongly disabled field locks a whole class of
 * servers out.
 */
export type ServerPreset = 'openai' | 'chatterbox' | 'mimo' | 'other';
export const SERVER_PRESETS: readonly ServerPreset[] = ['openai', 'chatterbox', 'mimo', 'other'];

/**
 * How a server synthesizes: OpenAI's `/v1/audio/speech`, which answers with
 * the audio bytes, or a chat completion with an `audio` object, which
 * answers with base64 audio inside the JSON — the shape OpenAI gave its
 * audio chat models, and the only one Xiaomi MiMo's TTS has (issue #50:
 * its `/v1/audio/speech` is a 404 at the gateway).
 */
export type SynthesisRoute = 'speech' | 'chat';

export type OpenAIField = 'apiKey' | 'baseURL' | 'model' | 'voices' | 'headers';

/** The fields a preset fills in: the address and the model. */
export type PresetFields = Partial<Pick<Settings['openai'], 'baseURL' | 'model'>>;
const PRESET_FIELDS = ['baseURL', 'model'] as const;

export interface PresetSpec {
  id: ServerPreset;
  label: string;
  /** Filled in the first time the user switches to the preset; later visits restore what the user last used with it (switchPreset). Never applied on load, so stored values survive. */
  defaults: PresetFields;
  /** Fields the server reads. A field marked false is disabled in the pane and not sent. */
  uses: Record<OpenAIField, boolean>;
  /** The tooltip of the ? beside the dropdown. */
  note: string;
  /** The route the server synthesizes on (core/providers/openai.ts). */
  synthesis: SynthesisRoute;
  /** The voices the server documents, for one that publishes no list on /v1/audio/voices; absent, OpenAI's own list is the last resort. */
  voices?: readonly string[];
  /** The name in front of this server's voices in the player and the voice browser ("MiMo-冰糖"); the section's "OpenAI" when absent. */
  voiceName?: string;
}

export const PRESETS: Record<ServerPreset, PresetSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaults: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' },
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: false },
    note: "Key and model from platform.openai.com; Voices may stay empty (OpenAI's own) or list newer ones. Extra headers are not needed for api.openai.com.",
    synthesis: 'speech',
  },
  chatterbox: {
    id: 'chatterbox',
    label: 'Chatterbox-TTS-Server',
    defaults: { baseURL: 'http://localhost:8004', model: 'tts-1' },
    uses: { apiKey: false, baseURL: true, model: false, voices: false, headers: true },
    note: 'Chatterbox has no key, ignores the model and publishes its own voices: only the address matters, plus Extra headers behind a gateway.',
    synthesis: 'speech',
  },
  mimo: {
    id: 'mimo',
    label: 'Xiaomi MiMo',
    defaults: { baseURL: 'https://api.xiaomimimo.com', model: 'mimo-v2.5-tts' },
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: true },
    note: "Key from platform.xiaomimimo.com; free for now. Voices may stay empty for MiMo's built-in voices (Chinese and English) or list your own. Sentences are highlighted, not words: MiMo reports no word timings.",
    synthesis: 'chat',
    // The built-in voices of mimo-v2.5-tts, from the platform's documentation
    // (verified live 2026-09-06); the server has no /v1/audio/voices.
    voices: ['mimo_default', '冰糖', '茉莉', '苏打', '白桦', 'Mia', 'Chloe', 'Milo', 'Dean'],
    voiceName: 'MiMo',
  },
  other: {
    id: 'other',
    label: 'Other OpenAI-compatible server',
    defaults: {},
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: true },
    note: 'Fill in what the server wants; Test connection says which of these it uses.',
    synthesis: 'speech',
  },
};

const isOpenAIHost = (baseURL: string): boolean => {
  try {
    return /(^|[.])api[.]openai[.]com$/i.test(new URL(baseURL).hostname);
  } catch {
    return false;
  }
};

/**
 * The preset in force: the stored choice, or — for settings saved before
 * there was one — a guess from the address. api.openai.com is OpenAI;
 * anything else is `other`, which disables nothing.
 */
export function serverPreset(openai: Pick<Settings['openai'], 'server' | 'baseURL'>): ServerPreset {
  if ((SERVER_PRESETS as readonly string[]).includes(openai.server)) return openai.server as ServerPreset;
  return isOpenAIHost(openai.baseURL) ? 'openai' : 'other';
}

/** The spec of the preset in force. */
export function presetSpec(openai: Pick<Settings['openai'], 'server' | 'baseURL'>): PresetSpec {
  return PRESETS[serverPreset(openai)];
}

/**
 * The settings as the server will see them: fields the preset marks unused
 * are blanked, so a value left over from another server (a key, a voice
 * list, gateway headers) is never sent by mistake. The model is sent as
 * stored either way — a server that ignores it does not mind.
 */
export function applyPreset(openai: Settings['openai']): Settings['openai'] {
  const { uses } = PRESETS[serverPreset(openai)];
  return {
    ...openai,
    apiKey: uses.apiKey ? openai.apiKey : '',
    voices: uses.voices ? openai.voices : '',
    headers: uses.headers ? openai.headers : '',
  };
}

/**
 * What each server was last used with, keyed by preset — the
 * `openai.presetValues` pref, a JSON object. Leaving a preset stores the
 * section's address and model under it; coming back restores them, so a
 * look at another server and back costs the user nothing (issue #34: every
 * pick used to write the preset's defaults over whatever was there). A
 * preset never visited has no entry and gets its built-in defaults.
 */
export type PresetValues = Partial<Record<ServerPreset, PresetFields>>;

/** The pref's text as a memory; anything but a JSON object of known presets holding string fields reads as empty. */
export function parsePresetValues(text: string): PresetValues {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return {};
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  const out: PresetValues = {};
  for (const id of SERVER_PRESETS) {
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

/**
 * A switch of the dropdown from one preset to another: the memory with the
 * current values filed under the preset being left, and the values to write
 * for the one chosen — what it was last used with, gaps filled from its
 * defaults (`other` has none, so a first visit there writes nothing).
 * Picking the current preset again files the current values and reads
 * them straight back, so an edit made since the last visit stays.
 */
export function switchPreset(
  remembered: PresetValues,
  from: ServerPreset,
  to: ServerPreset,
  current: Pick<Settings['openai'], 'baseURL' | 'model'>,
): { remembered: PresetValues; values: PresetFields } {
  const filed: PresetValues = { ...remembered, [from]: { baseURL: current.baseURL, model: current.model } };
  return { remembered: filed, values: { ...PRESETS[to].defaults, ...filed[to] } };
}
