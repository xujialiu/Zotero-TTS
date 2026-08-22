import { toZoteroError } from '../../core/providers/errors';
import type { ProviderId, SynthesisResult, TTSProvider, VoiceInfo } from '../../core/providers/types';
import { buildVoicesResponse, decodeVoiceId } from './voice-catalog';

export const SAMPLE_TEXT = 'The quick brown fox jumps over the lazy dog.';

/**
 * A stand-in used only when no AbortController factory was injected. It is a
 * plain object shaped like an AbortController whose signal can never fire, so
 * providers that call `signal.aborted` / `addEventListener` keep working. It
 * deliberately does NOT construct a real AbortController — that global does
 * not exist in the plugin sandbox, which is the whole reason this exists.
 */
function neverAbort(): { signal: AbortSignal } {
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
  return { signal: signal as unknown as AbortSignal };
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
   * How long to wait for Zotero's side of getVoices. Its promises never
   * reject — an exception inside leaves them pending — so without a limit
   * one failure there would freeze the voice list forever.
   */
  nativeTimeoutMs?: number;
};

const NO_CREDITS = { standardCreditsRemaining: null, premiumCreditsRemaining: null };
const DEFAULT_NATIVE_TIMEOUT_MS = 20_000;
const TIMED_OUT = Symbol('timed out');

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expiry = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  return Promise.race([promise, expiry]).finally(() => clearTimeout(timer));
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
    try {
      const catalog = await deps.listCatalog();
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
    try {
      const result = await withTimeout(iface.getVoices(), deps.nativeTimeoutMs ?? DEFAULT_NATIVE_TIMEOUT_MS);
      if (result === TIMED_OUT) {
        log(new Error("Zotero's Read Aloud voices did not arrive in time; continuing without them"));
        return null;
      }
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

  return {
    async getVoices() {
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

        const hit = await deps.cache?.match(key);
        if (hit) return { audio: hit.audio, timestamps: hit.timestamps };

        const provider = deps.getProvider(decoded.provider);
        const synthesized = await provider.synthesize(text, {
          voice: decoded.voiceId,
          speed,
          signal: (deps.newAbortController?.() ?? neverAbort()).signal,
        });
        // Move the audio into the caller's compartment BEFORE it is cached or
        // handed back; the provider's sandbox-owned Blob must not leak past
        // this line (see RemoteInterfaceDeps.adoptAudio).
        const result = deps.adoptAudio
          ? { ...synthesized, audio: deps.adoptAudio(synthesized.audio) }
          : synthesized;

        await deps.cache?.put(key, result);
        return { audio: result.audio, timestamps: result.timestamps };
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
