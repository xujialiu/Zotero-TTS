import { withTimeout } from '../core/timeout';

/**
 * Zotero's own Standard and Premium voices, listed and sampled the way
 * Zotero's reader does it — through Zotero's sync API client:
 *
 * - `client.getReadAloudVoices()` → `GET api/tts/voices`, the same format=2
 *   catalog the reader's `parseVoicesResponse` reads (voice.ts builds ours
 *   in that shape). It answers with or without an API key; the credit
 *   headers it also returns are of no interest here.
 * - `client.getReadAloudAudio('sample', id)` → `GET api/tts/sample`, which
 *   Zotero itself sends **without an API key** (syncAPIClient.js) — the
 *   sample is free and spends no credits. Its text is the server's own, so
 *   a Zotero voice does not speak core/sample-text.ts's sentence.
 *
 * Neither call needs a reader, only the client, so the settings pane lists
 * these voices whether or not a document is open. Zotero's own reader
 * additionally caches sample audio in the Cache API; the plugin must not
 * touch that from its sandbox (incident 3), so samples are kept in memory
 * by the browser instead.
 */

export const ZOTERO_TIERS = ['standard', 'premium'] as const;
export type ZoteroTier = (typeof ZOTERO_TIERS)[number];

export type ZoteroVoice = { id: string; label: string; locale: string; tier: ZoteroTier };

const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object';

/** The ids under one locale: a plain array, or the `{ default, other }` form, either half of which may be missing. */
function localeIds(entry: unknown): string[] {
  if (Array.isArray(entry)) return entry.filter((id): id is string => typeof id === 'string');
  if (!isRecord(entry)) return [];
  const half = (value: unknown) => (Array.isArray(value) ? value.filter((id): id is string => typeof id === 'string') : []);
  return [...half(entry.default), ...half(entry.other)];
}

/**
 * Flatten Zotero's format=2 voices response into one entry per voice and
 * locale, as the reader's own `parseVoicesResponse` does (reader bundle
 * 40519) — but only for the two cloud tiers. The `local` tier of that
 * response is not Zotero's: it is where the plugin's own voices are
 * published, and the operating system's Local voices never pass through
 * this response at all (read-aloud/system-voices.ts). Every field is
 * checked before it is read; Zotero's own parser spreads
 * `localeConfig.default` unguarded and throws on a response we tolerate.
 */
export function parseZoteroVoices(response: unknown): ZoteroVoice[] {
  const tiers = isRecord(response) ? response : {};
  const out: ZoteroVoice[] = [];
  const seen = new Set<string>();
  for (const tier of ZOTERO_TIERS) {
    const configs = tiers[tier];
    if (!Array.isArray(configs)) continue;
    for (const config of configs) {
      if (!isRecord(config) || !isRecord(config.locales)) continue;
      const voices = isRecord(config.voices) ? config.voices : {};
      for (const [locale, entry] of Object.entries(config.locales)) {
        for (const id of localeIds(entry)) {
          const info = voices[id];
          if (!info) continue;
          const key = `${tier}\n${locale}\n${id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const label = isRecord(info) && typeof info.label === 'string' && info.label ? info.label : id;
          out.push({ id, label, locale, tier });
        }
      }
    }
  }
  return out;
}

/** The two methods of Zotero's sync API client this uses (`Zotero.Sync.Runner.getAPIClient`). */
export interface ZoteroTTSClient {
  getReadAloudVoices(): Promise<{ voices?: unknown; error?: string } | null>;
  getReadAloudAudio(segment: 'sample', voiceId: string): Promise<{ audio?: unknown; error?: string } | null>;
}

export interface ZoteroVoiceServiceDeps {
  /** Zotero's API client, built per call because it carries the API key of the moment; null when Zotero has none. */
  client(): Promise<ZoteroTTSClient | null>;
  /**
   * Re-create the audio in the plugin's own compartment. Zotero builds the
   * Blob in the chrome window (syncAPIClient.js); everything downstream —
   * the sample player's data: URL above all — expects a sandbox Blob, like
   * every provider's.
   */
  adoptAudio?(audio: unknown): Promise<Blob>;
  /** How long each call may take; Zotero's client retries internally and would otherwise wait far longer. */
  timeoutMs?: number;
}

export interface ZoteroVoiceService {
  /** Zotero's Standard and Premium voices; [] when Zotero offers no client (not signed in to anything, no sync module). */
  listVoices(): Promise<ZoteroVoice[]>;
  /** One sample of Zotero's own, in the server's own words. */
  sample(voiceId: string): Promise<Blob>;
}

const DEFAULT_TIMEOUT_MS = 20_000;

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

export function createZoteroVoiceService(deps: ZoteroVoiceServiceDeps): ZoteroVoiceService {
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const bounded = <T>(promise: Promise<T>, what: string) =>
    withTimeout(promise, timeoutMs, () => new Error(`Zotero's ${what} did not answer within ${seconds(timeoutMs)}`));

  return {
    async listVoices() {
      const client = await deps.client();
      if (!client) return [];
      const result = await bounded(client.getReadAloudVoices(), 'own voices');
      // The client never rejects: every failure comes back as one of its
      // own short error strings ('network', 'unknown'), which is all the
      // detail there is to report.
      if (result?.error) throw new Error(`Zotero's own voices are unavailable (${result.error})`);
      return parseZoteroVoices(result?.voices);
    },

    async sample(voiceId) {
      const client = await deps.client();
      if (!client) throw new Error('Zotero has no API client to play its own voices with');
      const result = await bounded(client.getReadAloudAudio('sample', voiceId), 'sample');
      if (result?.error) throw new Error(`Zotero's sample failed (${result.error})`);
      const audio = result?.audio;
      if (!audio) throw new Error('Zotero returned no audio for this voice');
      return deps.adoptAudio ? await deps.adoptAudio(audio) : (audio as Blob);
    },
  };
}
