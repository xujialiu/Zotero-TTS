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

/**
 * The fields a server remembers: the address and the model (issue #34), and
 * the key, voices and Extra headers typed for it (issue #52) — a switch of
 * the dropdown files all five of the server being left and restores the
 * five of the server chosen, so nothing typed for one server is ever sent
 * to another. A preset's `defaults` fill only the first two.
 */
export type PresetFields = Partial<Pick<Settings['openai'], 'baseURL' | 'model' | 'apiKey' | 'voices' | 'headers'>>;
const PRESET_FIELDS = ['baseURL', 'model', 'apiKey', 'voices', 'headers'] as const;
/** What a server never visited starts with beyond its defaults: no key, no voices and no headers of another server's. */
const BLANK_FIELDS: PresetFields = { apiKey: '', voices: '', headers: '' };

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
  /** The server's own hostname, for a hosted service with one address: a Base URL on another host is a typo or a mirror (addressHint, issue #54). */
  host?: string;
}

export const PRESETS: Record<ServerPreset, PresetSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaults: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' },
    host: 'api.openai.com',
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
    host: 'api.xiaomimimo.com',
    // A fixed hosted endpoint, like api.openai.com: no gateway of the user's
    // sits in front of it, and a token typed for another server must not
    // travel with every request (issue #52)
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: false },
    note: "Key from platform.xiaomimimo.com; free for now. Voices may stay empty for MiMo's built-in voices (Chinese and English) or list your own. Sentences are highlighted, not words: MiMo reports no word timings. Extra headers are not needed for api.xiaomimimo.com.",
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
 * section's five fields under it; coming back restores them, so a look at
 * another server and back costs the user nothing (issue #34: every pick
 * used to write the preset's defaults over whatever was there) and a
 * credential typed for one server never reaches another (issue #52). A
 * preset never visited has no entry and gets its built-in defaults, with
 * the key, voices and headers empty. The copies live in plain text like
 * the fields themselves, and go into the settings backup with them.
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
 * defaults for the address and the model and left blank for the rest
 * (`other` has no defaults, so a first visit there writes only the
 * blanks). Picking the current preset again files the current values and
 * reads them straight back, so an edit made since the last visit stays.
 */
export function switchPreset(
  remembered: PresetValues,
  from: ServerPreset,
  to: ServerPreset,
  current: Pick<Settings['openai'], (typeof PRESET_FIELDS)[number]>,
): { remembered: PresetValues; values: PresetFields } {
  const leaving = Object.fromEntries(PRESET_FIELDS.map((field) => [field, current[field]])) as PresetFields;
  const filed: PresetValues = { ...remembered, [from]: leaving };
  return { remembered: filed, values: { ...BLANK_FIELDS, ...PRESETS[to].defaults, ...filed[to] } };
}

/** What the Base URL of a hosted preset says: `typo`, within two edits of the server's own hostname; `different`, any other host — a mirror or a proxy. */
export type AddressHint = { kind: 'typo' | 'different'; host: string; known: string };

/** Levenshtein distance; hostnames are short, so the plain table will do. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(previous[j] + 1, current[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Issue #54: `https://api.xiaomimim.com` — one letter short — fails as
 * "Cannot reach …" and the eye skips the missing letter, and a registered
 * typo domain would get the key with the first probe. For a preset with a
 * fixed host, the typed hostname within two edits of it is a typo (an
 * address a real mirror never has), any other host a different address;
 * silent for the server's own address whatever the scheme, case, path or
 * trailing slash, for a preset without a fixed host, and for an address
 * that does not parse (Test connection reports that on its own).
 */
export function addressHint(openai: Pick<Settings['openai'], 'server' | 'baseURL'>): AddressHint | null {
  const known = presetSpec(openai).host;
  if (!known) return null;
  let host: string;
  try {
    host = new URL(openai.baseURL.trim()).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (!host || host === known) return null;
  return { kind: editDistance(host, known) <= 2 ? 'typo' : 'different', host, known };
}

/** The hint as the one sentence the status line shows. */
export function addressHintText(hint: AddressHint): string {
  return hint.kind === 'typo' ? `${hint.host} looks like a typo of ${hint.known}.` : `${hint.host} is not ${hint.known}: a mirror or a proxy?`;
}
