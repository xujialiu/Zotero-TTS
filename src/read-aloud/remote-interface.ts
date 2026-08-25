import { SynthesisError, toZoteroError } from '../core/providers/errors';
import { silentWav } from '../core/silence';
import type { ProviderId, SynthesisResult, Timestamp, TTSProvider, VoiceInfo } from '../core/providers/types';
import { withTimeout } from '../core/timeout';
import { filterCatalogToFavorites } from './favorites';
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
  listCatalog(): Promise<{ provider: ProviderId; name?: string; voices: VoiceInfo[] }[]>;
  /** Zotero's own Local voices are hidden (read-aloud/system-voices.ts); the plugin's labels then drop their TTS- prefix. Read per call. */
  getHideZoteroLocalVoices?(): boolean;
  /**
   * The favorite voice ids while "offer only favorites" is on; null (or
   * empty) offers everything. Read per call so the pane switch applies at
   * the next popup open. Favorites that match nothing listed also offer
   * everything (read-aloud/favorites.ts) — the tier must never come up empty.
   */
  getFavoriteVoices?(): readonly string[] | null;
  getProvider(provider: ProviderId): TTSProvider;
  cacheVersion(): string;
  cache?: AudioCache;
  /**
   * The prefetch setting, read per call so the pane applies at once.
   * Zotero's own player prefetches a hard-coded 3 segments ahead
   * (RemoteReadAloudController._prefetchFrom, MAX_WINDOW = 3); this warms
   * the cache `count` segments beyond whatever Zotero last asked for, which
   * is what keeps slow servers ahead of playback.
   */
  getPrefetch?(): { enabled: boolean; count: number };
  /**
   * The texts of the segments that follow the one just requested, in
   * reading order, at most `count`; [] when the reader cannot say. Reaches
   * into the reader's segment list, so it lives with the Zotero glue.
   */
  getUpcomingTexts?(text: string, count: number): string[];
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
   * restore (read-aloud/memory-sync.ts) hooks in here.
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

/**
 * Segments this short — a section number, a list marker, "No." — are where
 * some servers fail outright: Chatterbox-TTS-Server answers HTTP 500 for
 * inputs of one or two tokens (its alignment analyzer needs more), while
 * every longer sentence is fine. Such a failure costs the user the whole
 * playback, so it becomes a short pause instead. Longer segments that fail
 * still surface the error: that is a real problem, not a quirk.
 */
export const TINY_SEGMENT_CHARS = 8;
export const SILENT_PAUSE_MS = 400;

/** The trimmed text of a segment short enough to be skipped, else null. Never throws. */
function tinySegmentText(segment: unknown): string | null {
  const text = (segment as { text?: unknown } | null)?.text;
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  return trimmed.length > 0 && trimmed.length <= TINY_SEGMENT_CHARS ? trimmed : null;
}

/** A failure the server itself produced for this text — not a key, network or quota problem, which a pause would only hide. */
function isServerRefusal(e: unknown): e is SynthesisError {
  return e instanceof SynthesisError && (e.kind === 'unknown' || e.kind === 'decode-failed');
}
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
      const offered = filterCatalogToFavorites(catalog, deps.getFavoriteVoices?.() ?? []);
      return {
        voices: buildVoicesResponse(offered, deps.cacheVersion(), {
          plainLabels: deps.getHideZoteroLocalVoices?.() ?? false,
        }),
      };
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
    cacheKey: string,
  ): Promise<SynthesisResult> {
    const provider = deps.getProvider(providerId);
    const controller = deps.newAbortController?.() ?? neverAbort();
    const timeoutMs = deps.synthesisTimeoutMs ?? DEFAULT_SYNTHESIS_TIMEOUT_MS;
    // A provider that never answers must surface as an error, not as a
    // spinner that never stops; the abort also stops the request itself.
    const synthesized = await withTimeout(
      provider.synthesize(text, { voice: voiceId, signal: controller.signal }),
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

  const cacheKeyFor = (providerId: ProviderId, voiceId: string, text: string) =>
    JSON.stringify([deps.cacheVersion(), providerId, voiceId, text]);

  /**
   * One synthesis per cache key, however many callers ask. Zotero prefetches
   * up to two segments concurrently and the plugin's own warmer runs beside
   * them; without this, the same sentence would be synthesized (and billed)
   * more than once. Registered synchronously, before the cache is consulted,
   * so two calls interleaving at the await cannot both start a synthesis.
   */
  const pending = new Map<string, Promise<{ result: SynthesisResult; cached: boolean }>>();
  function ensureAudio(providerId: ProviderId, voiceId: string, text: string): Promise<{ result: SynthesisResult; cached: boolean }> {
    const key = cacheKeyFor(providerId, voiceId, text);
    const existing = pending.get(key);
    if (existing) return existing;
    const job = (async () => {
      const hit = await deps.cache?.match(key);
      if (hit) return { result: hit, cached: true };
      return { result: await synthesize(providerId, voiceId, text, key), cached: false };
    })();
    pending.set(key, job);
    void job.finally(() => pending.delete(key)).catch(() => {});
    return job;
  }

  /**
   * Warm the cache for the segments after `text`, one at a time — the
   * playback request must never queue behind a burst of prefetches, and a
   * slow server gets one warm request, not `count` at once. Segments that
   * are already cached or already being fetched are *skipped, not joined*:
   * Zotero's own player slides a parallel three-segment window
   * (_prefetchFrom), and a chain that waited on those fetches would trail
   * it forever and never reach the segments beyond — which are the whole
   * point of a count above three (verified live: the joined chain produced
   * zero cache hits). One chain at a time; a chain started by a later
   * segment picks up where this one ends. Failures are logged and end the
   * chain — playback will surface the error when it gets there.
   */
  let warming = false;
  function prefetchAfter(providerId: ProviderId, voiceId: string, text: string): void {
    const cfg = deps.getPrefetch?.();
    if (!cfg?.enabled || cfg.count < 1 || !deps.cache || warming) return;
    const texts = (deps.getUpcomingTexts?.(text, cfg.count) ?? []).filter(
      (t) => typeof t === 'string' && t.trim().length > TINY_SEGMENT_CHARS,
    );
    if (!texts.length) return;
    warming = true;
    void (async () => {
      try {
        for (const t of texts) {
          const key = cacheKeyFor(providerId, voiceId, t);
          if (pending.has(key)) continue;
          if (await deps.cache?.match(key)) continue;
          const { cached } = await ensureAudio(providerId, voiceId, t);
          if (!cached) deps.debug?.(`prefetch: ${providerId}: ${t.length} chars ready ahead of playback`);
        }
      } catch (e) {
        log(e);
      } finally {
        warming = false;
      }
    })();
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

        // The cache holds exactly what the provider produced; the sentence
        // fallback below is applied on the way out, never stored.
        const { result, cached } = await ensureAudio(decoded.provider, decoded.voiceId, text);
        if (segment !== 'sample') prefetchAfter(decoded.provider, decoded.voiceId, text);

        const words = result.timestamps?.length ?? 0;
        const why = !words && result.note ? ` (${result.note})` : '';
        deps.debug?.(
          words
            ? `${decoded.provider}: ${words} word timestamp${words === 1 ? '' : 's'} for ${text.length} chars${cached ? ' (cached)' : ''}`
            : `${decoded.provider}: no word timestamps for ${text.length} chars${why}, highlighting the sentence${cached ? ' (cached)' : ''}`,
        );
        return { audio: result.audio, timestamps: words ? result.timestamps : wholeSegmentTimestamp(text) };
      } catch (e) {
        // toZoteroError collapses every failure into the three strings
        // Zotero's UI understands, so the real cause is gone by the time the
        // user sees "unknown error". Record it before collapsing.
        log(e);
        const tiny = tinySegmentText(segment);
        if (tiny !== null && isServerRefusal(e)) {
          // Not cached: the cache holds what the provider produced, and a
          // server that learns to speak "1." should get the chance.
          const clip = silentWav(SILENT_PAUSE_MS);
          deps.debug?.(`${decoded.provider}: the server refused "${tiny}" (${e.message}); playing a ${SILENT_PAUSE_MS} ms pause instead`);
          return { audio: deps.adoptAudio ? deps.adoptAudio(clip) : clip, timestamps: wholeSegmentTimestamp(tiny) };
        }
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
