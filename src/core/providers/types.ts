export type ProviderId = 'openai' | 'azure' | 'local';

/**
 * Shape copied verbatim from native Zotero (spec §2.2), so hijack mode
 * can pass it through with zero conversion.
 * start/end are in seconds; charStart/charEnd are character offsets
 * within the segment text.
 */
export type Timestamp = {
  start: number;
  end: number;
  charStart: number;
  charEnd: number;
};

export type SynthesisResult = {
  audio: Blob;
  /** Omitted means this provider has no word-level timestamps; highlighting automatically falls back to sentence level. Never interpolate or estimate. */
  timestamps?: Timestamp[];
};

/**
 * Zotero's wildcard locale: a voice listed under it is offered for every
 * language (reader isLanguageSupported) without adding a selectable
 * language of its own (getSupportedLanguages skips it). Meant for
 * language-agnostic voices — OpenAI's, Azure's "Multilingual" ones.
 */
export const ANY_LANGUAGE = '*';

export type VoiceInfo = {
  /** The raw id within the provider, without the provider prefix */
  id: string;
  label: string;
  /** BCP-47, or ANY_LANGUAGE for a voice that speaks whatever it is given */
  locale: string;
};

export type SynthesisOptions = {
  voice: string;
  speed: number;
  signal: AbortSignal;
};

export interface TTSProvider {
  readonly id: ProviderId;
  readonly capabilities: { wordTimestamps: boolean };
  listVoices(): Promise<VoiceInfo[]>;
  synthesize(text: string, o: SynthesisOptions): Promise<SynthesisResult>;
  /**
   * One cheap request that proves the configuration works — server
   * reachable, key accepted. Rejects with a SynthesisError saying what is
   * wrong. Providers whose listVoices already makes such a request (Azure,
   * Kokoro) leave this out; OpenAI needs it because its voice list is
   * static and would "succeed" against any URL and any key.
   */
  checkConnection?(): Promise<void>;
  /** The model ids the server offers, for servers that have a model list (OpenAI and its look-alikes). Rejects like checkConnection. */
  listModels?(): Promise<string[]>;
}
