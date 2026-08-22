import { SynthesisError, toZoteroError } from '../../core/providers/errors';
import type { ProviderId, SynthesisResult, Timestamp, TTSProvider, VoiceInfo } from '../../core/providers/types';
import { withTimeout } from '../../core/timeout';
import { buildVoicesResponse, decodeVoiceId } from './voice-catalog';

export const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog.';

/**
 * A stand-in used only when no AbortController factory was injected. It is a
 * plain object shaped like an AbortController whose signal can never fire, so
 * providers that call `signal.aborted` / `addEventListener` keep working. It
 * deliberately does NOT construct a real AbortController — that global does
 * not exist in the plugin sandbox, which is the whole reason this exists.
 */
function neverAbort(): Pick<AbortController, 'signal' | 'abort'> {
  const signal = {
    aborted: false,
    reason: undefined,
    onabort: null,
    throwIfAborted() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
  };
  return { signal: signal as unknown as AbortSignal, abort() {} };
}

export interface AudioCache {
  match(key: string): Promise<SynthesisResult | null>;
  put(key: string, value: SynthesisResult): Promise<void>;
}

type ZoteroSegment = { text: string } | 'sample';
type ZoteroVoice = { id: string };

/**
 * Zotero's own interface for the same reader, as built by
 * ReaderInstance.prototype._getReadAloudRemoteInterface. Its methods return
 * promises of the reader window that resolve with objects cloned into that
 * window; they are awaited, never inspected.
 */
export interface NativeRemoteInterface {
  getVoices(): Promise<any>;
  getAudio(segment: ZoteroSegment, voice: ZoteroVoice): Promise<any>;
  getCreditsRemaining(): Promise<any>;
  resetCredits(): Promise<any>;
}

export type RemoteInterfaceDeps = {
  listCatalog(): Promise<{ provider: ProviderId; voices: VoiceInfo[] }[]>;
  getProvider(provider: ProviderId): TTSProvider;
  getSpeed(): number;
  cacheVersion(): string;
  cache?: AudioCache;
  /** Receives the raw error before it is collapsed to a Zotero error string. */
  log?(e: unknown): void;
  /** One line per synthesized segment, for the debug output: which provider, how many word timestamps. */
  debug?(message: string): void;
  /**
   * Supplies the AbortController for each synthesis. Injected, never a bare
   * global: the plugin sandbox's whitelist (spec §2.10) has no AbortController,
   * so `new AbortController()` throws there — exactly like WebSocket. Optional
   * so unit tests can omit it; when absent, no signal is passed at all.
   */
  newAbortController?(): AbortController;
  /**
   * Re-creates the provider's Blob in whatever compartment the caller needs it
   * to live in (in Zotero: the chrome window). Applied before the audio is
   * cached or returned, so nothing outside this module ever touches the
   * sandbox-owned original. Optional: unit tests run in one compartment.
   */
  adoptAudio?(blob: Blob): Blob;
  /**
   * Builds Zotero's own interface for this reader, or returns null when
   * there is none. Called lazily, once. With it present, Zotero's Standard
   * and Premium voices, credits and audio pass straight through and the
   * plugin's voices are merged in under the local tier.
   */
  native?(): NativeRemoteInterface | null;
  /**
   * Called synchronously at the start of every getVoices, before anything is
   * awaited. Zotero calls getVoices from its loadVoices() and, on the same
   * tick, restores the persisted voice; whatever must be in place for that
   * restore (modes/hijack/memory-sync.ts) hooks in here.
   */
  onVoicesRequested?(): void;
  /**
   * How long to wait for Zotero's side of getVoices. Its promises never
   * reject — an exception inside leaves them pending — so without a limit
   * one failure there would freeze the voice list forever.
   */
  nativeTimeoutMs?: number;
  /** How long one segment may take to synthesize before it is reported as a network error. */
  synthesisTimeoutMs?: number;
  /** How long listing the plugin's voices may take before the plugin's side of the catalog is given up. */
  catalogTimeoutMs?: number;
};

const NO_CREDITS = { standardCreditsRemaining: null, premiumCreditsRemaining: null };
const DEFAULT_NATIVE_TIMEOUT_MS = 20_000;
const DEFAULT_SYNTHESIS_TIMEOUT_MS = 60_000;
const DEFAULT_CATALOG_TIMEOUT_MS = 30_000;

const seconds = (ms: number) => `${Math.round(ms / 1000)} s`;

/**
 * End time of the whole-segment timestamp. Zotero drops a timestamp whose
 * end lies before the playback offset (RemoteReadAloudController
 * _scheduleWordEvents), so after a pause-and-resume the marker must still
 * be "in the future"; a day is longer than any segment.
 */
export const WHOLE_SEGMENT_END_SECONDS = 86_400;

/**
 * Zotero's word mode highlights the active word and nothing else — reader
 * _resolvePrimarySelector() returns the active word's position or null; it
 * never falls back to the sentence. So a segment without word timestamps
 * shows no highlight at all. One timestamp spanning the whole segment makes
 * word mode show the sentence, exactly what sentence mode shows. It is not
 * an estimate of any word's timing.
 */
function wholeSegmentTimestamp(text: string): Timestamp[] {
  return [{ start: 0, end: WHOLE_SEGMENT_END_SECONDS, charStart: 0, charEnd: text.length }];
}

export interface RemoteInterface {
  getVoices(): Promise<{
    voices?: Record<string, unknown[]>;
    error?: string;
    standardCreditsRemaining: number | null;
    premiumCreditsRemaining: number | null;
    devMode?: boolean;
  }>;
  getAudio(
    segment: ZoteroSegment,
    voice: ZoteroVoice,
  ): Promise<{ audio: Blob | null; timestamps?: unknown; error?: string; noStore?: boolean }>;
  getCreditsRemaining(): Promise<{ standardCreditsRemaining: number | null; premiumCreditsRemaining: number | null }>;
  resetCredits(): Promise<{ standardCreditsRemaining: number | null; premiumCreditsRemaining: number | null }>;
}

export function createRemoteInterface(deps: RemoteInterfaceDeps): RemoteInterface {
  const log = (e: unknown) => deps.log?.(e);

  // Zotero's interface, built on first use and kept: building it opens
  // Zotero's audio cache, which there is no reason to do twice.
  let nativeResolved = false;
  let nativeInterface: NativeRemoteInterface | null = null;
  const native = (): NativeRemoteInterface | null => {
    if (!nativeResolved) {
      nativeResolved = true;
      try {
        nativeInterface = deps.native?.() ?? null;
      } catch (e) {
        log(e);
        nativeInterface = null;
      }
    }
    return nativeInterface;
  };

  type VoicesResult = Awaited<ReturnType<RemoteInterface['getVoices']>>;

  async function ownVoices(): Promise<{ voices: Record<string, unknown[]> } | { error: string }> {
    const timeoutMs = deps.catalogTimeoutMs ?? DEFAULT_CATALOG_TIMEOUT_MS;
    try {
      const catalog = await withTimeout(
        deps.listCatalog(),
        timeoutMs,
        () => new SynthesisError('network', `Listing the plugin's voices took longer than ${seconds(timeoutMs)}`),
      );
      return { voices: buildVoicesResponse(catalog, deps.cacheVersion()) };
    } catch (e) {
      log(e);
      return { error: toZoteroError(e) };
    }
  }

  /** Zotero's voices, or null when they are unavailable for any reason (logged). */
  async function nativeVoices(): Promise<VoicesResult | null> {
    const iface = native();
    if (!iface) return null;
    const timeoutMs = deps.nativeTimeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS;
    try {
      const result = await withTimeout(
        iface.getVoices(),
        timeoutMs,
        () => new Error(`Zotero's Read Aloud voices did not arrive within ${seconds(timeoutMs)}; continuing without them`),
      );
      if (!result || result.error || !result.voices) {
        log(new Error(`Zotero's Read Aloud voices are unavailable: ${result?.error ?? 'no voices'}`));
        return null;
      }
      return result;
    } catch (e) {
      log(e);
      return null;
    }
  }

  async function synthesize(
    providerId: ProviderId,
    voiceId: string,
    text: string,
    speed: number,
    cacheKey: string,
  ): Promise<SynthesisResult> {
    const provider = deps.getProvider(providerId);
    const controller = deps.newAbortController?.() ?? neverAbort();
    const timeoutMs = deps.synthesisTimeoutMs ?? DEFAULT_SYNTHESIS_TIMEOUT_MS;
    // A provider that never answers must surface as an error, not as a
    // spinner that never stops; the abort also stops the request itself.
    const synthesized = await withTimeout(
      provider.synthesize(text, { voice: voiceId, speed, signal: controller.signal }),
      timeoutMs,
      () => new SynthesisError('network', `${providerId}: no audio within ${seconds(timeoutMs)}`),
      () => controller.abort(),
    );
    // Move the audio into the caller's compartment BEFORE it is cached or
    // handed back; the provider's sandbox-owned Blob must not leak past
    // this line (see RemoteInterfaceDeps.adoptAudio).
    const result = deps.adoptAudio ? { ...synthesized, audio: deps.adoptAudio(synthesized.audio) } : synthesized;
    await deps.cache?.put(cacheKey, result);
    return result;
  }

  return {
    async getVoices() {
      try {
        deps.onVoicesRequested?.();
      } catch (e) {
        log(e);
      }
      const [theirs, mine] = await Promise.all([nativeVoices(), ownVoices()]);
      if (!theirs && 'error' in mine) {
        // RemoteReadAloudProvider checks `error || !voices` and throws,
        // so we return an error field here instead of throwing ourselves.
        return { error: mine.error, ...NO_CREDITS };
      }
      const voices: Record<string, unknown[]> = { ...(theirs?.voices ?? {}) };
      if ('voices' in mine) {
        for (const [tier, configs] of Object.entries(mine.voices)) {
          voices[tier] = [...(voices[tier] ?? []), ...configs];
        }
      }
      return {
        voices,
        standardCreditsRemaining: theirs?.standardCreditsRemaining ?? null,
        premiumCreditsRemaining: theirs?.premiumCreditsRemaining ?? null,
        devMode: theirs?.devMode ?? false,
      };
    },

    async getAudio(segment, voice) {
      const decoded = decodeVoiceId(voice?.id ?? '');
      if (!decoded) {
        // Not one of ours: Zotero's own voice, handled by Zotero's own code
        const iface = native();
        if (!iface) return { audio: null, error: 'unknown' };
        try {
          return await iface.getAudio(segment, voice);
        } catch (e) {
          log(e);
          return { audio: null, error: 'unknown' };
        }
      }

      try {
        const text = segment === 'sample' ? SAMPLE_TEXT : segment.text;
        const speed = deps.getSpeed();
        const cacheVersion = deps.cacheVersion();
        const key = JSON.stringify([cacheVersion, decoded.provider, decoded.voiceId, speed, text]);

        // The cache holds exactly what the provider produced; the sentence
        // fallback below is applied on the way out, never stored.
        const hit = await deps.cache?.match(key);
        const result = hit ?? (await synthesize(decoded.provider, decoded.voiceId, text, speed, key));

        const words = result.timestamps?.length ?? 0;
        deps.debug?.(
          words
            ? `${decoded.provider}: ${words} word timestamp${words === 1 ? '' : 's'} for ${text.length} chars${hit ? ' (cached)' : ''}`
            : `${decoded.provider}: no word timestamps for ${text.length} chars, highlighting the sentence${hit ? ' (cached)' : ''}`,
        );
        return { audio: result.audio, timestamps: words ? result.timestamps : wholeSegmentTimestamp(text) };
      } catch (e) {
        // toZoteroError collapses every failure into the three strings
        // Zotero's UI understands, so the real cause is gone by the time the
        // user sees "unknown error". Record it before collapsing.
        log(e);
        return { audio: null, error: toZoteroError(e) };
      }
    },

    async getCreditsRemaining() {
      const iface = native();
      if (!iface) return NO_CREDITS;
      try {
        return await iface.getCreditsRemaining();
      } catch (e) {
        log(e);
        return NO_CREDITS;
      }
    },

    async resetCredits() {
      const iface = native();
      if (!iface) return NO_CREDITS;
      try {
        return await iface.resetCredits();
      } catch (e) {
        log(e);
        return NO_CREDITS;
      }
    },
  };
}
