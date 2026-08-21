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
};

type ZoteroSegment = { text: string } | 'sample';
type ZoteroVoice = { id: string };

const NO_CREDITS = { standardCreditsRemaining: null, premiumCreditsRemaining: null };

export interface RemoteInterface {
  getVoices(): Promise<{
    voices?: Record<string, unknown[]>;
    error?: string;
    standardCreditsRemaining: null;
    premiumCreditsRemaining: null;
    devMode?: boolean;
  }>;
  getAudio(
    segment: ZoteroSegment,
    voice: ZoteroVoice,
  ): Promise<{ audio: Blob | null; timestamps?: unknown; error?: string; noStore?: boolean }>;
  getCreditsRemaining(): Promise<typeof NO_CREDITS>;
  resetCredits(): Promise<typeof NO_CREDITS>;
}

export function createRemoteInterface(deps: RemoteInterfaceDeps): RemoteInterface {
  return {
    async getVoices() {
      try {
        const catalog = await deps.listCatalog();
        return {
          voices: buildVoicesResponse(catalog, deps.cacheVersion()),
          ...NO_CREDITS,
          devMode: false,
        };
      } catch (e) {
        // RemoteReadAloudProvider 检查 `error || !voices` 并抛出，
        // 所以这里返回错误字段而不是自己抛。
        deps.log?.(e);
        return { error: toZoteroError(e), ...NO_CREDITS };
      }
    },

    async getAudio(segment, voice) {
      const decoded = decodeVoiceId(voice?.id ?? '');
      if (!decoded) {
        return { audio: null, error: 'unknown' };
      }

      try {
        const text = segment === 'sample' ? SAMPLE_TEXT : segment.text;
        const speed = deps.getSpeed();
        const cacheVersion = deps.cacheVersion();
        const key = JSON.stringify([cacheVersion, decoded.provider, decoded.voiceId, speed, text]);

        const hit = await deps.cache?.match(key);
        if (hit) return { audio: hit.audio, timestamps: hit.timestamps };

        const provider = deps.getProvider(decoded.provider);
        const result = await provider.synthesize(text, {
          voice: decoded.voiceId,
          speed,
          signal: (deps.newAbortController?.() ?? neverAbort()).signal,
        });

        await deps.cache?.put(key, result);
        return { audio: result.audio, timestamps: result.timestamps };
      } catch (e) {
        // toZoteroError collapses every failure into the three strings
        // Zotero's UI understands, so the real cause is gone by the time the
        // user sees "unknown error". Record it before collapsing.
        deps.log?.(e);
        return { audio: null, error: toZoteroError(e) };
      }
    },

    async getCreditsRemaining() {
      return NO_CREDITS;
    },

    async resetCredits() {
      return NO_CREDITS;
    },
  };
}
