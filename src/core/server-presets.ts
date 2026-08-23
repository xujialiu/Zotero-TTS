import type { Settings } from './settings';

/**
 * What kind of server the OpenAI section talks to. "OpenAI-compatible" only
 * means the API has the same shape; the servers behind it differ in what
 * they read — OpenAI wants a key and a model, Chatterbox-TTS-Server ignores
 * both and publishes its own voices, a hosted service such as Groq or
 * SiliconFlow wants everything. A preset says which fields a known server
 * uses, so the pane can grey out the rest and the provider can leave them
 * unsent; `other` keeps every field in play and lets Test connection tell.
 * A field is disabled only when the server provably ignores it — never
 * on a guess, since a wrongly disabled field locks a whole class of
 * servers out.
 */
export type ServerPreset = 'openai' | 'chatterbox' | 'other';
export const SERVER_PRESETS: readonly ServerPreset[] = ['openai', 'chatterbox', 'other'];

export type OpenAIField = 'apiKey' | 'baseURL' | 'model' | 'voices' | 'headers';

export interface PresetSpec {
  id: ServerPreset;
  label: string;
  /** Filled in when the user switches to the preset; never applied on load, so stored values survive. */
  defaults: Partial<Pick<Settings['openai'], 'baseURL' | 'model'>>;
  /** Fields the server reads. A field marked false is disabled in the pane and not sent. */
  uses: Record<OpenAIField, boolean>;
  /** One line under the dropdown. */
  note: string;
}

export const PRESETS: Record<ServerPreset, PresetSpec> = {
  openai: {
    id: 'openai',
    label: 'OpenAI',
    defaults: { baseURL: 'https://api.openai.com', model: 'gpt-4o-mini-tts' },
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: false },
    note: "Key and model from platform.openai.com; Voices may stay empty (OpenAI's own) or list newer ones. Extra headers are not needed for api.openai.com.",
  },
  chatterbox: {
    id: 'chatterbox',
    label: 'Chatterbox-TTS-Server',
    defaults: { baseURL: 'http://localhost:8004', model: 'tts-1' },
    uses: { apiKey: false, baseURL: true, model: false, voices: false, headers: true },
    note: 'Chatterbox has no key, ignores the model and publishes its own voices: only the address matters, plus Extra headers behind a gateway.',
  },
  other: {
    id: 'other',
    label: 'Other OpenAI-compatible server',
    defaults: {},
    uses: { apiKey: true, baseURL: true, model: true, voices: true, headers: true },
    note: 'Fill in what the server wants; Test connection says which of these it uses.',
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
