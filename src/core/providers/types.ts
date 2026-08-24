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
  /** Why the timestamps are missing, when the provider knows (e.g. the captioned endpoint was missing and a plain one answered). For the debug output. */
  note?: string;
};

/**
 * The locale of voices that speak whatever language they are given —
 * OpenAI's, Azure's "Multilingual" ones, voices of unknown language from
 * OpenAI-compatible servers. `mul` is BCP-47 for "multiple languages", so
 * Zotero's language dropdown (labelled through Intl.DisplayNames) shows
 * them as their own entry, "Multiple languages" / "多语种", instead of
 * repeating them under every language.
 */
export const MULTILINGUAL = 'mul';

export type VoiceInfo = {
  /** The raw id within the provider, without the provider prefix */
  id: string;
  label: string;
  /** BCP-47, or MULTILINGUAL for a voice that speaks whatever it is given */
  locale: string;
};

/**
 * No speed: audio is always made at the voice's natural pace. Read Aloud's
 * own slider time-stretches it on playback, and a synthesis-time speed would
 * multiply with that (notes/NOTES.md, "Synthesis speed setting removed").
 */
export type SynthesisOptions = {
  voice: string;
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
  /**
   * Prove the account can actually synthesize — quota not exhausted, voice
   * accepted — with the smallest possible request (a couple of characters).
   * checkConnection cannot see this: a key lists voices fine long after its
   * quota ran out. Rejects with a SynthesisError whose kind tells quota
   * from auth from network.
   */
  checkSynthesis?(voice: string): Promise<void>;
  /**
   * Whether this configuration yields word timestamps, proven with a tiny
   * real synthesis (Test connection runs it with the first listed voice).
   * ok=false with a human-readable detail when the server answers but
   * without timestamps — a wrong server behind the Kokoro provider looks
   * exactly like that. Rejects like synthesize (auth, server down).
   */
  checkWordTimestamps?(voice: string): Promise<{ ok: boolean; detail?: string }>;
}
